# Política de Segurança

## Como reportar uma vulnerabilidade

**Não abra issue pública.** Reporte de forma privada:

- GitHub → aba **Security** → *Report a vulnerability* (Private Vulnerability
  Reporting), ou
- e-mail para o mantenedor (yurythx@gmail.com) com `[SECURITY]` no assunto.

Inclua: passo a passo para reproduzir, impacto estimado, versão/commit
afetado. Resposta em até 5 dias úteis; correção coordenada antes de
qualquer divulgação.

## Escopo

Em escopo: o código deste repositório (API Go, workers, frontend Next.js,
infra do `docker-compose`, migrations). Fora de escopo: as imagens base de
terceiros (Postgres, RabbitMQ, MinIO, Keycloak) — reporte upstream — e
qualquer deployment operado por terceiros.

## Postura atual (para orientar o report)

- **CSP com nonce por requisição** + headers OWASP (`proxy.ts`,
  `next.config.ts`). `script-src` com `strict-dynamic`.
- **Auth**: OIDC/Keycloak (PKCE) ou login local RSA (RS256) + bcrypt +
  rate limiting por IP; RBAC por papéis.
- **Segredos**: injetados via arquivo (`<KEY>_FILE` / `/run/secrets`),
  nunca versionados. `gitleaks` no CI e no pre-commit
  (`.pre-commit-config.yaml`). `.env` e `secrets/*.pem` no `.gitignore`.
- **Fail-fast**: backend (`internal/platform/config`) e frontend
  (`src/instrumentation.ts`) recusam subir em `APP_ENV=production` com
  segredo fraco/placeholder ou `DB_SSLMODE`/`MINIO_PUBLIC_URL` inseguros.
- **Auditoria imutável** (`audit_logs` append-only no nível do Postgres),
  idempotência e rate limiting distribuído.
- **Rastreabilidade**: imagens carimbam `org.opencontainers.image.revision`
  e a API reporta o commit em `GET /api/v1/monitoring/health`.

## Lacunas conhecidas (não reporte como achado)

Sem SAST/DAST no pipeline ainda; sem SBOM/assinatura de imagem; sem
Dependabot/Renovate. `govulncheck` e `npm audit` rodam no CI como
informativos.
