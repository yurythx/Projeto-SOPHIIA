package domain

import "github.com/google/uuid"

// Routing keys / tipos de evento do módulo SOPHIIA. São exatamente as
// chaves ligadas às filas em internal/platform/messaging/topology.go
// (QueueSophiiaVideoTranscode <- "video.uploaded",
// QueueSophiiaCertGenerate <- "course.completed") e viram o
// events.Event.Type gravado no outbox e usado como routing key pelo
// publisher.
const (
	EventVideoUploaded   = "video.uploaded"
	EventCourseCompleted = "course.completed"
	// EventEmailRequested casa com o binding "notification.*" da fila
	// sophiia.notify.email SEM casar com "notification.created" (fila de
	// broadcast WebSocket) — assim o e-mail é o único canal e o payload
	// (que carrega o endereço do destinatário) nunca é transmitido a
	// todos os navegadores conectados.
	EventEmailRequested = "notification.email.requested"
)

// Nomes de consumidor registrados em processed_events para idempotência
// (§ Idempotente via Postgres).
const (
	ConsumerVideoWorker  = "sophiia-video-worker"
	ConsumerCertWorker   = "sophiia-cert-worker"
	ConsumerNotifyWorker = "sophiia-notify-worker"
)

// VideoUploadedPayload acompanha o evento "video.uploaded": tudo que o
// worker de vídeo precisa para baixar o MP4 bruto e transcodificar sem
// consultar o catálogo.
type VideoUploadedPayload struct {
	VideoAssetID uuid.UUID `json:"video_asset_id"`
	LessonID     uuid.UUID `json:"lesson_id"`
	Bucket       string    `json:"bucket"`
	RawS3Key     string    `json:"raw_s3_key"`
}

// CourseCompletedPayload acompanha "course.completed": identifica o
// servidor e a versão de curso concluída para o worker de certificado
// montar os snapshots imutáveis.
type CourseCompletedPayload struct {
	UserID          uuid.UUID `json:"user_id"`
	CourseVersionID uuid.UUID `json:"course_version_id"`
}

// CertificateIssueData reúne os dados já resolvidos do catálogo/usuário
// usados para preencher os snapshots de um certificado.
type CertificateIssueData struct {
	UserName      string
	UserDocument  string
	UserEmail     string
	CourseTitle   string
	VersionTag    string
	WorkloadHours int
}

// NotificationCreatedPayload acompanha "notification.created" — consumido
// tanto pelo broadcast WebSocket quanto pelo worker de e-mail
// (sophiia.notify.email, routing "notification.*").
type NotificationCreatedPayload struct {
	Kind            string            `json:"kind"` // ex.: "certificate_issued"
	RecipientUserID uuid.UUID         `json:"recipient_user_id"`
	RecipientEmail  string            `json:"recipient_email"`
	Title           string            `json:"title"`
	Body            string            `json:"body"`
	Data            map[string]string `json:"data,omitempty"`
}
