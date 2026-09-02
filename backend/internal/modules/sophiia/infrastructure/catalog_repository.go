package infrastructure

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
)

// Escritas do catálogo usadas pelo Studio do Instrutor. Cada método
// devolve a linha criada (com o id gerado).

func (r *PostgresRepository) CreateSystem(ctx context.Context, code, name, description string) (*domain.SystemItem, error) {
	const q = `
		INSERT INTO systems (code, name, description, is_active)
		VALUES ($1, $2, NULLIF($3, ''), TRUE)
		RETURNING id, code, name, COALESCE(description, ''), is_active, created_at`
	var s domain.SystemItem
	err := r.db.QueryRow(ctx, q, code, name, description).
		Scan(&s.ID, &s.Code, &s.Name, &s.Description, &s.IsActive, &s.CreatedAt)
	if err != nil {
		if m := mapWriteErr(err); m != err {
			return nil, m
		}
		return nil, fmt.Errorf("create system: %w", err)
	}
	return &s, nil
}

func (r *PostgresRepository) CreateCourse(ctx context.Context, systemID uuid.UUID, title, description string) (*domain.Course, error) {
	const q = `
		INSERT INTO courses (system_id, title, description, is_active)
		VALUES ($1, $2, NULLIF($3, ''), TRUE)
		RETURNING id, system_id, title, COALESCE(description, ''), is_active, created_at`
	var c domain.Course
	err := r.db.QueryRow(ctx, q, systemID, title, description).
		Scan(&c.ID, &c.SystemID, &c.Title, &c.Description, &c.IsActive, &c.CreatedAt)
	if err != nil {
		if m := mapWriteErr(err); m != err {
			return nil, m
		}
		return nil, fmt.Errorf("create course: %w", err)
	}
	return &c, nil
}

func (r *PostgresRepository) CreateCourseVersion(ctx context.Context, courseID uuid.UUID, versionTag string, workloadHours int) (*domain.CourseVersion, error) {
	const q = `
		INSERT INTO course_versions (course_id, version_tag, workload_hours, is_current)
		VALUES ($1, $2, $3, FALSE)
		RETURNING id, course_id, version_tag, workload_hours, is_current, published_at, created_at`
	var v domain.CourseVersion
	err := r.db.QueryRow(ctx, q, courseID, versionTag, workloadHours).
		Scan(&v.ID, &v.CourseID, &v.VersionTag, &v.WorkloadHours, &v.IsCurrent, &v.PublishedAt, &v.CreatedAt)
	if err != nil {
		if m := mapWriteErr(err); m != err {
			return nil, m
		}
		return nil, fmt.Errorf("create course version: %w", err)
	}
	return &v, nil
}

func (r *PostgresRepository) CreateModule(ctx context.Context, versionID uuid.UUID, title string, orderIndex int) (*domain.ModuleItem, error) {
	const q = `
		INSERT INTO modules (course_version_id, title, order_index)
		VALUES ($1, $2, $3)
		RETURNING id, course_version_id, title, order_index`
	var m domain.ModuleItem
	err := r.db.QueryRow(ctx, q, versionID, title, orderIndex).
		Scan(&m.ID, &m.CourseVersionID, &m.Title, &m.OrderIndex)
	if err != nil {
		if m := mapWriteErr(err); m != err {
			return nil, m
		}
		return nil, fmt.Errorf("create module: %w", err)
	}
	return &m, nil
}

func (r *PostgresRepository) CreateLesson(ctx context.Context, moduleID uuid.UUID, title, markdown string, mandatory bool, orderIndex int) (*domain.Lesson, error) {
	const q = `
		INSERT INTO lessons (module_id, title, markdown_content, is_mandatory, order_index)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5)
		RETURNING id, module_id, title, COALESCE(markdown_content, ''), is_mandatory, order_index, created_at`
	var l domain.Lesson
	err := r.db.QueryRow(ctx, q, moduleID, title, markdown, mandatory, orderIndex).
		Scan(&l.ID, &l.ModuleID, &l.Title, &l.MarkdownContent, &l.IsMandatory, &l.OrderIndex, &l.CreatedAt)
	if err != nil {
		if m := mapWriteErr(err); m != err {
			return nil, m
		}
		return nil, fmt.Errorf("create lesson: %w", err)
	}
	return &l, nil
}

// PublishCourseVersion marca a versão como a corrente do seu curso
// (desmarcando as demais) e carimba published_at. Numa transação.
func (r *PostgresRepository) PublishCourseVersion(ctx context.Context, versionID uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin publish tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var courseID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT course_id FROM course_versions WHERE id = $1`, versionID).Scan(&courseID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("load course version: %w", err)
	}

	if _, err := tx.Exec(ctx, `UPDATE course_versions SET is_current = FALSE WHERE course_id = $1`, courseID); err != nil {
		return fmt.Errorf("unset current versions: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE course_versions SET is_current = TRUE, published_at = COALESCE(published_at, now()) WHERE id = $1`,
		versionID); err != nil {
		return fmt.Errorf("set current version: %w", err)
	}
	return tx.Commit(ctx)
}

// pgSQLState extrai o SQLSTATE de um erro do pgx (23503 = FK,
// 23505 = unique). Devolve "" se não for um erro do Postgres.
func pgSQLState(err error) string {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState()
	}
	return ""
}

func isFKViolation(err error) bool     { return pgSQLState(err) == "23503" }
func isUniqueViolation(err error) bool { return pgSQLState(err) == "23505" }

// mapWriteErr traduz violações conhecidas do Postgres nos sentinelas do
// pacote; qualquer outra coisa passa como veio (o chamador envelopa).
func mapWriteErr(err error) error {
	switch {
	case isUniqueViolation(err):
		return ErrConflict
	case isFKViolation(err):
		return ErrNotFound
	default:
		return err
	}
}
