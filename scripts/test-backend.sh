#!/usr/bin/env bash
# =============================================================================
# Roda a suíte do backend do jeito que o CI roda: contra um PostgreSQL
# DESCARTÁVEL e ocioso, criado só para o teste e destruído no fim.
#
# Por que não usar o banco do `make dev-up`: os testes que tocam o banco
# (outbox, configflags, integrations, ...) assumem que ninguém mais escreve
# na tabela durante o teste. Com o stack de dev no ar, o worker consome o
# outbox e o backend reconcilia flags — o resultado vira ruído
# (contagens erradas, linhas que somem, deadlock por lock de linha).
#
# Uso:
#   ./scripts/test-backend.sh                 # suíte inteira
#   ./scripts/test-backend.sh ./internal/platform/outbox/...   # pacote(s)
#
# Variáveis:
#   TEST_DATABASE_URL   se já estiver definida (ex: no CI, com um serviço
#                       Postgres dedicado), o script a usa direto e NÃO
#                       sobe container nenhum.
#   TEST_PG_PORT        porta do host para o Postgres efêmero (default 5544)
#   KEEP_PG=1           não derruba o container no fim (para depurar)
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Atalho: TEST_DATABASE_URL já fornecida => confia nela, sem Docker.
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  echo "==> TEST_DATABASE_URL já definida — usando esse banco, sem container"
  cd backend
  exec go test "${@:-./...}" -p 1 -count=1
fi

PORT="${TEST_PG_PORT:-5544}"
CONTAINER="sophiia-test-pg-$$"
DSN="postgres://sophiia:sophiia_pass@localhost:${PORT}/sophiia?sslmode=disable"
GOOSE_BIN="$(go env GOPATH)/bin/goose"

cleanup() {
  if [ "${KEEP_PG:-0}" = "1" ]; then
    echo "KEEP_PG=1 — deixando $CONTAINER de pé em :$PORT (DSN acima)"
    return
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Postgres efêmero ($CONTAINER) em :$PORT"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=sophiia -e POSTGRES_PASSWORD=sophiia_pass -e POSTGRES_DB=sophiia \
  -p "${PORT}:5432" postgres:16-alpine >/dev/null

if [ ! -x "$GOOSE_BIN" ]; then
  echo "==> instalando goose"
  go install github.com/pressly/goose/v3/cmd/goose@latest
fi

# O entrypoint do postgres sobe um servidor temporário para o initdb e
# então reinicia — `pg_isready` pode acertar essa primeira instância e o
# passo seguinte tomar "connection reset". Então: espera aceitar conexão
# E consegue rodar o `goose up` de fato, com algumas tentativas.
echo -n "==> aguardando o banco (migrations)"
migrated=0
for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U sophiia -d sophiia >/dev/null 2>&1 \
     && "$GOOSE_BIN" -dir backend/migrations postgres "$DSN" up >/tmp/sophiia-goose.$$ 2>&1; then
    migrated=1; echo " ok"; break
  fi
  echo -n "."; sleep 1
done
if [ "$migrated" -ne 1 ]; then
  echo " FALHOU"; cat /tmp/sophiia-goose.$$ 2>/dev/null; rm -f /tmp/sophiia-goose.$$; exit 1
fi
rm -f /tmp/sophiia-goose.$$

echo "==> go test"
cd backend
TEST_DATABASE_URL="$DSN" go test "${@:-./...}" -p 1 -count=1
