package application

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/infrastructure"
	"github.com/yurythx/projeto-sophiia/internal/platform/audit"
	"github.com/yurythx/projeto-sophiia/internal/platform/outbox"
	"github.com/yurythx/projeto-sophiia/internal/platform/storage"
)

// ErrNotFound / ErrConflict são reexportados para o transporte mapear
// 404/409 sem depender do pacote infrastructure.
var (
	ErrNotFound = infrastructure.ErrNotFound
	ErrConflict = infrastructure.ErrConflict
)

const presignTTL = time.Hour

// Service orquestra os casos de uso do Portal do Servidor e do Studio do
// Instrutor: catálogo, heartbeat do player (buffer write-behind no Redis),
// upload resiliente de videoaula (presigned PUT + evento de
// transcodificação), consolidação de progresso e emissão de certificado
// (via evento course.completed consumido pelo worker).
type Service struct {
	repo         *infrastructure.PostgresRepository
	redisBuffer  *infrastructure.RedisBuffer
	storage      storage.Provider
	completion   *domain.TrainingCompletionPolicy
	outboxWriter *outbox.Writer
	auditWriter  *audit.Writer
	logger       *slog.Logger
	bucket       string
}

func NewService(
	repo *infrastructure.PostgresRepository,
	redisBuffer *infrastructure.RedisBuffer,
	storageProvider storage.Provider,
	outboxWriter *outbox.Writer,
	auditWriter *audit.Writer,
	logger *slog.Logger,
	bucket string,
) *Service {
	return &Service{
		repo:         repo,
		redisBuffer:  redisBuffer,
		storage:      storageProvider,
		completion:   domain.NewTrainingCompletionPolicy(),
		outboxWriter: outboxWriter,
		auditWriter:  auditWriter,
		logger:       logger,
		bucket:       bucket,
	}
}

// ---------------------------------------------------------------------------
// Catálogo & player
// ---------------------------------------------------------------------------

func (s *Service) ListCatalogSystems(ctx context.Context) ([]domain.SystemItem, error) {
	return s.repo.ListSystems(ctx)
}

func (s *Service) ListCatalogCourses(ctx context.Context, systemID uuid.UUID) ([]domain.Course, error) {
	return s.repo.ListCourses(ctx, systemID)
}

func (s *Service) RecordHeartbeat(ctx context.Context, userID, versionID, lessonID string, positionSeconds int) error {
	return s.redisBuffer.RecordHeartbeat(ctx, userID, versionID, lessonID, positionSeconds)
}

// GetTelemetryStats retorna a volumetria de consumo de vídeos extraída do Redis
func (s *Service) GetTelemetryStats(ctx context.Context) (*infrastructure.TelemetryStats, error) {
	return s.redisBuffer.GetTelemetryStats(ctx)
}

func (s *Service) ValidateCertificate(ctx context.Context, token string) (*domain.Certificate, error) {
	return s.repo.GetCertificateByToken(ctx, token)
}

// GetCourseOutline devolve a árvore módulos → lições de uma versão,
// anotada com status de vídeo e conclusão pelo usuário — o que o Portal
// usa para montar o player.
func (s *Service) GetCourseOutline(ctx context.Context, userID, versionID uuid.UUID) (*domain.CourseOutline, error) {
	return s.repo.CourseOutline(ctx, versionID, userID)
}

// ListMyCertificates lista os certificados do usuário.
func (s *Service) ListMyCertificates(ctx context.Context, userID uuid.UUID) ([]domain.Certificate, error) {
	return s.repo.ListUserCertificates(ctx, userID)
}

// CertificateDownloadURL gera uma URL pré-assinada de download do PDF de
// um certificado do próprio usuário (expira em 5 min).
func (s *Service) CertificateDownloadURL(ctx context.Context, userID, certID uuid.UUID) (string, error) {
	cert, err := s.repo.GetCertificateForUser(ctx, certID, userID)
	if err != nil {
		return "", err
	}
	url, err := s.storage.PresignedGetURL(ctx, s.bucket, cert.PDFStoragePath, 5*time.Minute)
	if err != nil {
		return "", fmt.Errorf("presign get url: %w", err)
	}
	return url, nil
}

// ---------------------------------------------------------------------------
// Studio do Instrutor — upload resiliente de videoaula
// ---------------------------------------------------------------------------

// UploadTicket é o retorno de CreateLessonUploadURL: o cliente faz PUT do
// MP4 direto no MinIO usando UploadURL e depois chama ConfirmLessonUpload
// com VideoAssetID.
type UploadTicket struct {
	VideoAssetID     uuid.UUID `json:"video_asset_id"`
	UploadURL        string    `json:"upload_url"`
	Bucket           string    `json:"bucket"`
	ObjectKey        string    `json:"object_key"`
	ExpiresInSeconds int       `json:"expires_in_seconds"`
}

