package app

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/yurythx/projeto-sophiia/internal/domain/events"
	"github.com/yurythx/projeto-sophiia/internal/platform/configflags"
	"github.com/yurythx/projeto-sophiia/internal/platform/httpserver"
	"github.com/yurythx/projeto-sophiia/internal/platform/idempotency"
	"github.com/yurythx/projeto-sophiia/internal/platform/jobs"
	"github.com/yurythx/projeto-sophiia/internal/platform/messaging"
	"github.com/yurythx/projeto-sophiia/internal/platform/outbox"
	"github.com/yurythx/projeto-sophiia/internal/platform/ratelimit"
)

// sophiiaModuleFlag é a chave da feature flag que liga/desliga o módulo
// SOPHIIA — os consumidores checam-na por mensagem e fazem ACK sem
// processar quando o módulo está desativado.
const sophiiaModuleFlag = "module_sophiia_enabled"

// Worker roda os processadores de segundo plano da infraestrutura (publisher do outbox,
// limpezas periódicas de rate limit e idempotência, sweepers de jobs).
type Worker struct {
	deps       *Dependencies
	processors []processor
}

type processor func(ctx context.Context) error

// NewWorker constrói o runner do worker para o Projeto SOPHIIA.
func NewWorker(deps *Dependencies) (*Worker, error) {
	outboxPublisher := outbox.NewPublisher(deps.DB, deps.Publisher, deps.Logger)

	staleHandlers := map[string]jobs.StaleJobHandler{}

	// Consumidores do módulo SOPHIIA. Prefetch por fila conforme a
	// arquitetura: 1 para transcodificação (evita saturar CPU) e 10 para
	// geração de PDF de certificado.
	videoConsumer := messaging.NewConsumer(
		deps.Messaging, messaging.QueueSophiiaVideoTranscode.Name,
		1, deps.Config.RabbitMQ.MaxRetries, deps.Logger,
	)
	certConsumer := messaging.NewConsumer(
		deps.Messaging, messaging.QueueSophiiaCertGenerate.Name,
		10, deps.Config.RabbitMQ.MaxRetries, deps.Logger,
	)
	notifyConsumer := messaging.NewConsumer(
		deps.Messaging, messaging.QueueSophiiaNotifyEmail.Name,
		50, deps.Config.RabbitMQ.MaxRetries, deps.Logger,
	)
	videoHandler := flagGuarded(deps.Flags, deps.Logger, deps.Modules.Sophiia.VideoWorker.Handle)
	certHandler := flagGuarded(deps.Flags, deps.Logger, deps.Modules.Sophiia.CertWorker.Handle)
	notifyHandler := flagGuarded(deps.Flags, deps.Logger, deps.Modules.Sophiia.NotifyWorker.Handle)

	return &Worker{
		deps: deps,
		processors: []processor{
			supervised("outbox_publisher", deps.Logger, outboxPublisher.Run),
			supervised("rate_limit_cleanup", deps.Logger, ratelimit.Cleanup(deps.DB)),
			supervised("idempotency_cleanup", deps.Logger, idempotency.Cleanup(deps.DB)),
			supervised("jobs_stale_sweeper", deps.Logger, jobs.SweepStale(deps.DB, staleHandlers, deps.Config.Jobs.StaleAfter, deps.Logger)),
			supervised("sophiia_video_worker", deps.Logger, func(ctx context.Context) error {
				return videoConsumer.Consume(ctx, videoHandler)
			}),
			supervised("sophiia_cert_worker", deps.Logger, func(ctx context.Context) error {
				return certConsumer.Consume(ctx, certHandler)
			}),
			supervised("sophiia_notify_worker", deps.Logger, func(ctx context.Context) error {
				return notifyConsumer.Consume(ctx, notifyHandler)
			}),
		},
	}, nil
}

// flagGuarded envolve um handler de evento SOPHIIA com a checagem da
// feature flag do módulo: se um administrador desligou "module_sophiia_enabled",
// a mensagem recebe ACK sem processamento (retornar nil) — não faz sentido
// transcodificar vídeo ou emitir certificado de um módulo desativado, e
// deixar a mensagem em retry/DLQ só acumularia ruído. Ao religar a flag,
// eventos novos voltam a ser processados normalmente.
func flagGuarded(flags configflags.Store, logger *slog.Logger, next events.MessageHandler) events.MessageHandler {
	return func(ctx context.Context, event events.Event) error {
		if flags != nil {
			enabled, err := flags.IsEnabled(ctx, sophiiaModuleFlag, true)
			if err != nil {
				return err // erro de infra — deixa o retry cuidar
			}
			if !enabled {
				logger.Warn("sophiia: módulo desativado, descartando evento", slog.String("event_type", event.Type), slog.String("event_id", event.ID.String()))
				return nil
			}
		}
		return next(ctx, event)
	}
}

func supervised(name string, logger *slog.Logger, fn processor) processor {
	return func(ctx context.Context) error {
		backoff := time.Second
		const maxBackoff = 30 * time.Second

		for {
			err := fn(ctx)
			if ctx.Err() != nil {
				return nil
			}
			if err != nil {
				logger.Error("processor exited unexpectedly, restarting", slog.String("processor", name), slog.Any("error", err), slog.Duration("retry_in", backoff))
			} else {
				logger.Warn("processor returned without error before shutdown, restarting", slog.String("processor", name))
			}

			select {
			case <-ctx.Done():
				return nil
			case <-time.After(backoff):
			}
			if backoff < maxBackoff {
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
		}
	}
}

func (w *Worker) Run(ctx context.Context) error {
	if len(w.processors) == 0 {
		<-ctx.Done()
		return nil
	}

	var wg sync.WaitGroup
	errCh := make(chan error, len(w.processors))

	for _, p := range w.processors {
		wg.Add(1)
		go func(p processor) {
			defer wg.Done()
			if err := p(ctx); err != nil {
				errCh <- err
			}
		}(p)
	}

	<-ctx.Done()
	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) RunMetricsServer(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.Handle("/health", httpserver.HealthHandler())
	mux.Handle("/metrics", promhttp.Handler())

	server := &http.Server{
		Addr:              w.deps.Config.Worker.MetricsAddr(),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		w.deps.Logger.Info("worker metrics listener starting", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		return err
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
