package transport

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	apperrors "github.com/yurythx/projeto-sophiia/internal/domain/errors"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/application"
	"github.com/yurythx/projeto-sophiia/internal/platform/auth"
	"github.com/yurythx/projeto-sophiia/pkg/httputil"
)

type Handlers struct {
	svc    *application.Service
	logger *slog.Logger
}

func NewHandlers(svc *application.Service, logger *slog.Logger) *Handlers {
	return &Handlers{svc: svc, logger: logger}
}

// ---------------------------------------------------------------------------
// Portal do Servidor
// ---------------------------------------------------------------------------

func (h *Handlers) ListSystems(w http.ResponseWriter, r *http.Request) {
	systems, err := h.svc.ListCatalogSystems(r.Context())
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
		return
	}
	httputil.WriteOK(w, systems)
}

func (h *Handlers) ListCourses(w http.ResponseWriter, r *http.Request) {
	sysID, err := uuid.Parse(r.URL.Query().Get("system_id"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("system_id inválido"))
		return
	}
	courses, err := h.svc.ListCatalogCourses(r.Context(), sysID)
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
		return
	}
	httputil.WriteOK(w, courses)
}

func (h *Handlers) RecordHeartbeat(w http.ResponseWriter, r *http.Request) {
	var req heartbeatRequest
	if err := httputil.DecodeJSON(w, r, &req); err != nil {
		httputil.WriteError(w, r, h.logger, err)
		return
	}
	if err := httputil.Validate(req); err != nil {
		httputil.WriteError(w, r, h.logger, err)
		return
	}

	actor, subject, _ := auth.ActorUUID(r.Context())
	userID := subject
	if actor != nil {
		userID = actor.String()
	}

	if err := h.svc.RecordHeartbeat(r.Context(), userID, req.CourseVersionID, req.LessonID, req.PositionSeconds); err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
		return
	}
	httputil.WriteOK(w, map[string]string{"status": "recorded"})
}

func (h *Handlers) CourseOutline(w http.ResponseWriter, r *http.Request) {
	versionID, err := uuid.Parse(chi.URLParam(r, "versionID"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("versionID inválido"))
		return
	}
	actor, _, ok := auth.ActorUUID(r.Context())
	if !ok || actor == nil {
		httputil.WriteError(w, r, h.logger, apperrors.Unauthorized("identidade do servidor não resolvida"))
		return
	}
	outline, err := h.svc.GetCourseOutline(r.Context(), *actor, versionID)
	if err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteOK(w, outline)
}

func (h *Handlers) ListMyCertificates(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := auth.ActorUUID(r.Context())
	if !ok || actor == nil {
		httputil.WriteError(w, r, h.logger, apperrors.Unauthorized("identidade do servidor não resolvida"))
		return
	}
	certs, err := h.svc.ListMyCertificates(r.Context(), *actor)
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
		return
	}
	httputil.WriteOK(w, certs)
}

func (h *Handlers) GetTelemetryStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetTelemetryStats(r.Context())
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
		return
	}
	httputil.WriteOK(w, stats)
}

func (h *Handlers) DownloadCertificate(w http.ResponseWriter, r *http.Request) {
	certID, err := uuid.Parse(chi.URLParam(r, "certID"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("certID inválido"))
		return
	}
	actor, _, ok := auth.ActorUUID(r.Context())
	if !ok || actor == nil {
		httputil.WriteError(w, r, h.logger, apperrors.Unauthorized("identidade do servidor não resolvida"))
		return
	}
	url, err := h.svc.CertificateDownloadURL(r.Context(), *actor, certID)
	if err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	http.Redirect(w, r, url, http.StatusFound)
}

func (h *Handlers) CompleteLesson(w http.ResponseWriter, r *http.Request) {
	lessonID, err := uuid.Parse(chi.URLParam(r, "lessonID"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("lessonID inválido"))
		return
	}

	actor, _, ok := auth.ActorUUID(r.Context())
	if !ok || actor == nil {
		httputil.WriteError(w, r, h.logger, apperrors.Unauthorized("identidade do servidor não resolvida"))
		return
	}

	result, err := h.svc.CompleteLesson(r.Context(), actor, r.RemoteAddr, *actor, lessonID)
	if err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteOK(w, result)
}

// ---------------------------------------------------------------------------
// Studio do Instrutor
// ---------------------------------------------------------------------------

func (h *Handlers) CreateUploadURL(w http.ResponseWriter, r *http.Request) {
	lessonID, err := uuid.Parse(chi.URLParam(r, "lessonID"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("lessonID inválido"))
		return
	}
	actor, _, _ := auth.ActorUUID(r.Context())

	ticket, err := h.svc.CreateLessonUploadURL(r.Context(), actor, r.RemoteAddr, lessonID)
	if err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteCreated(w, ticket)
}

func (h *Handlers) GetLessonVideo(w http.ResponseWriter, r *http.Request) {
	lessonID, err := uuid.Parse(chi.URLParam(r, "lessonID"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("lessonID inválido"))
		return
	}
	asset, err := h.svc.GetLessonVideo(r.Context(), lessonID)
	if err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteOK(w, asset)
}

func (h *Handlers) ConfirmUpload(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "assetID"))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("assetID inválido"))
		return
	}
	actor, _, _ := auth.ActorUUID(r.Context())

	if err := h.svc.ConfirmLessonUpload(r.Context(), actor, r.RemoteAddr, assetID); err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteAccepted(w, map[string]string{"status": "processing"})
}

// ---------------------------------------------------------------------------
// Validação pública de certificado (sem autenticação)
// ---------------------------------------------------------------------------

func (h *Handlers) ValidateCertificate(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		httputil.WriteError(w, r, h.logger, apperrors.Validation("token ausente"))
		return
	}
	cert, err := h.svc.ValidateCertificate(r.Context(), token)
	if err != nil {
		if application.IsNotFound(err) {
			httputil.WriteError(w, r, h.logger, apperrors.NotFound("certificado não encontrado"))
			return
		}
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
		return
	}
	// Rota pública sem autenticação: nunca serializar a entidade crua
	// (CPF completo, ids internos, caminho no storage) — só a view mínima
	// de conferência. no-store para o documento não ficar em cache de
	// navegador/CDN.
	w.Header().Set("Cache-Control", "no-store")
	httputil.WriteOK(w, toPublicCertificateView(cert))
}

func (h *Handlers) writeDomainError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case application.IsNotFound(err):
		httputil.WriteError(w, r, h.logger, apperrors.NotFound("recurso não encontrado"))
	case application.IsConflict(err):
		httputil.WriteError(w, r, h.logger, apperrors.Conflict("recurso já existe"))
	default:
		httputil.WriteError(w, r, h.logger, apperrors.Internal(err))
	}
}
