-- +goose Up
-- Migration 000044: rastreamento de conclusão por lição (SOPHIIA).
-- user_course_progress guarda apenas o AGREGADO (contagem/percentual); sem
-- uma tabela de detalhe não há como recalcular o progresso de forma
-- idempotente quando o servidor conclui a mesma lição duas vezes ou
-- retoma um curso. Esta tabela é a fonte da verdade que a
-- TrainingCompletionPolicy consome.
CREATE TABLE IF NOT EXISTS user_lesson_completion (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_user_lesson_completion_progress
    ON user_lesson_completion (user_id, course_version_id);

-- +goose Down
DROP TABLE IF EXISTS user_lesson_completion;
