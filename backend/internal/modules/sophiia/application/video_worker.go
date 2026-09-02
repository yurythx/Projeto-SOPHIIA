package application

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/yurythx/projeto-sophiia/internal/domain/events"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/infrastructure"
	"github.com/yurythx/projeto-sophiia/internal/platform/metrics"
	"github.com/yurythx/projeto-sophiia/internal/platform/storage"
)

// transcodeTimeout limita quanto tempo uma transcodificação pode rodar —
// um FFmpeg travado nunca deve segurar o único slot do worker de vídeo
// (prefetch 1) para sempre. Estourado o prazo, o asset vai para FAILED e
// a mensagem entra em retry/DLQ.
const transcodeTimeout = 45 * time.Minute

// VideoWorker consome a fila sophiia.video.transcode (routing key
// "video.uploaded", prefetch 1): baixa o MP4 bruto do MinIO, gera o HLS
// multi-bitrate com FFmpeg, publica os segmentos em hls/<lesson_id>/ e
// move o video_asset para READY. Idempotente via processed_events.
type VideoWorker struct {
	repo       videoWorkerRepo
	storage    storage.Provider
	transcoder hlsTranscoder
	logger     *slog.Logger
}

func NewVideoWorker(repo videoWorkerRepo, storageProvider storage.Provider, transcoder hlsTranscoder, logger *slog.Logger) *VideoWorker {
	return &VideoWorker{repo: repo, storage: storageProvider, transcoder: transcoder, logger: logger}
}

// Handle implementa events.MessageHandler.
func (w *VideoWorker) Handle(ctx context.Context, event events.Event) error {
	var p domain.VideoUploadedPayload
	if err := event.UnmarshalPayload(&p); err != nil {
		w.logger.Error("sophiia video worker: payload ilegível, descartando", slog.String("event_id", event.ID.String()), slog.Any("error", err))
		return nil // um payload quebrado nunca terá sucesso num retry
	}
	logger := w.logger.With(slog.String("video_asset_id", p.VideoAssetID.String()), slog.String("lesson_id", p.LessonID.String()))

	claimed, err := w.repo.MarkEventProcessed(ctx, event.ID, domain.ConsumerVideoWorker)
	if err != nil {
		return err
	}
	if !claimed {
		logger.Info("sophiia video worker: evento já processado, ignorando")
		return nil
	}

	if err := w.process(ctx, logger, p); err != nil {
		_ = w.repo.UnmarkEventProcessed(ctx, event.ID, domain.ConsumerVideoWorker)
		if updErr := w.repo.UpdateVideoAssetResult(ctx, p.VideoAssetID, domain.VideoStatusFailed, "", truncErr(err), 0); updErr != nil {
			logger.Error("sophiia video worker: falha ao marcar asset como FAILED", slog.Any("error", updErr))
		}
		metrics.SophiiaVideoTranscodesTotal.WithLabelValues("failed").Inc()
		return err
	}
	metrics.SophiiaVideoTranscodesTotal.WithLabelValues("ready").Inc()
	logger.Info("sophiia video worker: transcodificação concluída")
	return nil
}

func (w *VideoWorker) process(ctx context.Context, logger *slog.Logger, p domain.VideoUploadedPayload) error {
	ctx, cancel := context.WithTimeout(ctx, transcodeTimeout)
	defer cancel()

	tmpRoot, err := os.MkdirTemp("", "sophiia-transcode-*")
	if err != nil {
		return fmt.Errorf("criar diretório temporário: %w", err)
	}
	defer os.RemoveAll(tmpRoot)

	rawPath := filepath.Join(tmpRoot, "raw.mp4")
	logger.Info("sophiia video worker: baixando MP4 bruto", slog.String("key", p.RawS3Key))
	if err := infrastructure.DownloadToFile(ctx, w.storage, p.Bucket, p.RawS3Key, rawPath); err != nil {
		return err
	}

	outDir := filepath.Join(tmpRoot, "hls")
	logger.Info("sophiia video worker: executando FFmpeg")
	if _, err := w.transcoder.TranscodeToHLS(ctx, rawPath, outDir); err != nil {
		return err
	}
	duration := w.transcoder.ProbeDurationSeconds(ctx, rawPath)

	keyPrefix := "hls/" + p.LessonID.String()
	uploaded, err := infrastructure.UploadDir(ctx, w.storage, p.Bucket, outDir, keyPrefix)
	if err != nil {
		return err
	}
	logger.Info("sophiia video worker: segmentos HLS publicados", slog.Int("files", uploaded))

	masterKey := keyPrefix + "/master.m3u8"
	return w.repo.UpdateVideoAssetResult(ctx, p.VideoAssetID, domain.VideoStatusReady, masterKey, "", duration)
}

// truncErr limita a mensagem de erro gravada em video_assets.error_message.
func truncErr(err error) string {
	const max = 500
	s := err.Error()
	if len(s) > max {
		return s[:max]
	}
	return s
}
