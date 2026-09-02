package app

import (
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"

	exampleTransport "github.com/yurythx/projeto-sophiia/internal/modules/example/transport"
	integrationsTransport "github.com/yurythx/projeto-sophiia/internal/modules/integrations/transport"
	sophiiaTransport "github.com/yurythx/projeto-sophiia/internal/modules/sophiia/transport"
	usersTransport "github.com/yurythx/projeto-sophiia/internal/modules/users/transport"

	"github.com/yurythx/projeto-sophiia/internal/platform/auth"
	"github.com/yurythx/projeto-sophiia/internal/platform/configflags"
	"github.com/yurythx/projeto-sophiia/internal/platform/database"
	"github.com/yurythx/projeto-sophiia/internal/platform/httpserver"
	"github.com/yurythx/projeto-sophiia/internal/platform/idempotency"
	"github.com/yurythx/projeto-sophiia/internal/platform/localauth"
	"github.com/yurythx/projeto-sophiia/internal/platform/ws"
)

// NewRouter monta o router HTTP completo para o Projeto SOPHIIA: a base da plataforma
// (health, metrics, request id, recovery, CORS, security headers), o /ready
// conectado a toda dependência essencial, e as rotas de negócio versionadas em /api/v1 e /ws.
func NewRouter(deps *Dependencies) chi.Router {
	r := httpserver.New(httpserver.Options{
		Logger:         deps.Logger,
		AllowedOrigins: []string{deps.Config.FrontendURL},
		RequestTimeout: 30 * time.Second,
	})

	checks := []httpserver.Check{
		{Name: "postgres", Fn: database.Ping(deps.DB)},
		{Name: "rabbitmq", Fn: deps.Messaging.Ping},
	}
	r.Get("/ready", httpserver.ReadyHandler(checks, 3*time.Second))

	// WebSocket autenticado por ticket
	r.Get("/ws", ws.UpgradeHandler(deps.Hub, deps.Tickets, deps.Config.FrontendURL, deps.Logger))

	// Rota de login local (pública)
	localauth.RegisterRoutes(r, deps.Modules.LocalAuth.Handlers, deps.Logger, deps.RateLimiters.LocalLogin)

	// Gate de feature flag do módulo SOPHIIA — desligar
	// "module_sophiia_enabled" no painel /configuracao responde 503 em
	// todo o grupo (rotas autenticadas e validação pública), sem redeploy.
	sophiiaGate := configflags.RequireEnabled(deps.Flags, deps.Logger, "module_sophiia_enabled", true)

	// Validação pública de certificado — SEM autenticação JWT, fora do
	// grupo protegido, atrás da flag do módulo e de um rate limit por IP
	// (barra enumeração automatizada da base de certificados).
	r.Route("/api/v1/public", func(pub chi.Router) {
		pub.Use(httpserver.RateLimit(deps.Logger, deps.RateLimiters.PublicCert, httpserver.ClientIPKey))
		sophiiaTransport.RegisterPublicRoutes(pub, deps.Modules.Sophiia.Handlers, sophiiaGate)
	})

	// Rotas protegidas (/api/v1)
	r.Route("/api/v1", func(api chi.Router) {
		api.Use(auth.RequireAuthentication(deps.Verifier, deps.Logger))
		api.Use(idempotency.Middleware(deps.Idempotency, deps.Logger))

		api.With(httpserver.RateLimit(deps.Logger, deps.RateLimiters.WSTicket, userOrIPKey)).
			Post("/ws/ticket", ws.TicketHandler(deps.Tickets, deps.Logger))

		// Relatório de saúde detalhado (latência por dependência) para o
		// painel /monitoramento do frontend. Sob /api/v1 => já exige
		// autenticação; o /ready na raiz continua servindo o orquestrador.
		// APP_REVISION é carimbada na imagem pelo build (ver Dockerfile.api).
		api.Get("/monitoring/health", httpserver.MonitoringHandler(checks, 3*time.Second, os.Getenv("APP_REVISION")))

		usersTransport.RegisterRoutes(api, deps.Modules.Users.Handlers, deps.Logger)
		integrationsTransport.RegisterRoutes(api, deps.Modules.Integrations.Handlers)
		configflags.RegisterRoutes(api, deps.Modules.ConfigFlags.Handlers, deps.Logger)
		exampleTransport.RegisterRoutes(api, deps.Modules.Example.Handlers)

		// Rate limit por usuário nas escritas do Studio (criação de
		// catálogo e upload de videoaula) — o Portal do Servidor (heartbeat,
		// conclusão) fica fora, é tráfego legítimo de alta frequência.
		sophiiaMutations := httpserver.RateLimit(deps.Logger, deps.RateLimiters.Mutations, userOrIPKey)
		sophiiaTransport.RegisterRoutes(api, deps.Modules.Sophiia.Handlers, sophiiaGate, sophiiaMutations, deps.Logger)
	})

	return r
}

func userOrIPKey(r *http.Request) string {
	if identity, ok := auth.IdentityFromContext(r.Context()); ok && identity.Subject != "" {
		return identity.Subject
	}
	return httpserver.ClientIPKey(r)
}
