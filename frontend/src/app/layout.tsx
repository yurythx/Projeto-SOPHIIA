import type { Metadata } from "next";
import { Geist_Mono, Inter, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";

import { AccessibilityBar } from "@/components/a11y/AccessibilityBar";
import { VLibras } from "@/components/a11y/VLibras";
import { BRANDING_COOKIE, parseBrandingCookie } from "@/components/branding/brandingConfig";
import { FONT_SCALE_COOKIE, parseScaleCookie } from "@/lib/a11y/fontScale";
import { Providers } from "./providers";

// Par tipográfico deliberado (§ redesenho 2026-08, ver globals.css):
// Newsreader (serifada de notícia) só nos títulos, Inter no corpo,
// Geist Mono reservada a códigos. Os três expõem custom properties que
// o @theme inline do globals.css consome.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);
  
  return {
    title: "Projeto SOPHIIA",
    description:
      `Plataforma de capacitação e certificação dos servidores dos sistemas da ${branding.orgName} ` +
      `— videoaulas, trilhas de curso e certificados com validação pública por QR Code.`,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Lê o cookie "sophiia-theme" (escrito por components/ui/ThemeToggle.tsx)
  // no servidor e carimba data-theme em <html> ANTES do primeiro paint —
  // zero flash de tema errado, sem precisar de nenhum <script> inline
  // (que a CSP com nonce deste app bloquearia — ver a nota em
  // ThemeToggle.tsx). Sem cookie (primeira visita), nenhum atributo é
  // definido e o CSS puro em globals.css segue prefers-color-scheme.
  const cookieStore = await cookies();
  const theme = cookieStore.get("sophiia-theme")?.value;
  const dataTheme = theme === "dark" || theme === "light" ? theme : undefined;

  // Alto Contraste e-MAG também via cookie: sem isto o atributo só era
  // aplicado por um useEffect no BrandingProvider, então a página piscava
  // do contraste normal para o alto a cada refresh. Mesmo cookie que a
  // Topbar escreve ao alternar (components/branding/brandingStore.ts).
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);
  const highContrast = branding.highContrast;
  const fontScale = parseScaleCookie(cookieStore.get(FONT_SCALE_COOKIE)?.value);

  return (
    <html
      lang="pt-BR"
      data-theme={dataTheme}
      data-high-contrast={highContrast ? "true" : undefined}
      // Escala e-MAG carimbada antes do 1º paint — zero flash de "100% → salvo".
      style={{ "--font-scale": String(fontScale) } as CSSProperties}
      className={`${inter.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Barra de acessibilidade e-MAG — fixa, em TODAS as páginas.
            Os alvos dos atalhos (#conteudo, #menu, #rodape) ficam nas
            áreas: DashboardShell (dashboard) e nos <main>/<footer> das
            páginas públicas. */}
        <AccessibilityBar 
          initialHighContrast={highContrast} 
          initialFontScale={fontScale} 
          initialOrgName={branding.orgName} 
        />
        <Providers>{children}</Providers>
        {/* Suíte de tradução para Libras do Governo Federal. */}
        <VLibras />
      </body>
    </html>
  );
}
