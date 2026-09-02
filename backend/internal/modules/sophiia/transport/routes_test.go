package transport_test

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/transport"
	"github.com/yurythx/projeto-sophiia/internal/platform/auth"
)

// mockGate simula o middleware de flag "module_sophiia_enabled" (sempre passa)
func mockGate(next http.Handler) http.Handler {
	return next
}

// setupRouter cria um router CHI, registra as rotas do SOPHIIA e adiciona um
// Recoverer para não quebrar o teste quando o Handler tentar usar um serviço nil
// (o que significa que a requisição passou com sucesso pelo middleware de RBAC).
func setupRouter() *chi.Mux {
	r := chi.NewRouter()

	// Recoverer converte panics em 500 Internal Server Error
	r.Use(middleware.Recoverer)

	// Injeta as rotas do SOPHIIA com Handler nulo
	h := transport.NewHandlers(nil, slog.Default())

	// Monta as rotas em /api/v1 (como no router real)
	r.Route("/api/v1", func(api chi.Router) {
		transport.RegisterRoutes(api, h, mockGate, mockGate, slog.Default())
	})

	return r
}

func TestSophiiaRBAC(t *testing.T) {
	router := setupRouter()

	tests := []struct {
		name            string
		roles           []string
		method          string
		path            string
		expectForbidden bool
	}{
		// ---------------------------------------------------------------------
		// Cenários do Usuário Comum (sophiia-user)
		// ---------------------------------------------------------------------
		{
			name:            "User Common - Acesso Liberado ao Portal (Listar Sistemas)",
			roles:           []string{auth.RoleUser},
			method:          http.MethodGet,
			path:            "/api/v1/sophiia/portal/catalog/systems",
			expectForbidden: false,
		},
		{
			name:            "User Common - Acesso Liberado ao Portal (Heartbeat)",
			roles:           []string{auth.RoleUser},
			method:          http.MethodPost,
			path:            "/api/v1/sophiia/portal/progress/heartbeat",
			expectForbidden: false,
		},
		{
			name:            "User Common - Bloqueado no Studio (Upload URL de Video)",
			roles:           []string{auth.RoleUser},
			method:          http.MethodPost,
			path:            "/api/v1/sophiia/admin/lessons/123e4567-e89b-12d3-a456-426614174000/upload-url",
			expectForbidden: true,
		},
		{
			name:            "User Common - Bloqueado no Studio (Criar Curso/Treinamento)",
			roles:           []string{auth.RoleUser},
			method:          http.MethodPost,
			path:            "/api/v1/sophiia/admin/systems/123e4567-e89b-12d3-a456-426614174000/courses",
			expectForbidden: true,
		},

		// ---------------------------------------------------------------------
		// Cenários do Instrutor/Editor (sophiia-instructor)
		// ---------------------------------------------------------------------
		{
			name:            "Instrutor - Acesso Liberado ao Portal (Sistemas)",
			roles:           []string{auth.RoleInstructor},
			method:          http.MethodGet,
			path:            "/api/v1/sophiia/portal/catalog/systems",
			expectForbidden: false,
		},
		{
			name:            "Instrutor - Acesso Liberado no Studio (Upload URL de Video)",
			roles:           []string{auth.RoleInstructor},
			method:          http.MethodPost,
			path:            "/api/v1/sophiia/admin/lessons/123e4567-e89b-12d3-a456-426614174000/upload-url",
			expectForbidden: false,
		},
		{
			name:            "Instrutor - Acesso Liberado no Studio (Confirmar Upload)",
			roles:           []string{auth.RoleInstructor},
			method:          http.MethodPost,
			path:            "/api/v1/sophiia/admin/video-assets/123e4567-e89b-12d3-a456-426614174000/confirm",
			expectForbidden: false,
		},

		// ---------------------------------------------------------------------
		// Cenários do Administrador (sophiia-admin)
		// ---------------------------------------------------------------------
		{
			name:            "Admin - Acesso Liberado no Studio (Criar Módulo)",
			roles:           []string{auth.RoleAdmin},
			method:          http.MethodPost,
			path:            "/api/v1/sophiia/admin/versions/123e4567-e89b-12d3-a456-426614174000/modules",
			expectForbidden: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)

			// Forjamos a identidade no contexto simulando o Token do Keycloak decodificado
			identity := auth.Identity{
				Subject: "test-user-id",
				Roles:   tt.roles,
			}
			ctx := auth.WithIdentity(req.Context(), identity)
			req = req.WithContext(ctx)

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			isForbidden := rec.Code == http.StatusForbidden

			if tt.expectForbidden && !isForbidden {
				t.Errorf("Rota %s %s com roles %v:\nEsperava ser bloqueado (403), mas obteve HTTP %d",
					tt.method, tt.path, tt.roles, rec.Code)
			} else if !tt.expectForbidden && isForbidden {
				t.Errorf("Rota %s %s com roles %v:\nEsperava passar, mas foi bloqueado (HTTP 403)",
					tt.method, tt.path, tt.roles)
			}
		})
	}
}
