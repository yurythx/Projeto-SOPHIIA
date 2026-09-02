package application

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/yurythx/projeto-sophiia/internal/domain/events"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/platform/metrics"
	"github.com/yurythx/projeto-sophiia/internal/platform/storage"
)

// certPDFGenerator abstrai a geração do PDF (Maroto) para permitir teste
// da orquestração do CertWorker com um fake.
type certPDFGenerator interface {
	GeneratePDF(cert *domain.Certificate) ([]byte, error)
}

// CertWorker consome a fila sophiia.cert.generate (routing key
// "course.completed", prefetch 10): monta os snapshots imutáveis, gera o
// PDF vetorial com QR Code (Maroto v2), salva em certificates/ no MinIO e
// persiste a linha em certificates.
//
// Idempotência: a unicidade de (user_id, course_version_id) na tabela
// certificates é a chave — combinada com `INSERT ... ON CONFLICT DO
// NOTHING` dentro de repo.IssueCertificate, que na MESMA transação
// enfileira o evento de e-mail no outbox. NÃO usa processed_events: o
// marcador separado abria uma janela em que um crash entre "marcar
// processado" e "inserir certificado" deixava o evento como processado
// sem certificado emitido, e a reentrega era descartada (achado de
// auditoria). Agora ou o certificado E a notificação commitam juntos, ou
// a reentrega reprocessa.
type CertWorker struct {
	repo    certWorkerRepo
	storage storage.Provider
	pdfGen  certPDFGenerator
	logger  *slog.Logger
	bucket  string
}

func NewCertWorker(repo certWorkerRepo, storageProvider storage.Provider, pdfGen certPDFGenerator, logger *slog.Logger, bucket string) *CertWorker {
	return &CertWorker{
		repo:    repo,
		storage: storageProvider,
		pdfGen:  pdfGen,
		logger:  logger,
		bucket:  bucket,
	}
}

// Handle implementa events.MessageHandler.
func (w *CertWorker) Handle(ctx context.Context, event events.Event) error {
	var p domain.CourseCompletedPayload
	if err := event.UnmarshalPayload(&p); err != nil {
		w.logger.Error("sophiia cert worker: payload ilegível, descartando", slog.String("event_id", event.ID.String()), slog.Any("error", err))
		return nil
	}
	logger := w.logger.With(slog.String("user_id", p.UserID.String()), slog.String("course_version_id", p.CourseVersionID.String()))
	return w.issue(ctx, logger, p)
}

func (w *CertWorker) issue(ctx context.Context, logger *slog.Logger, p domain.CourseCompletedPayload) error {
	exists, err := w.repo.CertificateExists(ctx, p.UserID, p.CourseVersionID)
	if err != nil {
		return err
	}
	if exists {
		logger.Info("sophiia cert worker: certificado já emitido, ignorando")
		return nil
	}

	data, err := w.repo.CertificateIssueData(ctx, p.UserID, p.CourseVersionID)
	if err != nil {
		return err
	}

	token, err := randomToken()
	if err != nil {
		return err
	}

	cert := &domain.Certificate{
		ID:                    uuid.New(),
		ValidationToken:       token,
		UserID:                p.UserID,
		CourseVersionID:       p.CourseVersionID,
		UserNameSnapshot:      data.UserName,
		UserDocumentSnapshot:  data.UserDocument,
		CourseTitleSnapshot:   data.CourseTitle,
		VersionTagSnapshot:    data.VersionTag,
		WorkloadHoursSnapshot: data.WorkloadHours,
		Status:                domain.CertificateStatusValid,
		IssuedAt:              time.Now(),
	}
	cert.PDFStoragePath = fmt.Sprintf("certificates/%s.pdf", cert.ID)

	pdf, err := w.pdfGen.GeneratePDF(cert)
	if err != nil {
		return fmt.Errorf("gerar PDF: %w", err)
	}
	if err := w.storage.Put(ctx, w.bucket, cert.PDFStoragePath, bytes.NewReader(pdf), int64(len(pdf)), "application/pdf"); err != nil {
		return fmt.Errorf("salvar PDF no storage: %w", err)
	}

	// Notificação de "certificado emitido" — enfileirada no outbox DENTRO
	// da mesma transação do INSERT do certificado (ver
	// repo.IssueCertificate). Sem dual-write: antes o worker publicava
	// direto no RabbitMQ depois do commit, best-effort, e uma falha de
	// publicação perdia o e-mail para sempre.
	notify := domain.NotificationCreatedPayload{
		Kind:            "certificate_issued",
		RecipientUserID: p.UserID,
		RecipientEmail:  data.UserEmail,
		Title:           "Certificado emitido — " + data.CourseTitle,
		Body: fmt.Sprintf(
			"Olá %s,\n\nSeu certificado do treinamento %q (versão %s, carga horária de %dh) foi emitido.\n\nToken de validação: %s\n\nEquipe SOPHIIA.",
			data.UserName, data.CourseTitle, data.VersionTag, data.WorkloadHours, token,
		),
		Data: map[string]string{"validation_token": token, "certificate_id": cert.ID.String()},
	}

	inserted, err := w.repo.IssueCertificate(ctx, cert, domain.EventEmailRequested, notify)
	if err != nil {
		return err
	}
	if !inserted {
		// Corrida com outra entrega do mesmo evento — o certificado já
		// existe e nenhuma notificação foi enfileirada. Remove o PDF
		// órfão que acabamos de subir.
		_ = w.storage.Delete(ctx, w.bucket, cert.PDFStoragePath)
		logger.Info("sophiia cert worker: certificado inserido por outra entrega, PDF órfão removido")
		return nil
	}

	metrics.SophiiaCertificatesIssuedTotal.Inc()
	logger.Info("sophiia cert worker: certificado emitido", slog.String("certificate_id", cert.ID.String()))
	return nil
}

// randomToken gera um token opaco de 32 caracteres hex (16 bytes) para a
// URL de validação pública — cabe em certificates.validation_token
// VARCHAR(64).
func randomToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("gerar token de validação: %w", err)
	}
	return hex.EncodeToString(b), nil
}
