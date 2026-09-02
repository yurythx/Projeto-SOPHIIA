package application

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/yurythx/projeto-sophiia/internal/domain/events"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/infrastructure"
)

var discard = slog.New(slog.NewTextHandler(io.Discard, nil))

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type fakeRepo struct {
	mu             sync.Mutex
	processed      map[string]bool
	markErr        error
	unmarkCalls    int
	updateCalls    []string
	progressCalls  []int
	failStaleCalls int
	failStaleN     int
	certExists     bool
	issueData      *domain.CertificateIssueData
	inserted       bool
	insertedCert   *domain.Certificate
	// CertWorker: captura da chamada transacional IssueCertificate.
	issueCalls    int
	notifyType    string
	notifyPayload domain.NotificationCreatedPayload
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		processed: map[string]bool{},
		inserted:  true,
		issueData: &domain.CertificateIssueData{
			UserName: "Fulano", UserEmail: "fulano@muni.gov",
			CourseTitle: "Curso X", VersionTag: "1.0", WorkloadHours: 20,
		},
	}
}

func (f *fakeRepo) key(id uuid.UUID, c string) string { return id.String() + "|" + c }

func (f *fakeRepo) MarkEventProcessed(_ context.Context, id uuid.UUID, c string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.markErr != nil {
		return false, f.markErr
	}
	if f.processed[f.key(id, c)] {
		return false, nil
	}
	f.processed[f.key(id, c)] = true
	return true, nil
}

func (f *fakeRepo) UnmarkEventProcessed(_ context.Context, id uuid.UUID, c string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unmarkCalls++
	delete(f.processed, f.key(id, c))
	return nil
}

func (f *fakeRepo) UpdateVideoAssetResult(_ context.Context, _ uuid.UUID, status domain.VideoStatus, hls, msg string, _ int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateCalls = append(f.updateCalls, string(status)+"|"+hls+"|"+msg)
	return nil
}

func (f *fakeRepo) UpdateVideoAssetProgress(_ context.Context, _ uuid.UUID, percent int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.progressCalls = append(f.progressCalls, percent)
	return nil
}

func (f *fakeRepo) FailStaleProcessing(_ context.Context, _ time.Duration) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failStaleCalls++
	return f.failStaleN, nil
}

func (f *fakeRepo) CertificateExists(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return f.certExists, nil
}

func (f *fakeRepo) CertificateIssueData(context.Context, uuid.UUID, uuid.UUID) (*domain.CertificateIssueData, error) {
	return f.issueData, nil
}

func (f *fakeRepo) IssueCertificate(_ context.Context, cert *domain.Certificate, evType string, p domain.NotificationCreatedPayload) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.issueCalls++
	f.insertedCert = cert
	if !f.inserted {
		// Corrida: nada é inserido nem enfileirado.
		return false, nil
	}
	f.notifyType = evType
	f.notifyPayload = p
	return true, nil
}

type fakeStorage struct {
	mu      sync.Mutex
	puts    []string
	deletes []string
}

func (s *fakeStorage) Put(_ context.Context, _, object string, r io.Reader, _ int64, _ string) error {
	_, _ = io.Copy(io.Discard, r)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.puts = append(s.puts, object)
	return nil
}

func (s *fakeStorage) Get(context.Context, string, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("fake-bytes")), nil
}

func (s *fakeStorage) Delete(_ context.Context, _, object string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deletes = append(s.deletes, object)
	return nil
}

func (s *fakeStorage) PresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "https://minio.local/put", nil
}

func (s *fakeStorage) PresignedGetURL(context.Context, string, string, time.Duration) (string, error) {
	return "https://minio.local/get", nil
}

type fakeTranscoder struct{ err error }

func (t *fakeTranscoder) TranscodeToHLS(_ context.Context, _, outputDir string, onProgress func(int)) (string, error) {
	if t.err != nil {
		return "", t.err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", err
	}
	if onProgress != nil {
		onProgress(50)
		onProgress(100)
	}
	master := filepath.Join(outputDir, "master.m3u8")
	if err := os.WriteFile(master, []byte("#EXTM3U"), 0o644); err != nil {
		return "", err
	}
	return master, nil
}

