# Projeto SOPHIIA

**SOPHIIA** — *Sistema Organizacional de Plataforma de Habilitação, Instrução e Inteligência
Aplicada* — é a plataforma institucional unificada para **capacitação, documentação e auditoria
operacional** dos sistemas municipais: videoaulas com streaming HLS adaptativo, trilhas de curso
versionadas, consolidação de progresso e emissão de certificados com validação pública por QR
Code.

Backend em Go (Clean Architecture / monólito modular) com workers assíncronos desacoplados via
RabbitMQ; PostgreSQL 16 com Transactional Outbox; Redis como buffer write-behind do player;
MinIO (S3) para vídeo bruto, segmentos HLS e PDFs; frontend em Next.js (App Router).

---

## 🏛️ Arquitetura

```
┌───────────────────────────── FRONTEND (Next.js) ─────────────────────────────┐
│  Portal do Servidor (player HLS + heartbeat + conclusão + certificados)      │
│  Studio do Instrutor (upload resiliente via Presigned PUT + status)          │
│  Validação Pública  /validar-certificado/:token                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ REST /api/v1  (JWT local RSA ou OIDC/Keycloak)
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                        BACKEND API (Go / chi)                                │
│  Clean Architecture · Transactional Outbox · Write-Behind Buffer (Redis)     │
│  Módulo SOPHIIA atrás da feature flag `module_sophiia_enabled`               │
└──────────┬─────────────────────────┬────────────────────────┬────────────────┘
     PostgreSQL 16              Redis 7                    MinIO (S3)
     catálogo/versões           heartbeat do player        raw-uploads/ (ILM 7d)
     progresso/certificados     cache-aside                hls/ (leitura pública)
     outbox_events                                         certificates/
           │
           ▼  Outbox Relay (FOR UPDATE SKIP LOCKED + LISTEN/NOTIFY)
┌───────────────────────────── RabbitMQ (exchange `sophiia.events`) ───────────┐
│  sophiia.video.transcode   (video.uploaded,   prefetch 1)                    │
│  sophiia.cert.generate     (course.completed, prefetch 10)                   │
│  sophiia.notify.email      (notification.*,    prefetch 50)  + DLQ por fila  │
└──────────┬──────────────────────┬──────────────────────────┬─────────────────┘
      WORKER VÍDEO           WORKER CERTIFICADO          WORKER NOTIFICAÇÃO
      FFmpeg → HLS → MinIO   Maroto v2 PDF + QR Code     SMTP (ou log em dev)
      idempotente            idempotente                 idempotente
```

### Componentes de plataforma reaproveitados

- **Clean Architecture & monólito modular** — módulos em `backend/internal/modules/` (`sophiia`,
  `users`, `integrations`, `example`).
- **Autenticação dupla** — Keycloak SSO (OIDC) e login local com RSA (RS256) + bcrypt + rate
  limiting. RBAC por roles (`sophiia-admin`, `sophiia-instructor`, `sophiia-user`, …).
- **Transactional Outbox + RabbitMQ** — escrita atômica no PostgreSQL e publicação assíncrona
  com DLQ por fila e retry com backoff.
- **Auditoria imutável** — `audit_logs` append-only protegido no nível do PostgreSQL.
- **WebSocket** — broker de notificações em tempo real (ticket-based).
- **Feature flags dinâmicas** — liga/desliga módulos em runtime, sem redeploy.

---

## 📂 Estrutura do repositório

```text
.
├── backend/
│   ├── cmd/{api,worker,seedadmin}/
│   ├── internal/
│   │   ├── app/                 # DI central + roteamento + runner de worker
│   │   ├── domain/              # tipos/erros primitivos, envelope de evento
│   │   ├── platform/            # Auth, DB, Messaging, Outbox, Audit, WS, Storage, Config…
│   │   └── modules/
│   │       ├── sophiia/         # domain (política de conclusão, entidades, eventos)
│   │       │                    # application (Service + Video/Cert/Notify workers)
│   │       │                    # infrastructure (Postgres, Redis, FFmpeg, Maroto, e-mail)
│   │       │                    # transport (handlers + rotas)
│   │       ├── users/  integrations/  example/
│   ├── migrations/              # PostgreSQL (Goose) — SOPHIIA: 000043, 000044
│   └── pkg/httputil/
├── frontend/
│   └── src/
│       ├── app/(protected)/{portal,studio}/   # Portal do Servidor / Studio do Instrutor
│       ├── app/validar-certificado/[token]/   # validação pública (sem auth)
│       ├── app/api/{backend,public}/[...path]/ # proxy BFF (autenticado / público)
│       ├── components/sophiia/HlsPlayer.tsx
│       └── lib/api/sophiia.ts
├── docker-compose.yml           # PostgreSQL, RabbitMQ, Redis, MinIO, API, Worker, Frontend
├── docker-compose.dev.yml       # exposição de portas em desenvolvimento
└── Makefile
```

