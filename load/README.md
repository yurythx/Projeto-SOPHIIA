# Teste de carga (k6)

`load/k6/baseline.js` é um **smoke sob concorrência**, não um contrato de
capacidade: exercita os caminhos de leitura mais quentes contra a stack real
e verifica que continuam com erro ~0 e latência sã sob carga modesta.

## Cenários

| Cenário | Carga | Exercita |
|---|---|---|
| `public_health` | 5 VUs constantes por 1 min | `GET /health`, `GET /ready` |
| `portal_read` | rampa 0→10 VUs, ~40 s em regime | login (1×, em `setup`) → `GET /api/v1/sophiia/portal/catalog/systems` → `GET /api/v1/sophiia/portal/my-courses` → `GET /api/v1/monitoring/health` |

## Thresholds (informativos)

- `http_req_failed: rate < 1%`
- `login_failed: rate < 1%`
- `p(95)` de latência < 300 ms (`public_health`) / < 800 ms (`portal_read`)

Ajuste `scenarios` e `thresholds` no script quando houver um alvo real de
RPS/SLO — hoje os números são propositalmente conservadores.

## Rodando localmente

```bash
# 1. Instale o k6 — https://grafana.com/docs/k6/latest/set-up/install-k6/
#    (ou: docker run --rm -i --network host -e BASE_URL -e K6_USERNAME \
#     -e K6_PASSWORD -v "$PWD/load:/load" grafana/k6 run /load/k6/baseline.js)

# 2. Stack no ar + admin semeado
make dev-up
make migrate-up
make seed-admin        # anote a senha

# 3. Rode
BASE_URL=http://localhost:8002 \
K6_USERNAME=admin K6_PASSWORD='<a senha do seed-admin>' \
  make load
```

Opcional: `PORTAL_DURATION=3m` alonga a janela em regime do `portal_read`.

## CI

Não roda em todo PR — subir a stack + k6 é lento e o resultado é
informativo. O workflow **`load`** (`.github/workflows/load.yml`) é
`workflow_dispatch`: dispare pela aba **Actions › load › Run workflow**. Ele
sobe a stack, semeia um admin `k6` e publica `k6-summary.json` como artifact.