func (t *fakeTranscoder) ProbeDurationSeconds(context.Context, string) int { return 42 }

type fakePDF struct{ err error }

func (p *fakePDF) GeneratePDF(*domain.Certificate) ([]byte, error) {
	if p.err != nil {
		return nil, p.err
	}
	return []byte("%PDF-1.4 fake"), nil
}

type fakeEmail struct {
	mu   sync.Mutex
	sent []infrastructure.EmailMessage
	err  error
}

func (e *fakeEmail) Send(_ context.Context, msg infrastructure.EmailMessage) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.err != nil {
		return e.err
	}
	e.sent = append(e.sent, msg)
	return nil
}

func mkEvent(t *testing.T, typ string, payload any) events.Event {
	t.Helper()
	ev, err := events.New(typ, "test", uuid.New(), payload)
	if err != nil {
		t.Fatalf("events.New: %v", err)
	}
	return ev
}

// ---------------------------------------------------------------------------
// VideoWorker
// ---------------------------------------------------------------------------

func TestVideoWorker_HappyPath(t *testing.T) {
	repo := newFakeRepo()
	st := &fakeStorage{}
	w := NewVideoWorker(repo, st, &fakeTranscoder{}, discard)

	ev := mkEvent(t, domain.EventVideoUploaded, domain.VideoUploadedPayload{
		VideoAssetID: uuid.New(), LessonID: uuid.New(), Bucket: "b", RawS3Key: "raw-uploads/x.mp4",
	})
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(st.puts) == 0 {
		t.Fatal("esperava upload de segmentos HLS")
	}
	if len(repo.updateCalls) != 1 || !strings.HasPrefix(repo.updateCalls[0], "READY|") {
		t.Fatalf("esperava UpdateVideoAssetResult READY, obteve %v", repo.updateCalls)
	}
}

func TestVideoWorker_Idempotent(t *testing.T) {
	repo := newFakeRepo()
	st := &fakeStorage{}
	w := NewVideoWorker(repo, st, &fakeTranscoder{}, discard)
	ev := mkEvent(t, domain.EventVideoUploaded, domain.VideoUploadedPayload{VideoAssetID: uuid.New(), LessonID: uuid.New()})

	_ = w.Handle(context.Background(), ev)
	putsAfterFirst := len(st.puts)
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("segunda entrega: %v", err)
	}
	if len(st.puts) != putsAfterFirst {
		t.Fatal("segunda entrega do mesmo evento não deveria reprocessar")
	}
}

func TestVideoWorker_TranscodeFailureMarksFailedAndUnmarks(t *testing.T) {
	repo := newFakeRepo()
	w := NewVideoWorker(repo, &fakeStorage{}, &fakeTranscoder{err: errors.New("ffmpeg boom")}, discard)
	ev := mkEvent(t, domain.EventVideoUploaded, domain.VideoUploadedPayload{VideoAssetID: uuid.New(), LessonID: uuid.New()})

	err := w.Handle(context.Background(), ev)
	if err == nil {
		t.Fatal("esperava erro propagado para retry/DLQ")
	}
	if repo.unmarkCalls != 1 {
		t.Fatalf("esperava unmark da idempotência, unmarkCalls=%d", repo.unmarkCalls)
	}
	if len(repo.updateCalls) != 1 || !strings.HasPrefix(repo.updateCalls[0], "FAILED|") {
		t.Fatalf("esperava UpdateVideoAssetResult FAILED, obteve %v", repo.updateCalls)
	}
}

// ---------------------------------------------------------------------------
// CertWorker
// ---------------------------------------------------------------------------

func newCertWorker(repo certWorkerRepo, st *fakeStorage, pdf *fakePDF) *CertWorker {
	return NewCertWorker(repo, st, pdf, discard, "bucket")
}

