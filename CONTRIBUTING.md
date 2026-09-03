# Contribuindo com o Projeto SOPHIIA

## Ambiente

```bash
cp .env.example .env
make gen-local-key          # chave RSA de dev para o login local
make dev-up                 # stack completo (portas de dev expostas)
make migrate-up             # aplica as migrations (goose no PATH)
make seed-admin             # cria 'admin' com senha aleatória — anote
```

Frontend em http://localhost:3002 · API em http://localhost:8002 ·
MinIO console 9003 · Mailpit 8025 · RabbitMQ 15673.

## Antes de abrir um PR

Rode os mesmos gates do CI (`.github/workflows/ci.yml`):

| | Comando |
|---|---|
| Backend | `cd backend && gofmt -l . && go vet ./... && go test ./... -p 1 && go build ./...` |
| Frontend | `cd frontend && npm run lint && npm run typecheck && npm test && npm run build` |
| Tudo | `make lint && make test` |

- `go test` do backend precisa de um Postgres alcançável via
  `TEST_DATABASE_URL` (senão os testes que tocam o banco são pulados).
- E2E (`cd frontend && npm run test:e2e`) roda contra a stack real —
  suba `make dev-up` e exporte `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`
  com o que o `make seed-admin` imprimiu. Passo a passo em
  [`docs/e2e.md`](docs/e2e.md).

## Estilo

- **Go**: `gofmt` (obrigatório no CI). `go vet` limpo.
- **TS/React**: ESLint + `tsc --noEmit` limpos. Prettier é gate bloqueante
  (`npm run format:check`); rode `npm run format` antes de commitar.
- **Cor no frontend**: tudo sai dos tokens em `globals.css` — nunca hex
  solto num componente.

## Commits e branches

- Trabalhe em branch (`fix/...`, `feat/...`, `chore/...`), nunca direto na
  `main`.
- Mensagens no formato [Conventional Commits](https://www.conventionalcommits.org):
  `fix(studio): ...`, `feat(api): ...`, `docs: ...`, `build: ...`, `ci: ...`,
  `chore: ...`. Corpo em pt-BR explicando o *porquê*.
- PRs pequenos e com um só propósito. O template de PR tem o checklist.

## Novos módulos

```bash
./scripts/create-module.sh <nome>
```

Referência: `backend/internal/modules/example/` · guia:
[`docs/GUIDE_MODULOS.md`](docs/GUIDE_MODULOS.md).
