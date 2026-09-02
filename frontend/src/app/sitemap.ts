import type { MetadataRoute } from "next";

// Sitemap mínimo, honesto: só as rotas realmente públicas (/, /sobre e a
// página institucional de acessibilidade e-MAG) — tudo abaixo de
// /dashboard, /integracoes, /configuracao, /monitoramento, /portal,
// /studio é autenticado e não pertence aqui (um crawler nunca passa da
// tela de login mesmo assim); /validar-certificado é público mas cada URL
// é por token, sem nada a indexar.
//
// Sem NEXT_PUBLIC_SITE_URL dedicada nesta aplicação — reaproveita
// NEXTAUTH_URL, a mesma variável que já serve de base pra outras
// construções de URL absoluta no frontend (ver
// app/api/auth/keycloak-logout-url/route.ts), com o mesmo fallback pra
// desenvolvimento local.
const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    {
      url: `${baseUrl}/sobre`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/acessibilidade`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
