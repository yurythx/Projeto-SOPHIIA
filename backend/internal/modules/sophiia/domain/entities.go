package domain

import (
	"time"

	"github.com/google/uuid"
)

type VideoStatus string

const (
	VideoStatusUploading  VideoStatus = "UPLOADING"
	VideoStatusProcessing VideoStatus = "PROCESSING"
	VideoStatusReady      VideoStatus = "READY"
	VideoStatusFailed     VideoStatus = "FAILED"
)

type CertificateStatus string

const (
	CertificateStatusValid   CertificateStatus = "VALID"
	CertificateStatusRevoked CertificateStatus = "REVOKED"
)

type Organization struct {
	ID        uuid.UUID `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type Department struct {
	ID             uuid.UUID `json:"id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	Name           string    `json:"name"`
	CreatedAt      time.Time `json:"created_at"`
}

type SystemItem struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

type Course struct {
	ID               uuid.UUID  `json:"id"`
	SystemID         uuid.UUID  `json:"system_id"`
	Title            string     `json:"title"`
	Description      string     `json:"description"`
	IsActive         bool       `json:"is_active"`
	CreatedAt        time.Time  `json:"created_at"`
	CurrentVersionID *uuid.UUID `json:"current_version_id,omitempty"`
	WorkloadHours    int        `json:"workload_hours,omitempty"`
}

// AdminCourseItem é a linha da listagem de cursos do Studio: o curso, o
// sistema a que pertence, a versão corrente (se houver) e contagens de
// lições / vídeos prontos — tudo numa consulta, sem N+1 no frontend.
type AdminCourseItem struct {
	ID               uuid.UUID  `json:"id"`
	Title            string     `json:"title"`
	SystemID         uuid.UUID  `json:"system_id"`
	SystemName       string     `json:"system_name"`
	CurrentVersionID *uuid.UUID `json:"current_version_id,omitempty"`
	VersionTag       string     `json:"version_tag,omitempty"`
	IsPublished      bool       `json:"is_published"`
	LessonsCount     int        `json:"lessons_count"`
	VideosReadyCount int        `json:"videos_ready_count"`
}

type CourseVersion struct {
	ID            uuid.UUID  `json:"id"`
	CourseID      uuid.UUID  `json:"course_id"`
	VersionTag    string     `json:"version_tag"`
	WorkloadHours int        `json:"workload_hours"`
	IsCurrent     bool       `json:"is_current"`
	PublishedAt   *time.Time `json:"published_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

type ModuleItem struct {
	ID              uuid.UUID `json:"id"`
	CourseVersionID uuid.UUID `json:"course_version_id"`
	Title           string    `json:"title"`
	OrderIndex      int       `json:"order_index"`
}

type Lesson struct {
	ID              uuid.UUID `json:"id"`
	ModuleID        uuid.UUID `json:"module_id"`
	Title           string    `json:"title"`
	MarkdownContent string    `json:"markdown_content"`
	IsMandatory     bool      `json:"is_mandatory"`
	OrderIndex      int       `json:"order_index"`
	CreatedAt       time.Time `json:"created_at"`
}

type VideoAsset struct {
	ID                    uuid.UUID   `json:"id"`
	LessonID              uuid.UUID   `json:"lesson_id"`
	Status                VideoStatus `json:"status"`
	RawS3Key              string      `json:"raw_s3_key"`
	HLSMasterKey          string      `json:"hls_master_key"`
	DurationSeconds       int         `json:"duration_seconds"`
	ProgressPercent       int         `json:"progress_percent"`
	ErrorMessage          string      `json:"error_message,omitempty"`
	ProcessingStartedAt   *time.Time  `json:"processing_started_at,omitempty"`
	ProcessingCompletedAt *time.Time  `json:"processing_completed_at,omitempty"`
	CreatedAt             time.Time   `json:"created_at"`
	UpdatedAt             time.Time   `json:"updated_at"`
}

type UserCourseProgress struct {
	UserID                uuid.UUID  `json:"user_id"`
	CourseVersionID       uuid.UUID  `json:"course_version_id"`
	CompletedLessonsCount int        `json:"completed_lessons_count"`
	TotalLessonsCount     int        `json:"total_lessons_count"`
	ProgressPercentage    float64    `json:"progress_percentage"`
	IsCompleted           bool       `json:"is_completed"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// CourseOutline é a árvore módulos → lições de uma versão de curso, já
// anotada com o status do vídeo de cada lição e a conclusão pelo usuário
// atual — o que o Portal precisa para montar o player e a lista de aulas.
type CourseOutline struct {
	CourseVersionID uuid.UUID       `json:"course_version_id"`
	Modules         []OutlineModule `json:"modules"`
}

type OutlineModule struct {
	ID         uuid.UUID       `json:"id"`
	Title      string          `json:"title"`
	OrderIndex int             `json:"order_index"`
	Lessons    []OutlineLesson `json:"lessons"`
}

type OutlineLesson struct {
	ID           uuid.UUID   `json:"id"`
	Title        string      `json:"title"`
	IsMandatory  bool        `json:"is_mandatory"`
	OrderIndex   int         `json:"order_index"`
	HasVideo     bool        `json:"has_video"`
	VideoStatus  VideoStatus `json:"video_status,omitempty"`
	HLSMasterKey string      `json:"hls_master_key,omitempty"`
	Completed    bool        `json:"completed"`
}

type Certificate struct {
	ID                    uuid.UUID         `json:"id"`
	ValidationToken       string            `json:"validation_token"`
	UserID                uuid.UUID         `json:"user_id"`
	CourseVersionID       uuid.UUID         `json:"course_version_id"`
	UserNameSnapshot      string            `json:"user_name_snapshot"`
	UserDocumentSnapshot  string            `json:"user_document_snapshot"`
	CourseTitleSnapshot   string            `json:"course_title_snapshot"`
	VersionTagSnapshot    string            `json:"version_tag_snapshot"`
	WorkloadHoursSnapshot int               `json:"workload_hours_snapshot"`
	Status                CertificateStatus `json:"status"`
	PDFStoragePath        string            `json:"pdf_storage_path"`
	IssuedAt              time.Time         `json:"issued_at"`
	RevokedAt             *time.Time        `json:"revoked_at,omitempty"`
}
