# Projeto SOPHIIA — Frontend

Painel em Next.js (App Router) + TypeScript para o **Projeto SOPHIIA** — a
plataforma institucional de capacitação, documentação e certificação
operacional dos sistemas municipais.

## Áreas

- **Portal do Servidor** (`/portal`) — catálogo de trilhas, player HLS
  adaptativo com heartbeat de progresso, conclusão de aulas e certificados
  (download do PDF + link de validação pública).
- **Studio do Instrutor** (`/studio`) — upload resiliente de videoaula via
  Presigned PUT direto no MinIO, com barra de progresso e acompanhamento
  da transcodificação HLS.
- **Validação pública** (`/validar-certificado/:token`) — sem autenticação.
- Dashboard, Integrações, Configurações e o Módulo Modelo (`/exemplos`).

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run lint
npx playwright test # e2e (requer o stack rodando)
```

Todas as chamadas de Client Component passam pelo proxy BFF
(`src/app/api/backend/[...path]` autenticado, `src/app/api/public/[...path]`
público) — o bearer token nunca chega ao JavaScript do navegador.
