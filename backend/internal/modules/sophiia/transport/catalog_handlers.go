package transport

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	apperrors "github.com/yurythx/projeto-sophiia/internal/domain/errors"
	"github.com/yurythx/projeto-sophiia/internal/platform/auth"
	"github.com/yurythx/projeto-sophiia/pkg/httputil"
)

type createSystemReq struct {
	Code        string `json:"code" validate:"required,max=50"`
	Name        string `json:"name" validate:"required,max=255"`
	Description string `json:"description" validate:"max=2000"`
}

type createCourseReq struct {
	Title       string `json:"title" validate:"required,max=255"`
	Description string `json:"description" validate:"max=2000"`
}

type createVersionReq struct {
	VersionTag    string `json:"version_tag" validate:"required,max=20"`
	WorkloadHours int    `json:"workload_hours" validate:"required,gt=0"`
}

type createModuleReq struct {
	Title      string `json:"title" validate:"required,max=255"`
	OrderIndex int    `json:"order_index" validate:"gte=0"`
}

type createLessonReq struct {
	Title           string `json:"title" validate:"required,max=255"`
	MarkdownContent string `json:"markdown_content"`
	IsMandatory     *bool  `json:"is_mandatory"`
	OrderIndex      int    `json:"order_index" validate:"gte=0"`
}

func (h *Handlers) CreateSystem(w http.ResponseWriter, r *http.Request) {
	var req createSystemReq
	if !h.bind(w, r, &req) {
		return
	}
	out, err := h.svc.CreateSystem(r.Context(), req.Code, req.Name, req.Description)
	h.writeCreated(w, r, out, err)
}

func (h *Handlers) CreateCourse(w http.ResponseWriter, r *http.Request) {
	systemID, ok := h.pathUUID(w, r, "systemID")
	if !ok {
		return
	}
	var req createCourseReq
	if !h.bind(w, r, &req) {
		return
	}
	out, err := h.svc.CreateCourse(r.Context(), systemID, req.Title, req.Description)
	h.writeCreated(w, r, out, err)
}

func (h *Handlers) CreateCourseVersion(w http.ResponseWriter, r *http.Request) {
	courseID, ok := h.pathUUID(w, r, "courseID")
	if !ok {
		return
	}
	var req createVersionReq
	if !h.bind(w, r, &req) {
		return
	}
	out, err := h.svc.CreateCourseVersion(r.Context(), courseID, req.VersionTag, req.WorkloadHours)
	h.writeCreated(w, r, out, err)
}

func (h *Handlers) CreateModule(w http.ResponseWriter, r *http.Request) {
	versionID, ok := h.pathUUID(w, r, "versionID")
	if !ok {
		return
	}
	var req createModuleReq
	if !h.bind(w, r, &req) {
		return
	}
	out, err := h.svc.CreateModule(r.Context(), versionID, req.Title, req.OrderIndex)
	h.writeCreated(w, r, out, err)
}

func (h *Handlers) CreateLesson(w http.ResponseWriter, r *http.Request) {
	moduleID, ok := h.pathUUID(w, r, "moduleID")
	if !ok {
		return
	}
	var req createLessonReq
	if !h.bind(w, r, &req) {
		return
	}
	mandatory := true
	if req.IsMandatory != nil {
		mandatory = *req.IsMandatory
	}
	out, err := h.svc.CreateLesson(r.Context(), moduleID, req.Title, req.MarkdownContent, mandatory, req.OrderIndex)
	h.writeCreated(w, r, out, err)
}

func (h *Handlers) PublishCourseVersion(w http.ResponseWriter, r *http.Request) {
	versionID, ok := h.pathUUID(w, r, "versionID")
	if !ok {
		return
	}
	actor, _, _ := auth.ActorUUID(r.Context())
	if err := h.svc.PublishCourseVersion(r.Context(), actor, r.RemoteAddr, versionID); err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteOK(w, map[string]string{"status": "published"})
}

// --- helpers ---

func (h *Handlers) bind(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := httputil.DecodeJSON(w, r, dst); err != nil {
		httputil.WriteError(w, r, h.logger, err)
		return false
	}
	if err := httputil.Validate(dst); err != nil {
		httputil.WriteError(w, r, h.logger, err)
		return false
	}
	return true
}

func (h *Handlers) pathUUID(w http.ResponseWriter, r *http.Request, param string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, param))
	if err != nil {
		httputil.WriteError(w, r, h.logger, apperrors.Validation(param+" inválido"))
		return uuid.Nil, false
	}
	return id, true
}

func (h *Handlers) writeCreated(w http.ResponseWriter, r *http.Request, out any, err error) {
	if err != nil {
		h.writeDomainError(w, r, err)
		return
	}
	httputil.WriteCreated(w, out)
}
