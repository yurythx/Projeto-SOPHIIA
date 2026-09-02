package infrastructure

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/platform/outbox"
)

// dbtx é satisfeita tanto por *pgxpool.Pool quanto por pgx.Tx, para que os
// mesmos métodos do repositório sirvam a leituras isoladas e a escritas
// atômicas dentro de uma transação de negócio (junto do outbox e da
// auditoria).
type dbtx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ErrNotFound é devolvido quando uma consulta por id/token não encontra linha.
var ErrNotFound = errors.New("sophiia: registro não encontrado")

// ErrConflict é devolvido quando uma escrita viola uma constraint de
// unicidade (ex.: código de sistema repetido, versão já existente).
var ErrConflict = errors.New("sophiia: registro já existe")

type PostgresRepository struct {
	db *pgxpool.Pool
	// outbox enfileira eventos na tabela outbox_events dentro de uma
	// transação de negócio (usado por IssueCertificate para tornar o
	// INSERT do certificado atômico com a notificação por e-mail). Pode
	// ser nil em testes que não exercitam esse caminho.
	outbox *outbox.Writer
}

func NewPostgresRepository(db *pgxpool.Pool, outboxWriter *outbox.Writer) *PostgresRepository {
	return &PostgresRepository{db: db, outbox: outboxWriter}
}

// Pool expõe o pool para quem precisa abrir a própria transação (o Service
// ao gravar dado de negócio + outbox + auditoria atomicamente).
func (r *PostgresRepository) Pool() *pgxpool.Pool { return r.db }

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

func (r *PostgresRepository) ListSystems(ctx context.Context) ([]domain.SystemItem, error) {
	const q = `SELECT id, code, name, COALESCE(description, ''), is_active, created_at FROM systems WHERE is_active ORDER BY name ASC`
	rows, err := r.db.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list systems: %w", err)
	}
	defer rows.Close()

	var items []domain.SystemItem
	for rows.Next() {
		var sys domain.SystemItem
		if err := rows.Scan(&sys.ID, &sys.Code, &sys.Name, &sys.Description, &sys.IsActive, &sys.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, sys)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) ListCourses(ctx context.Context, systemID uuid.UUID) ([]domain.Course, error) {
	const q = `
		SELECT c.id, c.system_id, c.title, COALESCE(c.description, ''), c.is_active, c.created_at,
		       cv.id, COALESCE(cv.workload_hours, 0)
		FROM courses c
		LEFT JOIN course_versions cv ON cv.course_id = c.id AND cv.is_current
		WHERE c.system_id = $1 AND c.is_active
		ORDER BY c.title ASC`
	rows, err := r.db.Query(ctx, q, systemID)
	if err != nil {
		return nil, fmt.Errorf("list courses: %w", err)
	}
	defer rows.Close()

	var courses []domain.Course
	for rows.Next() {
		var c domain.Course
		if err := rows.Scan(&c.ID, &c.SystemID, &c.Title, &c.Description, &c.IsActive, &c.CreatedAt, &c.CurrentVersionID, &c.WorkloadHours); err != nil {
			return nil, err
		}
		courses = append(courses, c)
	}
	return courses, rows.Err()
}

func (r *PostgresRepository) GetCourseVersion(ctx context.Context, versionID uuid.UUID) (*domain.CourseVersion, error) {
	const q = `SELECT id, course_id, version_tag, workload_hours, is_current, published_at, created_at FROM course_versions WHERE id = $1`
	var v domain.CourseVersion
	err := r.db.QueryRow(ctx, q, versionID).Scan(&v.ID, &v.CourseID, &v.VersionTag, &v.WorkloadHours, &v.IsCurrent, &v.PublishedAt, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get course version: %w", err)
	}
	return &v, nil
}

// LessonCourseVersion resolve a versão de curso a que uma lição pertence
// (lesson -> module -> course_version).
func (r *PostgresRepository) LessonCourseVersion(ctx context.Context, lessonID uuid.UUID) (uuid.UUID, error) {
	const q = `
		SELECT m.course_version_id
		FROM lessons l
		JOIN modules m ON m.id = l.module_id
		WHERE l.id = $1`
	var versionID uuid.UUID
	err := r.db.QueryRow(ctx, q, lessonID).Scan(&versionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("lesson course version: %w", err)
	}
	return versionID, nil
}

// ---------------------------------------------------------------------------
// Video assets
// ---------------------------------------------------------------------------

