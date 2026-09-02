-- +goose Up
-- Remove o schema dos módulos que NÃO fazem parte do Projeto SOPHIIA
-- (herança do projeto-base anterior): SecOps/scanning, Contratos
-- Municipais, Kanban de Demandas Mensais e Diário Oficial. Não há código
-- Go que use essas tabelas — só as migrations 000014–000041 as criaram.
--
-- CASCADE resolve a ordem das chaves estrangeiras entre elas. Se alguma
-- tabela já não existir (ambiente que nunca aplicou aquela migration),
-- IF EXISTS torna o comando um no-op.

-- Scanning / SecOps
DROP TABLE IF EXISTS scanning_posture_snapshots CASCADE;
DROP TABLE IF EXISTS scanning_finding_triage CASCADE;
DROP TABLE IF EXISTS scanning_projects CASCADE;
DROP TABLE IF EXISTS scanning_scanner_runs CASCADE;
DROP TABLE IF EXISTS scan_packages CASCADE;
DROP TABLE IF EXISTS scan_findings CASCADE;

-- Contratos Municipais + Kanban de Demandas Mensais
DROP TABLE IF EXISTS contract_reports CASCADE;
DROP TABLE IF EXISTS contract_occurrences CASCADE;
DROP TABLE IF EXISTS demand_documents CASCADE;
DROP TABLE IF EXISTS monthly_demands CASCADE;
DROP TABLE IF EXISTS contract_officials CASCADE;
DROP TABLE IF EXISTS contract_items CASCADE;
DROP TABLE IF EXISTS contrato_diario_alertas CASCADE;
DROP TABLE IF EXISTS contrato_diario_refs CASCADE;
DROP TABLE IF EXISTS contrato_aditivos CASCADE;
DROP TABLE IF EXISTS contratos CASCADE;

-- Diário Oficial
DROP TABLE IF EXISTS diario_oficial_publication_matches CASCADE;
DROP TABLE IF EXISTS diario_oficial_publications CASCADE;
DROP TABLE IF EXISTS diario_oficial_monitored_terms CASCADE;
DROP TABLE IF EXISTS diario_oficial_findings CASCADE;
DROP TABLE IF EXISTS diario_oficial_editions CASCADE;
DROP TABLE IF EXISTS diario_oficial_kv CASCADE;

-- Tipos ENUM exclusivos desses módulos
DROP TYPE IF EXISTS contract_type;
DROP TYPE IF EXISTS document_type;

-- Feature flags dos módulos removidos
DELETE FROM feature_flags WHERE key IN (
    'secops_virustotal_enabled',
    'diario_oficial_scraping_enabled',
    'scanning_noise_filter_enabled'
);

-- +goose Down
-- Deliberadamente um no-op: o schema removido nasceu espalhado por ~15
-- migrations (000014–000041) e não pertence ao Projeto SOPHIIA. Para
-- recuperá-lo, faça checkout de um commit anterior a esta migration.
SELECT 1;
