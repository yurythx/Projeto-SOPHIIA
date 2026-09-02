package transport

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/yurythx/projeto-sophiia/internal/platform/auth"
)

// RegisterRoutes monta as rotas autenticadas do módulo SOPHIIA. api já
// está atrás de auth.RequireAuthentication (ver internal/app/router.go);
// gate é o middleware de feature flag (configflags.RequireEnabled
// "module_sophiia_enabled") — desligar a flag responde 503 em todo o
// grupo, sem redeploy. O sub-grupo /admin exige, por cima, a permissão
// sophiia:instruct (role sophiia-instructor ou sophiia-admin).
func RegisterRoutes(api chi.Router, h *Handlers, gate, mutationLimit func(http.Handler) http.Handler, logger *slog.Logger) {
	api.Route("/sophiia", func(s chi.Router) {
		s.Use(gate)

		// Portal do Servidor — qualquer servidor autenticado.
		s.Get("/portal/catalog/systems", h.ListSystems)
		s.Get("/portal/catalog/courses", h.ListCourses)
		s.Get("/portal/courses/{versionID}/outline", h.CourseOutline)
		s.Post("/portal/progress/heartbeat", h.RecordHeartbeat)
		s.Post("/portal/lessons/{lessonID}/complete", h.CompleteLesson)
		s.Get("/portal/certificates", h.ListMyCertificates)
		s.Get("/portal/certificates/{certID}/download", h.DownloadCertificate)

		// Studio do Instrutor — exige sophiia:instruct + rate limit por usuário.
		s.Group(func(admin chi.Router) {
			admin.Use(auth.RequirePermission(logger, auth.PermSophiiaInstruct))
			if mutationLimit != nil {
				admin.Use(mutationLimit)
			}

			// Edição do catálogo
			admin.Get("/admin/courses", h.ListAdminCourses)
			admin.Post("/admin/systems", h.CreateSystem)
			admin.Post("/admin/systems/{systemID}/courses", h.CreateCourse)
			admin.Post("/admin/courses/{courseID}/versions", h.CreateCourseVersion)
			admin.Post("/admin/versions/{versionID}/modules", h.CreateModule)
			admin.Post("/admin/versions/{versionID}/publish", h.PublishCourseVersion)
			admin.Post("/admin/modules/{moduleID}/lessons", h.CreateLesson)

			// Telemetria (Dashboard)
			admin.Get("/admin/telemetry", h.GetTelemetryStats)

			// Upload de videoaula
			admin.Post("/admin/lessons/{lessonID}/upload-url", h.CreateUploadURL)
			admin.Get("/admin/lessons/{lessonID}/video", h.GetLessonVideo)
			admin.Post("/admin/video-assets/{assetID}/confirm", h.ConfirmUpload)
		})
	})
}

// RegisterPublicRoutes monta a validação pública de certificado — SEM
// autenticação JWT (deve ser chamada fora do grupo protegido), atrás
// apenas da feature flag do módulo. pub deve estar montado em
// "/api/v1/public".
func RegisterPublicRoutes(pub chi.Router, h *Handlers, gate func(http.Handler) http.Handler) {
	pub.With(gate).Get("/certificates/validate/{token}", h.ValidateCertificate)
}