// CreateLessonUploadURL gera a URL pré-assinada de PUT e registra o
// video_asset da lição no estado UPLOADING. Ainda NÃO emite evento — a
// transcodificação só é acionada depois que o cliente confirma que o PUT
// terminou (ConfirmLessonUpload), para o worker nunca baixar um objeto
// incompleto.
func (s *Service) CreateLessonUploadURL(ctx context.Context, actor *uuid.UUID, ip string, lessonID uuid.UUID) (*UploadTicket, error) {
	if _, err := s.repo.LessonCourseVersion(ctx, lessonID); err != nil {
		return nil, err // ErrNotFound se a lição não existe
	}

	objectKey := fmt.Sprintf("raw-uploads/%s/%s.mp4", lessonID, uuid.New())
	asset := &domain.VideoAsset{
		ID:       uuid.New(),
		LessonID: lessonID,
		Status:   domain.VideoStatusUploading,
		RawS3Key: objectKey,
	}
	if err := s.repo.CreateOrResetVideoAsset(ctx, asset); err != nil {
		return nil, fmt.Errorf("create video asset: %w", err)
	}

	url, err := s.storage.PresignedPutURL(ctx, s.bucket, objectKey, presignTTL)
	if err != nil {
		return nil, fmt.Errorf("presign put url: %w", err)
	}

	s.audit(ctx, actor, ip, "sophiia.video.upload_url_issued", "video_asset", asset.ID.String(), map[string]any{
		"lesson_id":  lessonID.String(),
		"object_key": objectKey,
	})

	return &UploadTicket{
		VideoAssetID:     asset.ID,
		UploadURL:        url,
		Bucket:           s.bucket,
		ObjectKey:        objectKey,
		ExpiresInSeconds: int(presignTTL.Seconds()),
	}, nil
}

// ---------------------------------------------------------------------------
// Studio do Instrutor — edição do catálogo
// ---------------------------------------------------------------------------

func (s *Service) CreateSystem(ctx context.Context, code, name, description string) (*domain.SystemItem, error) {
	return s.repo.CreateSystem(ctx, code, name, description)
}

func (s *Service) CreateCourse(ctx context.Context, systemID uuid.UUID, title, description string) (*domain.Course, error) {
	return s.repo.CreateCourse(ctx, systemID, title, description)
}

func (s *Service) CreateCourseVersion(ctx context.Context, courseID uuid.UUID, versionTag string, workloadHours int) (*domain.CourseVersion, error) {
	return s.repo.CreateCourseVersion(ctx, courseID, versionTag, workloadHours)
}

func (s *Service) CreateModule(ctx context.Context, versionID uuid.UUID, title string, orderIndex int) (*domain.ModuleItem, error) {
	return s.repo.CreateModule(ctx, versionID, title, orderIndex)
}

func (s *Service) CreateLesson(ctx context.Context, moduleID uuid.UUID, title, markdown string, mandatory bool, orderIndex int) (*domain.Lesson, error) {
	return s.repo.CreateLesson(ctx, moduleID, title, markdown, mandatory, orderIndex)
}

func (s *Service) PublishCourseVersion(ctx context.Context, actor *uuid.UUID, ip string, versionID uuid.UUID) error {
	if err := s.repo.PublishCourseVersion(ctx, versionID); err != nil {
		return err
	}
	s.audit(ctx, actor, ip, "sophiia.course_version.published", "course_version", versionID.String(), nil)
	return nil
}

// GetLessonVideo devolve o video_asset de uma lição (status da
// transcodificação) — usado pelo Studio para acompanhar o progresso após
// o upload.
func (s *Service) GetLessonVideo(ctx context.Context, lessonID uuid.UUID) (*domain.VideoAsset, error) {
	return s.repo.GetVideoAssetByLesson(ctx, lessonID)
}

// ConfirmLessonUpload marca o asset como PROCESSING e grava o evento
// "video.uploaded" no outbox — tudo na mesma transação, para que a
// transcodificação nunca seja enfileirada sem o estado do asset ter
// avançado (e vice-versa).
func (s *Service) ConfirmLessonUpload(ctx context.Context, actor *uuid.UUID, ip string, videoAssetID uuid.UUID) error {
	asset, err := s.repo.GetVideoAsset(ctx, videoAssetID)
	if err != nil {
		return err
	}
	switch asset.Status {
	case domain.VideoStatusReady, domain.VideoStatusProcessing:
		return nil // já confirmado — idempotente
	}

	tx, err := s.repo.Pool().Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := s.repo.MarkVideoProcessing(ctx, tx, videoAssetID); err != nil {
		return err
	}

	payload := domain.VideoUploadedPayload{
		VideoAssetID: asset.ID,
		LessonID:     asset.LessonID,
		Bucket:       s.bucket,
		RawS3Key:     asset.RawS3Key,
	}
	if s.outboxWriter != nil {
		if err := s.outboxWriter.Write(ctx, tx, domain.EventVideoUploaded, "video_asset", asset.ID.String(), uuid.Nil, payload); err != nil {
			return fmt.Errorf("write outbox video.uploaded: %w", err)
		}
	}

	if err := audit.NewWriter(tx).Record(ctx, audit.Entry{
		UserID:       actor,
		Action:       "sophiia.video.upload_confirmed",
		ResourceType: "video_asset",
		ResourceID:   asset.ID.String(),
		Metadata:     map[string]any{"lesson_id": asset.LessonID.String()},
		IPAddress:    ip,
	}); err != nil {
		return fmt.Errorf("audit: %w", err)
	}

	return tx.Commit(ctx)
}

