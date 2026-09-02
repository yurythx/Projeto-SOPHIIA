-- +goose Up
-- Migration 000043: SOPHIIA (Plataforma Institucional de Capacitação e Certificação)

-- Identidade & Estrutura Organizacional
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS document_number VARCHAR(30);

-- Catálogo & Versionamento de Treinamentos
CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    version_tag VARCHAR(20) NOT NULL,
    workload_hours INT NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_course_version UNIQUE (course_id, version_tag)
);

CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    order_index INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    markdown_content TEXT,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- +goose StatementBegin
DO $$ BEGIN
    CREATE TYPE video_status AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS video_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID UNIQUE NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status video_status NOT NULL DEFAULT 'UPLOADING',
    raw_s3_key TEXT,
    hls_master_key TEXT,
    duration_seconds INT NOT NULL DEFAULT 0,
    error_message TEXT,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Progresso, Certificação & Idempotência
CREATE TABLE IF NOT EXISTS user_course_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
    completed_lessons_count INT NOT NULL DEFAULT 0,
    total_lessons_count INT NOT NULL DEFAULT 0,
    progress_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, course_version_id)
);

-- +goose StatementBegin
DO $$ BEGIN
    CREATE TYPE certificate_status AS ENUM ('VALID', 'REVOKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_token VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
    user_name_snapshot VARCHAR(255) NOT NULL,
    user_document_snapshot VARCHAR(30) NOT NULL,
    course_title_snapshot VARCHAR(255) NOT NULL,
    version_tag_snapshot VARCHAR(20) NOT NULL,
    workload_hours_snapshot INT NOT NULL,
    status certificate_status NOT NULL DEFAULT 'VALID',
    pdf_storage_path TEXT NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_user_course_version_cert UNIQUE (user_id, course_version_id)
);

-- processed_events: idempotência dos consumidores assíncronos. PK
-- composta (event_id, consumer_name) — o MESMO evento pode ser entregue a
-- consumidores distintos (ex.: um "notification.created" que vai tanto ao
-- broadcast WebSocket quanto à fila de e-mail); cada consumidor marca a
-- sua própria conclusão de forma independente.
CREATE TABLE IF NOT EXISTS processed_events (
    event_id UUID NOT NULL,
    consumer_name VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (event_id, consumer_name)
);

-- Registra a Feature Flag do módulo SOPHIIA (convenção module_<nome>_enabled,
-- ver docs/GUIDE_MODULOS.md e migration 000042). O grupo de rotas do
-- módulo (autenticadas e a validação pública de certificado) fica atrás
-- de configflags.RequireEnabled("module_sophiia_enabled") — desligar esta
-- flag no painel /configuracao desativa o módulo inteiro sem redeploy.
INSERT INTO feature_flags (key, enabled, description)
VALUES ('module_sophiia_enabled', true, 'Habilita o módulo SOPHIIA — Capacitação, Instrução e Certificação Operacional.')
ON CONFLICT (key) DO NOTHING;
-- Renomeia a chave antiga, caso esta migration já tenha rodado numa versão
-- anterior que semeava a flag como 'sophiia'.
UPDATE feature_flags SET key = 'module_sophiia_enabled'
WHERE key = 'sophiia'
  AND NOT EXISTS (SELECT 1 FROM feature_flags f2 WHERE f2.key = 'module_sophiia_enabled');
DELETE FROM feature_flags WHERE key = 'sophiia';

-- +goose Down
DROP TABLE IF EXISTS processed_events;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS user_course_progress;
DROP TABLE IF EXISTS video_assets;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS course_versions;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS systems;
ALTER TABLE users DROP COLUMN IF EXISTS document_number, DROP COLUMN IF EXISTS department_id;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS organizations;
