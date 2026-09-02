#!/usr/bin/env bash
#
# Smoke test ponta a ponta do módulo SOPHIIA contra um stack já rodando
# (make dev-up). Exercita: login -> criação de catálogo
# (sistema/curso/versão/módulo/lição) -> upload resiliente de videoaula ->
# transcodificação HLS pelo worker -> conclusão de lição -> emissão de
# certificado pelo worker -> validação pública por token.
#
# Uso:
#   SOPHIIA_ADMIN_USER=admin SOPHIIA_ADMIN_PASS='<senha do make seed-admin>' \
#     ./scripts/smoke-sophiia.sh
#
# Variáveis opcionais:
#   API_BASE   (default http://localhost:8002)
#   MP4_PATH   (default: gera um clipe de 3s — precisa de ffmpeg no host,
#              ou passe um arquivo pronto)
#   POLL_TIMEOUT_SECONDS (default 600 — transcodificação pode demorar)
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8002}"
ADMIN_USER="${SOPHIIA_ADMIN_USER:-admin}"
ADMIN_PASS="${SOPHIIA_ADMIN_PASS:?defina SOPHIIA_ADMIN_PASS (senha impressa por make seed-admin)}"
MP4_PATH="${MP4_PATH:-}"
POLL_TIMEOUT_SECONDS="${POLL_TIMEOUT_SECONDS:-600}"

command -v curl >/dev/null || { echo "curl é necessário"; exit 1; }

# jget <json-string> <caminho.pontilhado> — usa jq se existir, senão python3.
if command -v jq >/dev/null; then
  jget() { printf '%s' "$1" | jq -r ".$2"; }
elif command -v python3 >/dev/null; then
  jget() {
    printf '%s' "$1" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for k in sys.argv[1].split("."):
    if k == "": continue
    if isinstance(d, list): d = d[int(k)]
    else: d = d.get(k) if isinstance(d, dict) else None
print("" if d is None else d)
' "$2"
  }
else
  echo "jq ou python3 é necessário"; exit 1
