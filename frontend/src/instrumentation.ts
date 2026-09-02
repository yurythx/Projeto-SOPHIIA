import { registerOTel } from "@vercel/otel";

// register() roda UMA vez quando o servidor Next inicia (runtime Node,
// nunca durante `next build`). Usado aqui como fail-fast de segurança:
// em produção, recusa subir se um segredo do frontend ainda estiver num
// valor placeholder do .env.example ou curto demais.
//
// Achado de auditoria: o backend já tinha esse guard para MinIO/DB, mas
// nada barrava um deploy do frontend com NEXTAUTH_SECRET=super_secret_...
// — que é a chave que assina/cifra o cookie de sessão: previsível =>
// forjável.

const WEAK_SECRETS = new Set([
  "",
  "super_secret_nextauth_key",
  "super_secret_jwt_key",
  "sophiia_secret",
  "changeme",
  "secret",
  "password",
]);

function isWeak(value: string | undefined, minLen: number): boolean {
  if (!value || WEAK_SECRETS.has(value)) return true;
  return value.length < minLen;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    registerOTel({ serviceName: "projeto-sophiia-frontend" });
  }

  // Gatilho: APP_ENV=production — a MESMA variável que dispara o
  // validateProductionHardening do backend (config.go). NÃO usa
  // NODE_ENV: a imagem Docker do frontend força NODE_ENV=production
  // inclusive em `make dev`, então checar NODE_ENV travaria o boot do
  // container de desenvolvimento (onde os placeholders do .env são
  // aceitáveis de propósito). O container recebe APP_ENV via
  // `env_file: - .env` no docker-compose. Também não roda no runtime
  // edge (nenhum segredo vive lá).
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.APP_ENV !== "production") {
    return;
  }

  const problems: string[] = [];

  if (isWeak(process.env.NEXTAUTH_SECRET, 32)) {
    problems.push(
      "NEXTAUTH_SECRET ausente, no valor default ou com menos de 32 caracteres " +
        "(gere com `openssl rand -base64 48`)",
    );
  }

  // KEYCLOAK_FRONTEND_CLIENT_SECRET é o segredo do cliente confidencial —
  // só exigido quando o SSO Keycloak está configurado.
  if (process.env.KEYCLOAK_ISSUER_URL && isWeak(process.env.KEYCLOAK_FRONTEND_CLIENT_SECRET, 16)) {
    problems.push(
      "KEYCLOAK_FRONTEND_CLIENT_SECRET ausente, no valor default ou com menos de 16 caracteres " +
        "(copie de Keycloak > Clients > sophiia-frontend > Credentials)",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuração de produção insegura — recusando iniciar:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
