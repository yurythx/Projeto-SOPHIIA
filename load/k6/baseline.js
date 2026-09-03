import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

// Baseline de carga do Projeto SOPHIIA.
//
// NÃO é um contrato de capacidade — é um *smoke sob concorrência*: valida
// que os caminhos de leitura mais quentes (healthchecks + a jornada de
// leitura do servidor no Portal) seguem com erro ~0 e latência sã sob
// carga modesta. Quando houver um alvo real de RPS/SLO, suba os números
// em `scenarios` e aperte os `thresholds`.
//
// Uso (stack no ar via `make dev-up` + `make seed-admin`):
//   BASE_URL=http://localhost:8002 \
//   K6_USERNAME=admin K6_PASSWORD='<senha do seed-admin>' \
//     k6 run load/k6/baseline.js
//
// Variáveis:
//   BASE_URL          default http://localhost:8002
//   K6_USERNAME        default admin
//   K6_PASSWORD        obrigatória (senha impressa por `make seed-admin`)
//   PORTAL_DURATION    janela em regime do cenário portal_read (default 40s)

const BASE_URL = __ENV.BASE_URL || "http://localhost:8002";
const USERNAME = __ENV.K6_USERNAME || "admin";
const PASSWORD = __ENV.K6_PASSWORD || "";
const PORTAL_DURATION = __ENV.PORTAL_DURATION || "40s";

const loginFailed = new Rate("login_failed");

export const options = {
  scenarios: {
    // Tráfego de orquestrador/observabilidade: barato, constante.
    public_health: {
      executor: "constant-vus",
      vus: 5,
      duration: "1m",
      exec: "publicHealth",
      tags: { scenario: "public_health" },
    },
    // Jornada de leitura do servidor no Portal, com rampa.
    portal_read: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { target: 10, duration: "20s" },
        { target: 10, duration: PORTAL_DURATION },
        { target: 0, duration: "10s" },
      ],
      exec: "portalRead",
      tags: { scenario: "portal_read" },
      gracefulStop: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    login_failed: ["rate<0.01"],
    "http_req_duration{scenario:public_health}": ["p(95)<300"],
    "http_req_duration{scenario:portal_read}": ["p(95)<800"],
  },
};

// setup() roda uma única vez e o retorno é compartilhado com todas as VUs.
// Um login só — o antibrute do login local é por IP (50/60s fora de
// produção), então nunca esbarramos no limite aqui.
export function setup() {
  if (!PASSWORD) {
    throw new Error("defina K6_PASSWORD (senha impressa por `make seed-admin`)");
  }
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "login" } },
  );
  const ok = check(res, { "login 200": (r) => r.status === 200 });
  loginFailed.add(!ok);
  if (!ok) {
    throw new Error(`login falhou: ${res.status} ${res.body}`);
  }
  return { token: res.json("data.access_token") };
}

export function publicHealth() {
  group("healthchecks públicos", () => {
    check(http.get(`${BASE_URL}/health`, { tags: { name: "health" } }), {
      "health 200": (r) => r.status === 200,
    });
    check(http.get(`${BASE_URL}/ready`, { tags: { name: "ready" } }), {
      "ready 2xx": (r) => r.status >= 200 && r.status < 300,
    });
  });
  sleep(1);
}

export function portalRead(data) {
  const params = {
    headers: { Authorization: `Bearer ${data.token}` },
  };
  group("jornada de leitura do servidor (Portal)", () => {
    check(
      http.get(`${BASE_URL}/api/v1/sophiia/portal/catalog/systems`, {
        ...params,
        tags: { name: "catalog/systems" },
      }),
      { "systems 200": (r) => r.status === 200 },
    );
    check(
      http.get(`${BASE_URL}/api/v1/sophiia/portal/my-courses`, {
        ...params,
        tags: { name: "portal/my-courses" },
      }),
      { "my-courses 200": (r) => r.status === 200 },
    );
    check(
      http.get(`${BASE_URL}/api/v1/monitoring/health`, {
        ...params,
        tags: { name: "monitoring/health" },
      }),
      { "monitoring 200": (r) => r.status === 200 },
    );
  });
  sleep(1);
}