fi

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m  ✗ %s\033[0m\n' "$*"; exit 1; }

api() { # api <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$body"
  else
    curl -fsS -X "$method" "$API_BASE$path" -H "Authorization: Bearer $TOKEN"
  fi
}

# ---------------------------------------------------------------------------
step "1/8  Login local"
LOGIN_JSON=$(curl -fsS -X POST "$API_BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
TOKEN=$(jget "$LOGIN_JSON" "data.access_token")
[[ -n "$TOKEN" && "$TOKEN" != "None" ]] || fail "login falhou: $LOGIN_JSON"
ok "token obtido"

# ---------------------------------------------------------------------------
step "2/8  Criar catálogo (sistema → curso → versão → módulo → lição)"
SUFFIX=$(date +%s)
SYS_ID=$(jget "$(api POST /api/v1/sophiia/admin/systems \
  "{\"code\":\"SMOKE$SUFFIX\",\"name\":\"Smoke Test\"}")" "data.id")
ok "system   $SYS_ID"
COURSE_ID=$(jget "$(api POST "/api/v1/sophiia/admin/systems/$SYS_ID/courses" \
  '{"title":"Curso Smoke"}')" "data.id")
ok "course   $COURSE_ID"
VERSION_ID=$(jget "$(api POST "/api/v1/sophiia/admin/courses/$COURSE_ID/versions" \
  '{"version_tag":"1.0","workload_hours":1}')" "data.id")
ok "version  $VERSION_ID"
MODULE_ID=$(jget "$(api POST "/api/v1/sophiia/admin/versions/$VERSION_ID/modules" \
  '{"title":"Módulo 1","order_index":0}')" "data.id")
ok "module   $MODULE_ID"
LESSON_ID=$(jget "$(api POST "/api/v1/sophiia/admin/modules/$MODULE_ID/lessons" \
  '{"title":"Aula 1","is_mandatory":true,"order_index":0}')" "data.id")
ok "lesson   $LESSON_ID"
api POST "/api/v1/sophiia/admin/versions/$VERSION_ID/publish" >/dev/null
ok "versão publicada"

# ---------------------------------------------------------------------------
step "3/8  Preparar MP4 de teste"
if [[ -z "$MP4_PATH" ]]; then
  MP4_PATH=$(mktemp /tmp/sophiia-smoke-XXXX.mp4)
  if command -v ffmpeg >/dev/null; then
    ffmpeg -y -loglevel error \
      -f lavfi -i "testsrc=duration=3:size=320x240:rate=10" \
      -f lavfi -i "sine=frequency=440:duration=3" \
      -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$MP4_PATH"
  elif command -v docker >/dev/null; then
    docker exec projeto-sophiia-backend-worker-1 ffmpeg -y -loglevel error \
      -f lavfi -i "testsrc=duration=3:size=320x240:rate=10" \
      -f lavfi -i "sine=frequency=440:duration=3" \
      -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /tmp/smoke.mp4 >/dev/null 2>&1
    docker cp projeto-sophiia-backend-worker-1:/tmp/smoke.mp4 "$MP4_PATH" >/dev/null 2>&1
  else
    fail "ffmpeg ou docker não encontrado — passe MP4_PATH=<arquivo>"
  fi
fi
[[ -s "$MP4_PATH" ]] || fail "MP4_PATH vazio/ausente: $MP4_PATH"
ok "$(du -h "$MP4_PATH" | cut -f1) → $MP4_PATH"

# ---------------------------------------------------------------------------
step "4/8  Upload resiliente (presigned PUT) + confirmação"
TICKET=$(api POST "/api/v1/sophiia/admin/lessons/$LESSON_ID/upload-url")
UPLOAD_URL=$(jget "$TICKET" "data.upload_url")
ASSET_ID=$(jget "$TICKET" "data.video_asset_id")
curl -fsS -X PUT "$UPLOAD_URL" -H 'Content-Type: video/mp4' --data-binary "@$MP4_PATH"
ok "PUT no MinIO ok (asset $ASSET_ID)"
api POST "/api/v1/sophiia/admin/video-assets/$ASSET_ID/confirm" >/dev/null
ok "confirmado — evento video.uploaded gravado no outbox"

# ---------------------------------------------------------------------------
step "5/8  Aguardar o worker de vídeo (status READY)"
deadline=$((SECONDS + POLL_TIMEOUT_SECONDS))
while :; do
  ST=$(jget "$(api GET "/api/v1/sophiia/admin/lessons/$LESSON_ID/video")" "data.status")
  [[ "$ST" == "READY" ]] && { ok "vídeo READY"; break; }
  [[ "$ST" == "FAILED" ]] && fail "transcodificação FAILED"
  (( SECONDS > deadline )) && fail "timeout aguardando READY (status=$ST)"
  printf '  … %s\r' "$ST"; sleep 3
done

# ---------------------------------------------------------------------------
step "6/8  Concluir a lição (dispara course.completed)"
RES=$(api POST "/api/v1/sophiia/portal/lessons/$LESSON_ID/complete")
[[ "$(jget "$RES" "data.is_completed")" == "True" ]]       || fail "curso não marcado como concluído: $RES"
[[ "$(jget "$RES" "data.certificate_queued")" == "True" ]] || fail "certificate_queued != true: $RES"
ok "100% obrigatórias · certificado enfileirado"

# ---------------------------------------------------------------------------
step "7/8  Aguardar o worker de certificado"
deadline=$((SECONDS + 120))
while :; do
  CERTS=$(api GET "/api/v1/sophiia/portal/certificates")
  TOKEN_VAL=$(printf '%s' "$CERTS" | python3 -c '
import sys, json
d = json.load(sys.stdin).get("data") or []
print(next((c["validation_token"] for c in d if c.get("version_tag_snapshot")=="1.0"), ""))
' 2>/dev/null || true)
  [[ -n "$TOKEN_VAL" ]] && { ok "certificado emitido (token $TOKEN_VAL)"; break; }
  (( SECONDS > deadline )) && fail "timeout aguardando o certificado"
  printf '  … aguardando\r'; sleep 3
done

# ---------------------------------------------------------------------------
step "8/8  Validação pública (sem autenticação)"
PUB=$(curl -fsS "$API_BASE/api/v1/public/certificates/validate/$TOKEN_VAL")
PUB_STATUS=$(jget "$PUB" "data.status" | tr '[:upper:]' '[:lower:]')
[[ "$PUB_STATUS" == "valid" ]] || fail "validação pública não retornou valid: $PUB"
ok "certificado VALID na validação pública"

printf '\n\033[1;32m✔ SMOKE SOPHIIA PASSOU\033[0m\n'