// ---------------------------------------------------------------------------
// Portal — conclusão de lição / consolidação de progresso
// ---------------------------------------------------------------------------

// ProgressResult resume o estado consolidado após concluir uma lição.
type ProgressResult struct {
	CourseVersionID    uuid.UUID `json:"course_version_id"`
	CompletedMandatory int       `json:"completed_mandatory_lessons"`
	TotalMandatory     int       `json:"total_mandatory_lessons"`
	ProgressPercentage float64   `json:"progress_percentage"`
	IsCompleted        bool      `json:"is_completed"`
	CertificateQueued  bool      `json:"certificate_queued"`
}

// CompleteLesson registra a conclusão de uma lição pelo servidor,
// recalcula o progresso consolidado com a TrainingCompletionPolicy e, na
// transição para concluído, grava "course.completed" no outbox (o worker
// de certificado gera o PDF a partir daí). Tudo numa única transação.
func (s *Service) CompleteLesson(ctx context.Context, actor *uuid.UUID, ip string, userID, lessonID uuid.UUID) (*ProgressResult, error) {
	versionID, err := s.repo.LessonCourseVersion(ctx, lessonID)
	if err != nil {
		return nil, err
	}

	tx, err := s.repo.Pool().Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := s.repo.MarkLessonCompleted(ctx, tx, userID, lessonID, versionID); err != nil {
		return nil, err
	}

	completed, total, err := s.repo.MandatoryLessonCounts(ctx, tx, userID, versionID)
	if err != nil {
		return nil, err
	}

	var pct float64
	var isCompleted bool
	if total > 0 {
		pct, isCompleted, err = s.completion.CalculateProgress(completed, total)
		if err != nil {
			return nil, fmt.Errorf("completion policy: %w", err)
		}
	}

	wasCompleted, err := s.repo.WasCourseAlreadyCompleted(ctx, tx, userID, versionID)
	if err != nil {
		return nil, err
	}

	var completedAt *time.Time
	if isCompleted {
		now := time.Now()
		completedAt = &now
	}
	if err := s.repo.SaveProgress(ctx, tx, &domain.UserCourseProgress{
		UserID:                userID,
		CourseVersionID:       versionID,
		CompletedLessonsCount: completed,
		TotalLessonsCount:     total,
		ProgressPercentage:    pct,
		IsCompleted:           isCompleted,
		CompletedAt:           completedAt,
	}); err != nil {
		return nil, err
	}

	certQueued := isCompleted && !wasCompleted
	if certQueued {
		if err := s.outboxWriter.Write(ctx, tx, domain.EventCourseCompleted, "course_version", versionID.String(), uuid.Nil,
			domain.CourseCompletedPayload{UserID: userID, CourseVersionID: versionID}); err != nil {
			return nil, fmt.Errorf("write outbox course.completed: %w", err)
		}
	}

	if err := audit.NewWriter(tx).Record(ctx, audit.Entry{
		UserID:       actor,
		Action:       "sophiia.lesson.completed",
		ResourceType: "lesson",
		ResourceID:   lessonID.String(),
		Metadata: map[string]any{
			"course_version_id": versionID.String(),
			"progress":          pct,
			"course_completed":  certQueued,
		},
		IPAddress: ip,
	}); err != nil {
		return nil, fmt.Errorf("audit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &ProgressResult{
		CourseVersionID:    versionID,
		CompletedMandatory: completed,
		TotalMandatory:     total,
		ProgressPercentage: pct,
		IsCompleted:        isCompleted,
		CertificateQueued:  certQueued,
	}, nil
}

// IsNotFound informa se err representa "registro não encontrado".
func IsNotFound(err error) bool { return errors.Is(err, ErrNotFound) }

// IsConflict informa se err representa "registro já existe" (violação de
// unicidade).
func IsConflict(err error) bool { return errors.Is(err, ErrConflict) }

// audit grava uma entrada isolada (fora de transação), engolindo o erro
// após logar — auditoria de um caminho de leitura/emissão de URL não deve
// derrubar a operação.
func (s *Service) audit(ctx context.Context, actor *uuid.UUID, ip, action, resourceType, resourceID string, metadata map[string]any) {
	if s.auditWriter == nil {
		return
	}
	if err := s.auditWriter.Record(ctx, audit.Entry{
		UserID:       actor,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Metadata:     metadata,
		IPAddress:    ip,
	}); err != nil {
		s.logger.Warn("sophiia: falha ao gravar auditoria", slog.String("action", action), slog.Any("error", err))
	}
}
