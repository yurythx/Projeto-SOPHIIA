import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { accessTokenUsable } from "@/lib/auth/tokenState";

// O Next.js 16 renomeou a convenção middleware.ts para proxy.ts (mesmo
// mecanismo, só o nome do arquivo/export mudou). Esta função tem duas
// responsabilidades:
//
// 1. Content-Security-Policy com nonce (item de segurança prioritário):
//    gera um nonce novo a cada requisição e o injeta tanto no cabeçalho
//    CSP quanto num cabeçalho interno x-nonce que o Next.js lê
//    automaticamente para carimbar os próprios scripts/estilos do
//    framework — nada no código da aplicação precisa passar o nonce
//    manualmente. Isso exige renderização dinâmica (não hidrata bem com
//    páginas estáticas em cache), aceitável aqui pois é um dashboard
//    interno, não um site de alto tráfego dependente de cache em CDN.
//
// 2. Proteção de rota: redireciona visitas não autenticadas a qualquer
//    seção protegida (PROTECTED_PREFIXES) para /login, sem deixar a
//    página nem começar a renderizar.
// Seções autenticadas (§ Reestruturação de rotas): as duas compartilham
// um único grupo de rotas no App Router (app/(protected)/), mas esse
// grupo não aparece na URL — proxy.ts só enxerga o caminho real, então
// precisa saber sobre as duas independentemente.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/integracoes",
  "/configuracao",
  "/monitoramento",
  "/portal",
  "/studio",
  "/exemplos",
];

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const wsOrigin = wsOriginFromPublicUrl(process.env.NEXT_PUBLIC_WS_URL);
  // O navegador faz PUT/GET direto no MinIO: upload de videoaula via URL
  // pré-assinada (Studio) e download dos segmentos HLS do prefixo público
  // hls/ (player do Portal). Essa origem precisa estar em connect-src e
  // media-src.
  const minioUrl = process.env.NEXT_PUBLIC_MINIO_URL || "http://localhost:9002";
  const minioOrigin = wsOriginFromPublicUrl(minioUrl);

  // unsafe-eval só em desenvolvimento: o React usa eval para reconstruir
  // stack traces do servidor no navegador durante o dev; não é usado em
  // produção nem pelo React nem pelo Next.js.
  //
  // VLibras (tradutor de Libras do Governo Federal): o loader oficial
  // https://vlibras.gov.br/app/vlibras-plugin.js redireciona (302) para o
  // pacote no jsDelivr (cdn.jsdelivr.net/gh/spbgovbr-vlibras/...), que por
  // sua vez carrega o player (React + renderizador WASM do avatar via
  // Unity/WASM) e busca dicionário/tradução em *.vlibras.gov.br. Precisa
  // estar liberado em script/style/img/font/connect/media/worker/frame-src;
  // 'wasm-unsafe-eval' habilita a compilação WebAssembly do avatar. Com
  // strict-dynamic o carregamento em cadeia de SCRIPTS já é confiável
  // (herda o nonce do next/script); as origens ficam como fallback CSP2.
  //
  // ATENÇÃO style-src: o bootstrap v7.9 do VLibras cria um Shadow DOM e
  // injeta um <style> inline (position:fixed, lado direito, top:50vh) para
  // posicionar o botão das mãozinhas. Esse <style> NÃO carrega nonce (é
  // innerHTML), então style-src NÃO pode conter 'nonce-...': pela regra do
  // CSP3, a presença de um nonce em style-src faz o navegador IGNORAR
  // 'unsafe-inline', e aí o <style> do widget é bloqueado — o botão até
  // existe no DOM, mas sem posicionamento nenhum (fica perdido no meio da
  // página). style-src fica só com 'unsafe-inline'; os <style nonce> do
  // próprio Next continuam válidos por 'unsafe-inline'. (script-src mantém
  // o nonce: script é o vetor que realmente importa travar.)
  const vlibras = "https://vlibras.gov.br https://*.vlibras.gov.br https://cdn.jsdelivr.net";

  // Origens de conveniência de DESENVOLVIMENTO (backend Go e o próprio
  // front em localhost, mais os curingas de esquema que o HMR usa) — nunca
  // entram no CSP de produção, onde o navegador fala com o backend pelo
  // proxy BFF (mesma origem) e com o MinIO/WS pelas origens públicas
  // derivadas de NEXT_PUBLIC_*. Antes estas ficavam fixas no CSP inclusive
  // em produção (achado de auditoria).
  const localDevOrigins = isDev
    ? " http: https: ws: wss: ws://localhost:8002 ws://127.0.0.1:8002 http://localhost:8002 http://127.0.0.1:8002 http://localhost:3002 http://127.0.0.1:3002"
    : "";
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' ${vlibras}${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' ${vlibras};
    img-src 'self' blob: data: ${vlibras};
    font-src 'self' data: ${vlibras};
    connect-src 'self' ${vlibras}${localDevOrigins}${wsOrigin ? ` ${wsOrigin}` : ""}${minioOrigin ? ` ${minioOrigin}` : ""};
    media-src 'self' blob: ${vlibras}${minioOrigin ? ` ${minioOrigin}` : ""};
    worker-src 'self' blob: ${vlibras};
    frame-src 'self' ${vlibras};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) =>
      request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(prefix + "/"),
  );
  if (isProtectedRoute) {
    const token = await getToken({ req: request });
    // accessTokenUsable cobre também o token VENCIDO (o login local não
    // renova e o callback jwt não roda em toda navegação) — sem isso o
    // usuário ficava "logado" numa tela que só recebe 401 do backend.
    if (!accessTokenUsable(token)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

// Extrai só "esquema://host:porta" de uma URL de WebSocket pública
// (ws://localhost:8000/ws -> ws://localhost:8000), formato que
// connect-src exige — um caminho (/ws) não é uma origem válida em CSP.
function wsOriginFromPublicUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    // Roda em toda página HTML, exceto rotas de API, assets estáticos
    // do Next e favicon — essas nunca precisam de CSP de página nem de
    // verificação de sessão.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export default proxy;
