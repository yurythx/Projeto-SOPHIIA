package httpserver

import (
	"context"
	"net/http"
	"time"

	"github.com/yurythx/projeto-sophiia/pkg/httputil"
)

// Check é uma verificação de dependência de readiness (ex.: "postgres",
// "rabbitmq") — um nome para exibir no relatório e a função que
// efetivamente testa se a dependência está alcançável.
type Check struct {
	Name string
	Fn   func(ctx context.Context) error
}

// HealthHandler responde à sonda de liveness: o processo está de pé e
// consegue atender requisições HTTP. Nunca verifica dependências externas
// — essa é a responsabilidade do /ready — para que uma dependência com
// problema (ex.: Postgres fora do ar) não faça um orquestrador (Kubernetes,
// Docker Swarm) matar o processo via probe de liveness quando na verdade
// o processo em si está saudável (§54).
func HealthHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		httputil.WriteOK(w, map[string]string{"status": "ok"})
	}
}

// ReadyHandler verifica cada dependência essencial (PostgreSQL, RabbitMQ)
// com o timeout por verificação informado, e reporta 200 somente se todas
// tiverem sucesso — 503 caso contrário. Usado por um orquestrador para
// decidir se deve rotear tráfego para esta instância.
func ReadyHandler(checks []Check, timeout time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		results := make(map[string]string, len(checks))
		ready := true

		for _, c := range checks {
			ctx, cancel := contextTimeout(r.Context(), timeout)
			err := c.Fn(ctx)
			cancel()

			if err != nil {
				results[c.Name] = "unavailable"
				ready = false
				continue
			}
			results[c.Name] = "ok"
		}

		status := http.StatusOK
		if !ready {
			status = http.StatusServiceUnavailable
		}
		httputil.WriteJSON(w, status, results, nil)
	}
}

// serviceHealth é o status de UMA dependência no relatório de monitoramento.
type serviceHealth struct {
	Status    string `json:"status"`
	LatencyMS int64  `json:"latency_ms"`
}

// systemHealth é o corpo de GET /api/v1/monitoring/health — mais rico que
// o /ready (que é para orquestrador, texto seco): inclui timestamp,
// versão e latência por dependência, para o painel /monitoramento do
// frontend. Sempre 200 (é um relatório, não uma probe); o campo status
// diz "healthy" ou "degraded".
type systemHealth struct {
	Status    string                   `json:"status"`
	Timestamp string                   `json:"timestamp"`
	Version   string                   `json:"version"`
	Services  map[string]serviceHealth `json:"services"`
}

// MonitoringHandler roda as mesmas verificações do ReadyHandler, mas
// devolve o relatório detalhado (com latência por serviço) que o painel
// administrativo consome. version é a string de build (pode ser vazia).
func MonitoringHandler(checks []Check, timeout time.Duration, version string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		services := make(map[string]serviceHealth, len(checks))
		healthy := true

		for _, c := range checks {
			ctx, cancel := contextTimeout(r.Context(), timeout)
			start := time.Now()
			err := c.Fn(ctx)
			latency := time.Since(start).Milliseconds()
			cancel()

			st := "ok"
			if err != nil {
				st = "unavailable"
				healthy = false
			}
			services[c.Name] = serviceHealth{Status: st, LatencyMS: latency}
		}

		overall := "healthy"
		if !healthy {
			overall = "degraded"
		}
		httputil.WriteOK(w, systemHealth{
			Status:    overall,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   version,
			Services:  services,
		})
	}
}
