package application

import (
	"context"

	"github.com/google/uuid"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
)

// Interfaces mínimas de que os workers dependem — o
// *infrastructure.PostgresRepository e o *infrastructure.FFmpegTranscoder
// as satisfazem estruturalmente. Existem para permitir testar a
// orquestração dos workers (idempotência, tratamento de falha, publicação
// de notificação) com fakes, sem Postgres/FFmpeg reais.

type processedEventStore interface {
	MarkEventProcessed(ctx context.Context, eventID uuid.UUID, consumer string) (bool, error)
	UnmarkEventProcessed(ctx context.Context, eventID uuid.UUID, consumer string) error
}

type videoWorkerRepo interface {
	processedEventStore
	UpdateVideoAssetResult(ctx context.Context, assetID uuid.UUID, status domain.VideoStatus, hlsMasterKey, errMsg string, durationSeconds int) error
}

type certWorkerRepo interface {
	CertificateExists(ctx context.Context, userID, versionID uuid.UUID) (bool, error)
	CertificateIssueData(ctx context.Context, userID, versionID uuid.UUID) (*domain.CertificateIssueData, error)
	// IssueCertificate grava o certificado e, na MESMA transação,
	// enfileira o evento de notificação por e-mail no outbox — os dois
	// juntos ou nenhum (sem dual-write com o broker). inserted=false
	// quando a constraint única (user_id, course_version_id) já tinha
	// certificado (corrida com outra entrega): nada é enfileirado.
	IssueCertificate(ctx context.Context, cert *domain.Certificate, notifyEventType string, notify domain.NotificationCreatedPayload) (inserted bool, err error)
}

type hlsTranscoder interface {
	TranscodeToHLS(ctx context.Context, inputFilePath, outputDir string) (string, error)
	ProbeDurationSeconds(ctx context.Context, inputFilePath string) int
}
