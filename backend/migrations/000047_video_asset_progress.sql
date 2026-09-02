-- +goose Up
-- Percentual de progresso da transcodificação (0..100), escrito pelo
-- worker de vídeo a partir do `-progress` do FFmpeg. O Studio passa a
-- mostrar barra de progresso real em vez de um spinner indefinido — a
-- transcodificação de vídeos longos leva minutos e antes não havia
-- nenhum sinal de que estava andando.
ALTER TABLE video_assets
    ADD COLUMN progress_percent SMALLINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE video_assets DROP COLUMN IF EXISTS progress_percent;
