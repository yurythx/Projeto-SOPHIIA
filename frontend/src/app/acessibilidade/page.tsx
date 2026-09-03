import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BRANDING_COOKIE, parseBrandingCookie } from "@/components/branding/brandingConfig";
import { Accessibility, ExternalLink, Eye, FileText, Hand, Keyboard, Type } from "lucide-react";

export const metadata: Metadata = {
  title: "Acessibilidade — Projeto SOPHIIA",
  description:
    "Recursos de acessibilidade do Portal SOPHIIA: atalhos de teclado, alto contraste, redimensionamento de fonte, VLibras e legislação aplicável (e-MAG).",
};

export default async function AcessibilidadePage() {
  const cookieStore = await cookies();
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);
  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <nav aria-label="Trilha de navegação" className="flex items-center gap-2 text-xs text-muted">
        <Link href="/" className="transition-colors hover:text-primary">
          Início
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground">Acessibilidade</span>
      </nav>

      <header className="flex items-center gap-3 border-b border-surface-border pb-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <Accessibility size={24} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Acessibilidade</h1>
          <p className="text-sm text-muted">
            Portal Oficial da {branding.orgName} — conformidade com o e-MAG (Modelo de
            Acessibilidade em Governo Eletrônico).
          </p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Section
          icon={<Keyboard size={20} aria-hidden="true" />}
          title="Atalhos de teclado (e-MAG)"
        >
          <p className="text-xs leading-relaxed text-muted">
            Cada atalho aparece na barra superior apenas nas páginas em que o destino existe:
          </p>
          <ul className="flex flex-col gap-2 font-mono text-xs text-foreground">
            <Shortcut keys="Alt + 1" desc="Ir para o conteúdo principal (#conteudo)" />
            <Shortcut
              keys="Alt + 2"
              desc="Ir para o menu principal (#menu) — nas telas do sistema"
            />
            <Shortcut keys="Alt + 4" desc="Ir para o rodapé (#rodape)" />
          </ul>
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px] text-foreground">
            <strong>Por navegador:</strong>
            <ul className="mt-1 flex list-inside list-disc flex-col gap-1 font-sans opacity-90">
              <li>
                Firefox (Windows/Linux): <code>Alt + Shift + número</code>
              </li>
              <li>
                Firefox (macOS): <code>Ctrl + Alt + número</code>
              </li>
              <li>
                Safari: <code>Ctrl + Opt + número</code>
              </li>
            </ul>
          </div>
        </Section>

        <Section icon={<Type size={20} aria-hidden="true" />} title="Contraste e tamanho de fonte">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Eye size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Alto contraste</h3>
              <p className="text-xs leading-relaxed text-muted">
                Use o botão <strong>&quot;Alto Contraste&quot;</strong> na barra superior. O layout
                muda para o padrão e-MAG (fundo escuro, acentos amarelos), com taxa de contraste
                acima de 7:1 (WCAG AAA para texto).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Type size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Redimensionar fonte (+ / −)</h3>
              <p className="text-xs leading-relaxed text-muted">
                Na barra superior, use <strong>+</strong> para aumentar o texto (até 150%) e{" "}
                <strong>−</strong> para reduzir (até 90%). O indicador de porcentagem restaura o
                tamanho normal. A preferência fica salva neste navegador.
              </p>
            </div>
          </div>
        </Section>

        <Section
          icon={<Hand size={20} aria-hidden="true" />}
          title="VLibras (Língua Brasileira de Sinais)"
        >
          <p className="text-xs leading-relaxed text-muted">
            O portal integra a suíte <strong>VLibras</strong> do Governo Federal. Clique no ícone
            azul flutuante no canto da tela (formato oficial do Governo Federal) para traduzir todo
            o conteúdo do portal para Libras.
          </p>
          <a
            href="https://www.vlibras.gov.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-primary-hover"
          >
            <span>Acessar o portal do VLibras</span>
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </Section>

        <Section icon={<FileText size={20} aria-hidden="true" />} title="Legislação aplicável">
          <ul className="flex flex-col gap-3 text-xs">
            <Law
              href="https://www.gov.br/governodigital/pt-br/acessibilidade-digital/emag"
              title="e-MAG — Modelo de Acessibilidade em Governo Eletrônico"
              desc="Diretrizes de acessibilidade para sítios e portais do Governo."
            />
            <Law
              href="http://www.planalto.gov.br/ccivil_03/_Ato2004-2006/2004/Decreto/D5296.htm"
              title="Decreto nº 5.296, de 2 de dezembro de 2004"
              desc="Regulamenta as Leis nº 10.048/2000 e nº 10.098/2000 sobre acessibilidade."
            />
            <Law
              href="http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm"
              title="Lei nº 13.146, de 6 de julho de 2015 (LBI)"
              desc="Lei Brasileira de Inclusão da Pessoa com Deficiência."
            />
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b border-surface-border pb-3 text-lg font-semibold text-primary">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-hover p-2">
      <span className="rounded bg-primary px-2 py-0.5 font-bold text-white">{keys}</span>
      <span>{desc}</span>
    </li>
  );
}

function Law({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <li className="flex flex-col gap-1 border-l-2 border-primary pl-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
      >
        <span>{title}</span>
        <ExternalLink size={12} aria-hidden="true" />
      </a>
      <span className="text-[11px] text-muted">{desc}</span>
    </li>
  );
}
