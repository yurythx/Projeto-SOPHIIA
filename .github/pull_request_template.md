## O quê / Por quê

<!-- Uma frase do problema e uma da solução. Link para issue, se houver. -->

## Como testei

<!-- Comandos rodados, cenário manual, screenshot se for UI. -->

## Checklist

- [ ] Branch a partir da `main`, um só propósito
- [ ] `gofmt` / `go vet` / `go test -p 1` / `go build` — verde (backend)
- [ ] `npm run lint` / `typecheck` / `test` / `build` — verde (frontend)
- [ ] Testes de regressão para o comportamento novo/corrigido
- [ ] Sem segredo no diff; sem hex de cor solto no frontend (tokens de `globals.css`)
- [ ] Migration nova? Documentada e com `-- +goose Down`
- [ ] Doc atualizada se mudou API/contrato (`docs/openapi.yaml`, `README.md`)
- [ ] Mensagens de commit em Conventional Commits
