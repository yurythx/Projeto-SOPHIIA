import type { MetadataRoute } from "next";

// Disallow explícito das seções autenticadas — um crawler nunca passa da
// tela de login de qualquer forma (proxy.ts redireciona), mas listar
// isso aqui evita tentativa de rastreio/ruído de log por um bot bem-
// comportado, e deixa a intenção (só /, /sobre e /acessibilidade são
// públicas) explícita em vez de implícita. A lista de prefixos
// protegidos acompanha PROTECTED_PREFIXES em src/proxy.ts.
const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/sobre", "/acessibilidade"],
      disallow: [
        "/dashboard",
        "/integracoes",
        "/configuracao",
        "/monitoramento",
        "/portal",
        "/studio",
        "/exemplos",
        "/login",
        // Cada URL de validação carrega um token único — não há o que
        // indexar, e mantém varredores de token longe.
        "/validar-certificado",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
