import { ShieldCheck } from "lucide-react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";

import { LoginCard } from "@/components/auth/LoginCard";
import { Logo } from "@/components/ui/Logo";
import { Seal } from "@/components/ui/Seal";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// O painel de marca descreve exatamente o que a plataforma faz para um
// servidor da Prefeitura — sem linguagem de vendedor ("enterprise", "a
// tecnologia mais avançada do mercado"), que a versão anterior tinha
// herdado de um template.
const capabilities = [
  "Videoaulas com streaming adaptativo e registro de progresso.",
  "Trilhas de curso versionadas por sistema municipal.",
  "Certificados institucionais com validação pública por QR Code.",
  "Login unificado via SSO Keycloak ou credenciais locais seguras.",
];

export default async function LoginPage() {
  await connection();

  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("sophiia-theme")?.value;
  const initialTheme = themeCookie === "dark" || themeCookie === "light" ? themeCookie : undefined;

  return (
    <div className="flex min-h-screen">
      <div
        className="relative hidden overflow-hidden bg-brand-panel text-white lg:flex lg:w-[44%] lg:flex-col lg:justify-between lg:p-12"
        // O painel de marca é sempre escuro (`bg-brand-panel`), independente
        // do tema, então força o `--seal` para o mesmo coral que globals.css
        // usa no tema escuro — a tinta de carimbo #8a1c1c ficaria ilegível
        // aqui. Único ponto que consome o selo sobre superfície fixa-escura.
        style={{ "--seal": "#d1524a" } as CSSProperties}
      >
        <Seal
          size={520}
          decorative
          className="pointer-events-none absolute -bottom-40 -right-40 text-white/[0.06]"
        />

        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <Logo size={30} />
          Projeto SOPHIIA
        </div>

        <div className="relative flex flex-col gap-6">
          <p className="dateline text-white/60">Capacitação e Certificação</p>
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-white">
            A capacitação dos servidores dos sistemas municipais.
          </h1>
          <p className="max-w-sm text-sm text-white/75">
            Assista às videoaulas, conclua as trilhas e emita seus certificados — com validação
            pública por QR Code.
          </p>
          <ul className="mt-1 flex flex-col gap-3 text-sm text-white/90">
            {capabilities.map((item) => (
              <li key={item} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-seal"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-white/55">
          <ShieldCheck size={14} aria-hidden="true" />
          Entrada por senha ou SSO corporativo · auditoria de toda ação sensível
        </p>
      </div>

      {/* Painel do formulário — é o conteúdo principal da página (alvo do
          atalho de salto Alt+1) e o único landmark <main> do /login. */}
      <main id="conteudo" className="relative flex flex-1 flex-col items-center justify-center p-6">
        <div className="absolute right-4 top-4">
          <ThemeToggle initialTheme={initialTheme} />
        </div>

        <Link href="/" className="mb-10 flex items-center gap-2 text-lg font-semibold lg:hidden">
          <Logo size={30} />
          Projeto SOPHIIA
        </Link>

        <Suspense fallback={null}>
          <LoginCard />
        </Suspense>

        <Link href="/" className="mt-10 text-xs text-muted hover:text-foreground">
          ← Voltar para a página inicial
        </Link>
      </main>
    </div>
  );
}
