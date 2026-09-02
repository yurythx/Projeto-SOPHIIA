-- +goose Up
-- Tabela do módulo "example" (blueprint de referência para novos módulos,
-- ver scripts/create-module.sh e docs/GUIDE_MODULOS.md). O código Go do
-- módulo (internal/modules/example) e suas rotas (/api/v1/examples) já
-- existem e ficam registrados no router, mas nenhuma migration criava
-- example_items — então GET/POST /api/v1/examples respondia 500
-- (relation "example_items" does not exist) desde sempre. Um blueprint
-- que não roda é pior que blueprint nenhum.
CREATE TABLE IF NOT EXISTS example_items (
    id          UUID PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_example_items_created_at ON example_items (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS example_items;
