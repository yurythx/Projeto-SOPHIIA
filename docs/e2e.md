# Testes end-to-end (Playwright)

A suíte E2E exercita a aplicação **de ponta a ponta contra uma stack real**
(frontend + backend + Postgres + RabbitMQ + Redis + MinIO, subida via
docker-compose) — nunca mocka `fetch`/WebSocket como os testes de componente
(vitest) fazem. É o único teste automatizado que valida "o fluxo inteiro
funciona"; antes dela isso era verificação manual anotada como texto no
roadmap.

- Runner: `@playwright/test` (`frontend/playwright.config.ts`).
- Diretório dos specs: `frontend/e2e/`.
- Navegador: Chromium (único projeto configurado).
- Os testes **não sobem o servidor** (`webServer: undefined`, deliberado):
  eles apontam para um frontend **já no ar**, porque o fluxo real depende de
  `backend-api`/`postgres`/`rabbitmq`/`redis`/`minio` — infraestrutura que só o
  docker-compose monta corretamente.

## Specs

| Arquivo | O que cobre | Precisa de login? |
|---|---|---|
| `public-pages.spec.ts` | Páginas públicas (home, login, acessibilidade, validação de certificado) carregam e respondem | Não |
| `auth.spec.ts` | Login local (usuário/senha), sessão, logout | Sim |
| `hydration-no-flash.spec.ts` | Sem flash de tema/branding na hidratação; nomes de cookie (`sophiia-branding`, `sophiia-sidebar-collapsed`) | Não |
| `accessibility.spec.ts` | Varredura `axe-core` das páginas públicas | Não |
| `accessibility-auth.spec.ts` | Varredura `axe-core` das 9 telas autenticadas (dashboard, portal, studio, integrações, configuração, monitoramento, sala de aula, página do curso) | Sim — login único em `beforeAll` |

## Variáveis de ambiente

| Variável | Default | Para quê |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | URL do frontend já rodando. Para a stack docker-compose de dev use `http://localhost:3002`. |
| `E2E_ADMIN_USERNAME` | — | Usuário admin local para os specs autenticados. |
| `E2E_ADMIN_PASSWORD` | — | Senha do admin. **Sem ela, os specs que exigem login são pulados** (`test.skip`), não falham. |

## Rodando localmente

```bash
# 1. Suba a stack real (portas de dev expostas: front 3002, api 8002, pg 5433, ...)
make dev-up
make migrate-up

# 2. Crie o admin local — anote a senha que ele imprime
make seed-admin

# 3. Rode a suíte apontando para o frontend do compose
cd frontend
npm ci                      # se ainda não tiver as deps
npx playwright install --with-deps chromium   # primeira vez
PLAYWRIGHT_BASE_URL=http://localhost:3002 \
E2E_ADMIN_USERNAME=admin \
E2E_ADMIN_PASSWORD='<a senha do seed-admin>' \
  npm run test:e2e
```

Atalhos:

- `npm run test:e2e:ui` — modo UI interativo do Playwright (bom para depurar um
  spec específico).
- `npx playwright test e2e/auth.spec.ts` — roda um arquivo só.
- `npx playwright show-report` — abre o relatório HTML da última execução.

## Como o CI roda (job `e2e` em `.github/workflows/ci.yml`)

1. `cp .env.example .env` e gera a chave RSA de dev do login local.
2. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`.
3. Espera o healthcheck do container `frontend` ficar `healthy` (até ~5 min).
4. `goose ... up` + `seedadmin --username admin --password <fixa não-secreta>`.
5. `npx playwright test` com `PLAYWRIGHT_BASE_URL=http://localhost:3002`.
6. Em qualquer resultado, sobe `frontend/playwright-report` como artifact; em
   falha, despeja os logs da stack.

O job é **bloqueante** desde `1028684` — um spec vermelho barra o merge.
`retries: 2` e `workers: 1` no CI (`forbidOnly` liga com `CI=1`).

## Solução de problemas

- **Todos os specs autenticados aparecem como "skipped"** — `E2E_ADMIN_PASSWORD`
  não está no ambiente. Exporte-a (valor do `make seed-admin`).
- **`auth.spec.ts` falha em "429 / muitas tentativas"** — o login local tem
  antibrute (5 tentativas / 60 s por IP em produção). Fora de produção o limite
  é folgado (50 / 60 s, ver `backend/internal/app/dependencies.go`) e
  `accessibility-auth.spec.ts` faz **um** login em `beforeAll` de propósito. Se
  ainda esbarrar, rode os specs em série (`--workers=1`) ou espere 60 s.
- **`chrome-error://chromewebdata/` no logout** — falta `NEXTAUTH_URL` no
  container `frontend` (já definido no `docker-compose.yml` como
  `${FRONTEND_URL:-http://localhost:3002}`); acontece se a stack estiver
  desatualizada. `make dev-up` reconstrói.
- **Timeouts logo no começo** — a stack não terminou de subir. Confira
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps` e espere
  todos os serviços `healthy`.
- **Assertivas de conteúdo desatualizadas depois de mudar a UI** — os specs
  batem em texto/rota reais; atualize o spec junto com a tela.