---

## 🚀 Como iniciar

### Pré-requisitos
- Docker & Docker Compose
- Go 1.27+ e Node.js 20+ (opcionais, para rodar fora do container)

### 1. Variáveis de ambiente
```bash
cp .env.example .env
```

### 2. Chave RSA para autenticação local
```bash
mkdir -p secrets
openssl genrsa -out secrets/local_auth_private_key.pem 2048
chmod 644 secrets/local_auth_private_key.pem
```

### 3. Subir o ambiente
```bash
make dev
# ou:  docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### 4. Semear o administrador inicial
```bash
make seed-admin   # cria 'admin' com roles sophiia-admin,sophiia-user e senha aleatória
```

### 5. Acessar
- **Frontend:** http://localhost:3002
- **API Healthcheck:** http://localhost:8002/health
- **RabbitMQ Management:** http://localhost:15673
- **MinIO Console:** http://localhost:9003

---

## 🎓 Fluxo do módulo SOPHIIA

| Etapa | Rota / evento |
|---|---|
| Instrutor gera URL de upload | `POST /api/v1/sophiia/admin/lessons/{id}/upload-url` → Presigned PUT (`raw-uploads/`) + `video_asset` UPLOADING |
| Cliente envia o MP4 direto ao MinIO | `PUT <presigned-url>` |
| Instrutor confirma o upload | `POST /api/v1/sophiia/admin/video-assets/{id}/confirm` → tx: PROCESSING + outbox `video.uploaded` |
| Worker de vídeo | consome `sophiia.video.transcode` → FFmpeg → `hls/<lesson>/` → `video_asset` READY |
| Servidor assiste e conclui aulas | player HLS + `POST .../portal/progress/heartbeat` + `POST .../portal/lessons/{id}/complete` |
| Consolidação de progresso | `TrainingCompletionPolicy` (≥ 90% das aulas obrigatórias) → na virada, outbox `course.completed` |
| Worker de certificado | consome `sophiia.cert.generate` → PDF Maroto v2 + QR → `certificates/` + tabela `certificates` → evento `notification.email.requested` |
| Worker de notificação | consome `sophiia.notify.email` → e-mail institucional (SMTP; em dev apenas registra em log) |
| Validação pública | `GET /api/v1/public/certificates/validate/{token}` (sem autenticação) |

O grupo inteiro (rotas autenticadas **e** a validação pública) fica atrás da feature flag
`module_sophiia_enabled` — desligá-la no painel `/configuracao` responde `503 FEATURE_DISABLED`
sem redeploy; os workers passam a fazer ACK sem processar.

---

## 🧪 Testes

```bash
make test                       # backend + frontend
cd backend && go test ./...     # inclui testes de orquestração dos workers (fakes)
cd frontend && npm test         # vitest
```

### Smoke end-to-end (contra o stack no ar)

Exercita todo o fluxo do módulo — login → criação de catálogo → upload
resiliente → transcodificação HLS pelo worker → conclusão → emissão de
certificado → validação pública.

```bash
# pré-requisitos no host: docker; goose no PATH; jq; ffmpeg
#   go install github.com/pressly/goose/v3/cmd/goose@latest
#   export PATH="$PATH:$(go env GOPATH)/bin"
#   sudo apt install -y jq ffmpeg

make dev-up          # stack desanexado, com portas de dev (pg:5433, mailpit:8025)
make migrate-up      # aplica as 45 migrations (precisa do pg exposto -> use dev-up, não up)
make seed-admin      # anote a senha impressa

SOPHIIA_ADMIN_PASS='<senha>' make smoke
```

Os e-mails de "certificado emitido" caem no Mailpit em
http://localhost:8025.

---

## 🛠️ Novos módulos

O scaffolding genérico continua disponível:

```bash
./scripts/create-module.sh patrimonio
```

Guia: [`docs/GUIDE_MODULOS.md`](docs/GUIDE_MODULOS.md). Referência de implementação:
`backend/internal/modules/example/`.