// CreateOrResetVideoAsset registra (ou reinicia) o asset de uma lição no
// estado UPLOADING com a nova raw key. Idempotente por lesson_id (UNIQUE).
func (r *PostgresRepository) CreateOrResetVideoAsset(ctx context.Context, asset *domain.VideoAsset) error {
	const q = `
		INSERT INTO video_assets (id, lesson_id, status, raw_s3_key, duration_seconds, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 0, now(), now())
		ON CONFLICT (lesson_id) DO UPDATE SET
			status = EXCLUDED.status,
			raw_s3_key = EXCLUDED.raw_s3_key,
			hls_master_key = NULL,
			error_message = NULL,
			processing_started_at = NULL,
			processing_completed_at = NULL,
			updated_at = now()
		RETURNING id`
	return r.db.QueryRow(ctx, q, asset.ID, asset.LessonID, asset.Status, asset.RawS3Key).Scan(&asset.ID)
}

func (r *PostgresRepository) GetVideoAsset(ctx context.Context, id uuid.UUID) (*domain.VideoAsset, error) {
	return scanVideoAsset(r.db.QueryRow(ctx,
		`SELECT id, lesson_id, status, COALESCE(raw_s3_key,''), COALESCE(hls_master_key,''), duration_seconds,
		        COALESCE(error_message,''), processing_started_at, processing_completed_at, created_at, updated_at
		 FROM video_assets WHERE id = $1`, id))
}

func (r *PostgresRepository) GetVideoAssetByLesson(ctx context.Context, lessonID uuid.UUID) (*domain.VideoAsset, error) {
	return scanVideoAsset(r.db.QueryRow(ctx,
		`SELECT id, lesson_id, status, COALESCE(raw_s3_key,''), COALESCE(hls_master_key,''), duration_seconds,
		        COALESCE(error_message,''), processing_started_at, processing_completed_at, created_at, updated_at
		 FROM video_assets WHERE lesson_id = $1`, lessonID))
}

func scanVideoAsset(row pgx.Row) (*domain.VideoAsset, error) {
	var a domain.VideoAsset
	err := row.Scan(&a.ID, &a.LessonID, &a.Status, &a.RawS3Key, &a.HLSMasterKey, &a.DurationSeconds,
		&a.ErrorMessage, &a.ProcessingStartedAt, &a.ProcessingCompletedAt, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan video asset: %w", err)
	}
	return &a, nil
}

// MarkVideoProcessing move o asset para PROCESSING e carimba
// processing_started_at. Aceita tx para rodar junto do outbox.
func (r *PostgresRepository) MarkVideoProcessing(ctx context.Context, q dbtx, assetID uuid.UUID) error {
	_, err := q.Exec(ctx, `
		UPDATE video_assets
		SET status = 'PROCESSING', processing_started_at = COALESCE(processing_started_at, now()),
		    error_message = NULL, updated_at = now()
		WHERE id = $1`, assetID)
	if err != nil {
		return fmt.Errorf("mark video processing: %w", err)
	}
	return nil
}

