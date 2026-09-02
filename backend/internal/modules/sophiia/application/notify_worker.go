package application

import (
	"context"
	"log/slog"

	"github.com/yurythx/projeto-sophiia/internal/domain/events"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/infrastructure"
	"github.com/yurythx/projeto-sophiia/internal/platform/metrics"
)

// NotifyWorker consome a fila sophiia.notify.email (routing "notification.*",
// prefetch 50): envia o e-mail institucional correspondente a um
// "notification.created". Idempotente via processed_events.
type NotifyWorker struct {
	repo   processedEventStore
	sender infrastructure.EmailSender
	logger *slog.Logger
}

func NewNotifyWorker(repo processedEventStore, sender infrastructure.EmailSender, logger *slog.Logger) *NotifyWorker {
	return &NotifyWorker{repo: repo, sender: sender, logger: logger}
}

// Handle implementa events.MessageHandler.
func (w *NotifyWorker) Handle(ctx context.Context, event events.Event) error {
	var p domain.NotificationCreatedPayload
	if err := event.UnmarshalPayload(&p); err != nil {
		w.logger.Error("sophiia notify worker: payload ilegível, descartando", slog.String("event_id", event.ID.String()), slog.Any("error", err))
		return nil
	}
	logger := w.logger.With(slog.String("event_id", event.ID.String()), slog.String("kind", p.Kind))

	claimed, err := w.repo.MarkEventProcessed(ctx, event.ID, domain.ConsumerNotifyWorker)
	if err != nil {
		return err
	}
	if !claimed {
		logger.Info("sophiia notify worker: evento já processado, ignorando")
		return nil
	}

	if p.RecipientEmail == "" {
		metrics.SophiiaEmailsSentTotal.WithLabelValues("skipped").Inc()
		logger.Info("sophiia notify worker: notificação sem e-mail de destinatário, nada a enviar")
		return nil
	}

	if err := w.sender.Send(ctx, infrastructure.EmailMessage{
		To:      p.RecipientEmail,
		Subject: p.Title,
		Body:    p.Body,
	}); err != nil {
		_ = w.repo.UnmarkEventProcessed(ctx, event.ID, domain.ConsumerNotifyWorker)
		metrics.SophiiaEmailsSentTotal.WithLabelValues("failed").Inc()
		return err
	}
	metrics.SophiiaEmailsSentTotal.WithLabelValues("sent").Inc()
	logger.Info("sophiia notify worker: e-mail enviado", slog.String("to", p.RecipientEmail))
	return nil
}
