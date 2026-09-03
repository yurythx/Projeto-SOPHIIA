# Changelog

Todas as mudanças notáveis deste projeto são registradas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/). Ainda
não há release marcada — tudo abaixo está em **Não lançado** e será agrupado
sob a primeira tag `vX.Y.Z`.

## [Não lançado]

O commit inicial (`c3ab612`) estabeleceu a plataforma base: monólito modular
Go (Clean Architecture, chi, pgx, RabbitMQ com Outbox transacional + DLQ, Redis
write-behind, MinIO/S3, transcodificação HLS com FFmpeg, OpenTelemetry,
Prometheus) e frontend Next.js (App Router, NextAuth v4 com Keycloak OIDC +
login local RSA, Tailwind v4, CSP com nonce por requisição, acessibilidade
e-MAG/WCAG e VLibras). As entradas abaixo cobrem o que mudou desde então.

### Adicionado

- **Portal — catálogo e sala de aula no padrão Udemy**: grid responsivo com
  busca, filtro por categoria/status e ordenação; card com capa 16:9, progresso
  por curso; sala de aula com player HLS adaptativo (velocidade 1×–2×),
  "marcar como concluída"/"próxima aula", abas de visão geral/materiais/dúvidas
  e sidebar de conteúdo em accordion por módulo.
- **Studio do instrutor**: listagem de cursos, criação de curso e uma página
  dedicada por curso para upload e transcodificação de vídeo, com grid no mesmo
  padrão visual do Portal.
- **Painel `/monitoramento` com dados reais**: saúde de Postgres, RabbitMQ,
  Redis e MinIO derivada de `GET /api/v1/sophiia/monitoring/health` (latência
  média, revisão em produção, última verificação) — fim do "verde falso".
- **Pipeline de CI** (GitHub Actions): lint, typecheck, testes e build de
  backend e frontend; build das imagens; `gitleaks`; scan de vulnerabilidade;
  job e2e.
- **Suíte E2E Playwright** contra a stack real e varredura `axe-core` de
  acessibilidade nas telas públicas e nas 9 telas autenticadas. Ver
  [`docs/e2e.md`](docs/e2e.md).
- **Teste de carga baseline (k6)** — `load/k6/baseline.js`, alvo `make load` e
  workflow manual `load` (`workflow_dispatch`). Smoke sob concorrência dos
  caminhos de leitura quentes (healthchecks + jornada do servidor no Portal).
  Ver [`load/README.md`](load/README.md).
- **Rastreabilidade imagem↔commit**: labels OCI
  (`org.opencontainers.image.revision`) e `APP_REVISION` em runtime, carimbados
  a partir de `GIT_REVISION` no build.
- **SBOM (syft)** e **scan de imagem (trivy)** no job de docker.
- **Dependabot** e **CODEOWNERS**.
- `CONTRIBUTING.md`, `SECURITY.md` e template de Pull Request.
- `docs/e2e.md` e este `CHANGELOG.md`.
- **`make backend-test`** (`scripts/test-backend.sh`) — sobe um Postgres
  descartável, migra e roda `go test ./... -p 1` contra ele; respeita
  `TEST_DATABASE_URL` quando já definida (CI). Evita a contaminação de rodar
  os testes live-DB contra o banco do `make dev-up`.

### Alterado

- `PageHeader` canônico aplicado a todas as telas autenticadas.
- Transcodificação de vídeo: ladder de qualidade adaptativo (nunca faz
  upscale), `-preset veryfast`, barra de progresso real e reconciliação de
  jobs presos em `PROCESSING` (~90 s → ~17 s numa amostra).
- `window.prompt` do Studio substituído por formulário inline (Enter confirma,
  Esc cancela, feedback de erro).
- Contraste e-MAG: tokens de cor `-strong` para texto sobre tintas `/10`,
  `--muted` mais escuro no tema claro, `aria-label` nas barras de progresso.
- **E2E** e **`format:check` (Prettier)** passam a ser gates **bloqueantes** no
  CI (antes eram informativos).
- Formatação Prettier aplicada a todo o `frontend/`; adicionado
  `frontend/.prettierignore` para artefatos gerados (`pacts/`, `.next/`, ...).
- `README.md` e `docs/openapi.yaml` sincronizados com o estado atual (endpoints
  de monitoramento, catálogo admin, "meus cursos", telemetria).
- `.env.example` completado com as portas e URLs públicas que o
  `docker-compose` consome; `MINIO_PUBLIC_URL` corrigido para a porta `9002`.

### Corrigido

- **VLibras não aparecia**: o `style-src` da CSP com nonce fazia o navegador
  ignorar `'unsafe-inline'` e bloquear o `<style>` do Shadow DOM do widget.
- **Studio — módulo sem lição sumia** da árvore de conteúdo (`JOIN` interno →
  `LEFT JOIN`), o que criava um beco sem saída ao tentar adicionar a primeira
  lição de um módulo novo.
- **Testes live-DB do backend desalinhados do schema pós-migrations**:
  `integrations/infrastructure` usava a chave `example-integration`/`diario-oficial`
  (a semeada é `example-service`, migration 000041) e travava o `pool.Close()`
  do cleanup por 10 min ao falhar com a transação aberta; `configflags`
  esperava a flag `diario_oficial_scraping_enabled`, removida na migration
  000045. Nunca haviam passado num banco totalmente migrado.
- Upload de vídeo pedia o ID da lição em campo livre (colar UUID errado →
  404); o fluxo passou a derivar a lição do contexto da página do curso.
- `UpdateVideoAssetResult`: erro de SQL "inconsistent types deduced for
  parameter $1" — o parâmetro era usado como enum e em `$1 = 'READY'` ao mesmo
  tempo; resolvido com cast explícito `::video_status`.
- Hidratação: `hydration-no-flash.spec.ts` checava nomes de cookie antigos
  (`nova-*`) em vez dos atuais (`sophiia-*`).