// UpdateVideoAssetResult grava o desfecho da transcodificação (READY com a
// master key + duração, ou FAILED com a mensagem de erro).
func (r *PostgresRepository) UpdateVideoAssetResult(ctx context.Context, assetID uuid.UUID, status domain.VideoStatus, hlsMasterKey, errMsg string, durationSeconds int) error {
	var completedAt *time.Time
	if status == domain.VideoStatusReady || status == domain.VideoStatusFailed {
		now := time.Now()
		completedAt = &now
	}
	_, err := r.db.Exec(ctx, `
		UPDATE video_assets
		SET status = $1,
		    hls_master_key = NULLIF($2, ''),
		    error_message = NULLIF($3, ''),
		    duration_seconds = $4,
		    processing_completed_at = $5,
		    updated_at = now()
		WHERE id = $6`, status, hlsMasterKey, errMsg, durationSeconds, completedAt, assetID)
	if err != nil {
		return fmt.Errorf("update video asset result: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Progresso & conclusão
// ---------------------------------------------------------------------------

// MandatoryLessonCounts retorna (concluídas, total) de lições OBRIGATÓRIAS
// da versão de curso para o usuário — a entrada da TrainingCompletionPolicy.
func (r *PostgresRepository) MandatoryLessonCounts(ctx context.Context, q dbtx, userID, versionID uuid.UUID) (completed, total int, err error) {
	const totalQ = `
		SELECT COUNT(*)
		FROM lessons l
		JOIN modules m ON m.id = l.module_id
		WHERE m.course_version_id = $1 AND l.is_mandatory`
	if err = q.QueryRow(ctx, totalQ, versionID).Scan(&total); err != nil {
		return 0, 0, fmt.Errorf("count mandatory lessons: %w", err)
	}
	const doneQ = `
		SELECT COUNT(*)
		FROM user_lesson_completion ulc
		JOIN lessons l ON l.id = ulc.lesson_id
		WHERE ulc.user_id = $1 AND ulc.course_version_id = $2 AND l.is_mandatory`
	if err = q.QueryRow(ctx, doneQ, userID, versionID).Scan(&completed); err != nil {
		return 0, 0, fmt.Errorf("count completed mandatory lessons: %w", err)
	}
	return completed, total, nil
}

// MarkLessonCompleted registra a conclusão de uma lição (idempotente).
func (r *PostgresRepository) MarkLessonCompleted(ctx context.Context, q dbtx, userID, lessonID, versionID uuid.UUID) error {
	_, err := q.Exec(ctx, `
		INSERT INTO user_lesson_completion (user_id, lesson_id, course_version_id, completed_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (user_id, lesson_id) DO NOTHING`, userID, lessonID, versionID)
	if err != nil {
		return fmt.Errorf("mark lesson completed: %w", err)
	}
	return nil
}

// WasCourseAlreadyCompleted informa se o progresso consolidado já estava
// marcado como concluído — usado para emitir "course.completed" só na
// transição (nunca duas vezes).
func (r *PostgresRepository) WasCourseAlreadyCompleted(ctx context.Context, q dbtx, userID, versionID uuid.UUID) (bool, error) {
	var done bool
	err := q.QueryRow(ctx, `SELECT is_completed FROM user_course_progress WHERE user_id = $1 AND course_version_id = $2`, userID, versionID).Scan(&done)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check course completed: %w", err)
	}
	return done, nil
}

// SaveProgress faz upsert do progresso consolidado.
func (r *PostgresRepository) SaveProgress(ctx context.Context, q dbtx, p *domain.UserCourseProgress) error {
	_, err := q.Exec(ctx, `
		INSERT INTO user_course_progress
			(user_id, course_version_id, completed_lessons_count, total_lessons_count, progress_percentage, is_completed, completed_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (user_id, course_version_id) DO UPDATE SET
			completed_lessons_count = EXCLUDED.completed_lessons_count,
			total_lessons_count = EXCLUDED.total_lessons_count,
			progress_percentage = EXCLUDED.progress_percentage,
			is_completed = EXCLUDED.is_completed,
			completed_at = COALESCE(user_course_progress.completed_at, EXCLUDED.completed_at),
			updated_at = now()`,
		p.UserID, p.CourseVersionID, p.CompletedLessonsCount, p.TotalLessonsCount, p.ProgressPercentage, p.IsCompleted, p.CompletedAt)
	if err != nil {
		return fmt.Errorf("save progress: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetProgress(ctx context.Context, userID, versionID uuid.UUID) (*domain.UserCourseProgress, error) {
	const q = `
		SELECT user_id, course_version_id, completed_lessons_count, total_lessons_count, progress_percentage, is_completed, completed_at, updated_at
		FROM user_course_progress WHERE user_id = $1 AND course_version_id = $2`
	var p domain.UserCourseProgress
	err := r.db.QueryRow(ctx, q, userID, versionID).Scan(
		&p.UserID, &p.CourseVersionID, &p.CompletedLessonsCount, &p.TotalLessonsCount,
		&p.ProgressPercentage, &p.IsCompleted, &p.CompletedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get progress: %w", err)
	}
	return &p, nil
}

// ---------------------------------------------------------------------------
// Certificados & idempotência
// ---------------------------------------------------------------------------

// CertificateIssueData resolve nome/documento do usuário e título/versão/
// carga horária do curso para preencher os snapshots do certificado.
func (r *PostgresRepository) CertificateIssueData(ctx context.Context, userID, versionID uuid.UUID) (*domain.CertificateIssueData, error) {
	const q = `
		SELECT COALESCE(NULLIF(u.display_name, ''), u.username), COALESCE(u.document_number, ''), COALESCE(u.email, ''),
		       c.title, cv.version_tag, cv.workload_hours
		FROM course_versions cv
		JOIN courses c ON c.id = cv.course_id
		CROSS JOIN users u
		WHERE cv.id = $1 AND u.id = $2`
	var d domain.CertificateIssueData
	err := r.db.QueryRow(ctx, q, versionID, userID).Scan(&d.UserName, &d.UserDocument, &d.UserEmail, &d.CourseTitle, &d.VersionTag, &d.WorkloadHours)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("certificate issue data: %w", err)
	}
	return &d, nil
}

// CertificateExists informa se já há certificado para (user, version) —
// checagem barata de idempotência antes de gerar o PDF.
func (r *PostgresRepository) CertificateExists(ctx context.Context, userID, versionID uuid.UUID) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM certificates WHERE user_id = $1 AND course_version_id = $2)`,
		userID, versionID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("certificate exists: %w", err)
	}
	return exists, nil
}

// IssueCertificate grava o certificado e, na MESMA transação, enfileira o
// evento de notificação por e-mail no outbox — os dois juntos ou nenhum.
// Substitui o antigo InsertCertificate + publish direto no RabbitMQ (que
// era um dual-write: o certificado commitava mas o e-mail podia se perder
// sem retry). ON CONFLICT DO NOTHING sobre uq_user_course_version_cert:
// se outra entrega do mesmo evento correu em paralelo, inserted=false,
// nada é enfileirado e o chamador descarta o PDF órfão.
func (r *PostgresRepository) IssueCertificate(ctx context.Context, cert *domain.Certificate, notifyEventType string, notify domain.NotificationCreatedPayload) (bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("issue certificate: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op depois de um Commit bem-sucedido

	ct, err := tx.Exec(ctx, `
		INSERT INTO certificates
			(id, validation_token, user_id, course_version_id, user_name_snapshot, user_document_snapshot,
			 course_title_snapshot, version_tag_snapshot, workload_hours_snapshot, status, pdf_storage_path, issued_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
		ON CONFLICT (user_id, course_version_id) DO NOTHING`,
		cert.ID, cert.ValidationToken, cert.UserID, cert.CourseVersionID,
		cert.UserNameSnapshot, cert.UserDocumentSnapshot, cert.CourseTitleSnapshot,
		cert.VersionTagSnapshot, cert.WorkloadHoursSnapshot, cert.Status, cert.PDFStoragePath)
	if err != nil {
		return false, fmt.Errorf("issue certificate: insert: %w", err)
	}
	if ct.RowsAffected() == 0 {
		// Corrida: outra entrega já emitiu. Commit vazio, nada a enfileirar.
		return false, tx.Commit(ctx)
	}

	if r.outbox != nil {
		if err := r.outbox.Write(ctx, tx, notifyEventType, "certificate", cert.ID.String(), uuid.Nil, notify); err != nil {
			return false, fmt.Errorf("issue certificate: enqueue notification: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("issue certificate: commit: %w", err)
	}
	return true, nil
}

// ListUserCertificates retorna os certificados emitidos para o usuário,
// mais recentes primeiro.
func (r *PostgresRepository) ListUserCertificates(ctx context.Context, userID uuid.UUID) ([]domain.Certificate, error) {
	const q = `
		SELECT id, validation_token, user_id, course_version_id, user_name_snapshot, user_document_snapshot,
		       course_title_snapshot, version_tag_snapshot, workload_hours_snapshot, status, pdf_storage_path, issued_at, revoked_at
		FROM certificates WHERE user_id = $1 ORDER BY issued_at DESC`
	rows, err := r.db.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("list user certificates: %w", err)
	}
	defer rows.Close()

	var out []domain.Certificate
	for rows.Next() {
		var c domain.Certificate
		if err := rows.Scan(&c.ID, &c.ValidationToken, &c.UserID, &c.CourseVersionID,
			&c.UserNameSnapshot, &c.UserDocumentSnapshot, &c.CourseTitleSnapshot,
			&c.VersionTagSnapshot, &c.WorkloadHoursSnapshot, &c.Status,
			&c.PDFStoragePath, &c.IssuedAt, &c.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCertificateForUser busca um certificado por id garantindo que
// pertence ao usuário — usado pelo download do PDF no Portal.
func (r *PostgresRepository) GetCertificateForUser(ctx context.Context, id, userID uuid.UUID) (*domain.Certificate, error) {
	const q = `
		SELECT id, validation_token, user_id, course_version_id, user_name_snapshot, user_document_snapshot,
		       course_title_snapshot, version_tag_snapshot, workload_hours_snapshot, status, pdf_storage_path, issued_at, revoked_at
		FROM certificates WHERE id = $1 AND user_id = $2`
	var c domain.Certificate
	err := r.db.QueryRow(ctx, q, id, userID).Scan(
		&c.ID, &c.ValidationToken, &c.UserID, &c.CourseVersionID,
		&c.UserNameSnapshot, &c.UserDocumentSnapshot, &c.CourseTitleSnapshot,
		&c.VersionTagSnapshot, &c.WorkloadHoursSnapshot, &c.Status,
		&c.PDFStoragePath, &c.IssuedAt, &c.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get certificate for user: %w", err)
	}
	return &c, nil
}

// CourseOutline monta a árvore módulos → lições de uma versão, anotada com
// o status do vídeo e a conclusão pelo usuário. Uma consulta só, montada
// em memória.
func (r *PostgresRepository) CourseOutline(ctx context.Context, versionID, userID uuid.UUID) (*domain.CourseOutline, error) {
	const q = `
		SELECT m.id, m.title, m.order_index,
		       l.id, l.title, l.is_mandatory, l.order_index,
		       va.status, COALESCE(va.hls_master_key, ''),
		       (ulc.user_id IS NOT NULL) AS completed
		FROM modules m
		JOIN lessons l ON l.module_id = m.id
		LEFT JOIN video_assets va ON va.lesson_id = l.id
		LEFT JOIN user_lesson_completion ulc ON ulc.lesson_id = l.id AND ulc.user_id = $2
		WHERE m.course_version_id = $1
		ORDER BY m.order_index, m.id, l.order_index, l.id`
	rows, err := r.db.Query(ctx, q, versionID, userID)
	if err != nil {
		return nil, fmt.Errorf("course outline: %w", err)
	}
	defer rows.Close()

	outline := &domain.CourseOutline{CourseVersionID: versionID}
	idxByModule := map[uuid.UUID]int{}
	for rows.Next() {
		var (
			mID          uuid.UUID
			mTitle       string
			mOrder       int
			lID          uuid.UUID
			lTitle       string
			lMandatory   bool
			lOrder       int
			vStatus      *string
			hlsMasterKey string
			completed    bool
		)
		if err := rows.Scan(&mID, &mTitle, &mOrder, &lID, &lTitle, &lMandatory, &lOrder, &vStatus, &hlsMasterKey, &completed); err != nil {
			return nil, err
		}
		mi, ok := idxByModule[mID]
		if !ok {
			outline.Modules = append(outline.Modules, domain.OutlineModule{ID: mID, Title: mTitle, OrderIndex: mOrder})
			mi = len(outline.Modules) - 1
			idxByModule[mID] = mi
		}
		lesson := domain.OutlineLesson{
			ID: lID, Title: lTitle, IsMandatory: lMandatory, OrderIndex: lOrder,
			HasVideo: vStatus != nil, HLSMasterKey: hlsMasterKey, Completed: completed,
		}
		if vStatus != nil {
			lesson.VideoStatus = domain.VideoStatus(*vStatus)
		}
		outline.Modules[mi].Lessons = append(outline.Modules[mi].Lessons, lesson)
	}
	return outline, rows.Err()
}

func (r *PostgresRepository) GetCertificateByToken(ctx context.Context, token string) (*domain.Certificate, error) {
	const q = `
		SELECT id, validation_token, user_id, course_version_id, user_name_snapshot, user_document_snapshot,
		       course_title_snapshot, version_tag_snapshot, workload_hours_snapshot, status, pdf_storage_path, issued_at, revoked_at
		FROM certificates WHERE validation_token = $1`
	var cert domain.Certificate
	err := r.db.QueryRow(ctx, q, token).Scan(
		&cert.ID, &cert.ValidationToken, &cert.UserID, &cert.CourseVersionID,
		&cert.UserNameSnapshot, &cert.UserDocumentSnapshot, &cert.CourseTitleSnapshot,
		&cert.VersionTagSnapshot, &cert.WorkloadHoursSnapshot, &cert.Status,
		&cert.PDFStoragePath, &cert.IssuedAt, &cert.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get certificate by token: %w", err)
	}
	return &cert, nil
}

// MarkEventProcessed insere em processed_events; ok=false quando o evento
// já havia sido processado por este consumidor (idempotência).
func (r *PostgresRepository) MarkEventProcessed(ctx context.Context, eventID uuid.UUID, consumerName string) (ok bool, err error) {
	ct, err := r.db.Exec(ctx,
		`INSERT INTO processed_events (event_id, consumer_name, processed_at) VALUES ($1, $2, now()) ON CONFLICT (event_id, consumer_name) DO NOTHING`,
		eventID, consumerName)
	if err != nil {
		return false, fmt.Errorf("mark event processed: %w", err)
	}
	return ct.RowsAffected() > 0, nil
}

// UnmarkEventProcessed remove a marca de idempotência — chamado quando o
// processamento falhou depois de marcado, para permitir o retry.
func (r *PostgresRepository) UnmarkEventProcessed(ctx context.Context, eventID uuid.UUID, consumerName string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM processed_events WHERE event_id = $1 AND consumer_name = $2`, eventID, consumerName)
	if err != nil {
		return fmt.Errorf("unmark event processed: %w", err)
	}
	return nil
}