func TestCertWorker_HappyPathIssuesAndNotifies(t *testing.T) {
	repo := newFakeRepo()
	st := &fakeStorage{}
	w := newCertWorker(repo, st, &fakePDF{})

	ev := mkEvent(t, domain.EventCourseCompleted, domain.CourseCompletedPayload{UserID: uuid.New(), CourseVersionID: uuid.New()})
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(st.puts) != 1 || !strings.HasPrefix(st.puts[0], "certificates/") {
		t.Fatalf("esperava upload do PDF em certificates/, obteve %v", st.puts)
	}
	if repo.insertedCert == nil || repo.insertedCert.ValidationToken == "" {
		t.Fatal("esperava IssueCertificate com token de validação")
	}
	// A notificação de e-mail é enfileirada DENTRO da transação de
	// IssueCertificate (outbox), não publicada direto no broker.
	if repo.issueCalls != 1 || repo.notifyType != domain.EventEmailRequested {
		t.Fatalf("esperava 1 IssueCertificate enfileirando %q, issueCalls=%d type=%q",
			domain.EventEmailRequested, repo.issueCalls, repo.notifyType)
	}
}

func TestCertWorker_AlreadyExistsSkips(t *testing.T) {
	repo := newFakeRepo()
	repo.certExists = true
	st := &fakeStorage{}
	w := newCertWorker(repo, st, &fakePDF{})

	ev := mkEvent(t, domain.EventCourseCompleted, domain.CourseCompletedPayload{UserID: uuid.New(), CourseVersionID: uuid.New()})
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(st.puts) != 0 || repo.issueCalls != 0 {
		t.Fatalf("certificado existente não deveria gerar PDF nem emitir (puts=%d issueCalls=%d)", len(st.puts), repo.issueCalls)
	}
}

func TestCertWorker_InsertRaceCleansUpOrphanPDF(t *testing.T) {
	repo := newFakeRepo()
	repo.inserted = false // corrida: outra entrega inseriu primeiro
	st := &fakeStorage{}
	w := newCertWorker(repo, st, &fakePDF{})

	ev := mkEvent(t, domain.EventCourseCompleted, domain.CourseCompletedPayload{UserID: uuid.New(), CourseVersionID: uuid.New()})
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if repo.notifyType != "" {
		t.Fatalf("corrida não deveria enfileirar notificação, notifyType=%q", repo.notifyType)
	}
	if len(st.deletes) != 1 {
		t.Fatalf("esperava remoção do PDF órfão, deletes=%v", st.deletes)
	}
}

// ---------------------------------------------------------------------------
// NotifyWorker
// ---------------------------------------------------------------------------

func TestNotifyWorker_SendsEmail(t *testing.T) {
	repo := newFakeRepo()
	mail := &fakeEmail{}
	w := NewNotifyWorker(repo, mail, discard)

	ev := mkEvent(t, domain.EventEmailRequested, domain.NotificationCreatedPayload{
		Kind: "certificate_issued", RecipientEmail: "srv@muni.gov", Title: "T", Body: "B",
	})
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(mail.sent) != 1 || mail.sent[0].To != "srv@muni.gov" {
		t.Fatalf("esperava 1 e-mail para srv@muni.gov, obteve %v", mail.sent)
	}
}

func TestNotifyWorker_NoRecipientSkips(t *testing.T) {
	repo := newFakeRepo()
	mail := &fakeEmail{}
	w := NewNotifyWorker(repo, mail, discard)

	ev := mkEvent(t, domain.EventEmailRequested, domain.NotificationCreatedPayload{Title: "T", Body: "B"})
	if err := w.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(mail.sent) != 0 {
		t.Fatal("sem destinatário não deveria enviar e-mail")
	}
}

func TestNotifyWorker_SendFailureUnmarksAndErrors(t *testing.T) {
	repo := newFakeRepo()
	mail := &fakeEmail{err: errors.New("smtp down")}
	w := NewNotifyWorker(repo, mail, discard)

	ev := mkEvent(t, domain.EventEmailRequested, domain.NotificationCreatedPayload{RecipientEmail: "x@y.z", Title: "T", Body: "B"})
	if err := w.Handle(context.Background(), ev); err == nil {
		t.Fatal("esperava erro propagado para retry")
	}
	if repo.unmarkCalls != 1 {
		t.Fatalf("esperava unmark da idempotência, unmarkCalls=%d", repo.unmarkCalls)
	}
}
