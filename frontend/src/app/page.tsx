import {
  Boxes,
  Clapperboard,
  Database,
  FileCheck,
  KeyRound,
  PlayCircle,
  QrCode,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Logo } from "@/components/ui/Logo";
import { Seal } from "@/components/ui/Seal";
import { BRANDING_COOKIE, parseBrandingCookie } from "@/components/branding/brandingConfig";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);
  const description =
    `Plataforma de capacitação e certificação dos servidores dos sistemas da ${branding.orgName}: ` +
    `videoaulas com streaming adaptativo, trilhas de curso versionadas e certificados com validação pública por QR Code.`;

  return {
    title: "Projeto SOPHIIA — Capacitação e Certificação",
    description,
    openGraph: { title: "Projeto SOPHIIA", description, type: "website" },
  };
}

// Três áreas do produto — frentes PARALELAS, não uma sequência: ícones, sem
// numeração (a numeração fica reservada para o fluxo real, mais abaixo).
const areas = [
  {
    icon: PlayCircle,
    title: "Portal do Servidor",
    description:
      "Assista às videoaulas com streaming HLS adaptativo, acompanhe seu progresso e baixe o certificado ao concluir a trilha.",
  },
  {
    icon: Clapperboard,
    title: "Studio do Instrutor",
    description:
      "Publique videoaulas com upload resiliente direto para o storage e acompanhe a transcodificação em tempo real.",
  },
  {
    icon: QrCode,
    title: "Validação Pública",
    description:
      "Qualquer pessoa confere a autenticidade de um certificado pelo QR Code impresso — sem login, com o documento do titular mascarado.",
  },
];

// Fluxo real do módulo (README § Fluxo do módulo SOPHIIA): uma sequência
// de etapas encadeadas — aqui a numeração 01…05 carrega informação.
const pipeline = [
  {
    title: "Instrutor publica a videoaula",
    description:
      "Upload resiliente por URL pré-assinada: o arquivo vai direto ao object storage, sem passar pela API.",
  },
  {
    title: "Transcodificação automática",
    description:
      "Confirmado o upload, um worker converte o vídeo para HLS multi-bitrate e publica os segmentos.",
  },
  {
    title: "O servidor assiste e conclui",
    description:
      "Player adaptativo com registro de progresso (heartbeat) e marcação de conclusão por aula.",
  },
  {
    title: "Consolidação da trilha",
    description:
      "Ao concluir 90% ou mais das aulas obrigatórias de uma versão de curso, o progresso vira “curso concluído”.",
  },
  {
    title: "Certificado emitido",
    description:
      "PDF institucional com QR Code, arquivado e disponível no Portal — validável publicamente pelo token.",
  },
];

const platform = [
  {
    icon: Boxes,
    title: "Clean Architecture em Go",
    description:
      "Monólito modular: o módulo SOPHIIA convive com os módulos de Usuários e Integrações no mesmo deployable.",
  },
  {
    icon: ScrollText,
    title: "Transactional Outbox + RabbitMQ",
    description:
      "Escrita atômica no PostgreSQL e publicação assíncrona dos eventos, com DLQ por fila e retry com backoff.",
  },
  {
    icon: Database,
    title: "PostgreSQL 16 · Redis · MinIO",
    description:
      "Catálogo, progresso e certificados no Postgres; Redis como buffer write-behind do player; MinIO (S3) para vídeo e PDFs.",
  },
  {
    icon: KeyRound,
    title: "Keycloak SSO ou login local",
    description:
      "OIDC com PKCE, ou login local com par de chaves RSA próprio. RBAC por papéis (sophiia-admin, sophiia-instructor, sophiia-user).",
  },
  {
    icon: ShieldCheck,
    title: "Segurança institucional",
    description:
      "Auditoria imutável, rate limiting distribuído, CSP com nonce por requisição e headers OWASP em toda resposta.",
  },
  {
    icon: FileCheck,
    title: "Feature flags e e-MAG",
    description:
      "O módulo liga/desliga em runtime sem redeploy; a interface segue o Modelo de Acessibilidade em Governo Eletrônico.",
  },
];

export default async function LandingPage() {
  await connection();
  const cookieStore = await cookies();
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <Logo size={30} />
          Projeto SOPHIIA
        </span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/sobre" className="text-muted hover:text-foreground">
            Sobre
          </Link>
          <Link href="/login">
            <Button size="sm">Entrar</Button>
          </Link>
        </nav>
      </header>

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-6 py-12"
      >
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <p className="dateline">{branding.orgName} · Capacitação e Certificação</p>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.15] text-foreground sm:text-5xl">
              Capacitação e certificação dos servidores dos sistemas municipais.
            </h1>
            <p className="max-w-xl text-base text-muted">
              O <strong className="font-semibold text-foreground">Projeto SOPHIIA</strong> reúne as
              videoaulas, as trilhas de curso e os certificados de todos os sistemas da instituição
              num só lugar — com streaming adaptativo, registro de progresso e emissão de
              certificados com validação pública por QR Code.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login">
                <Button size="md">Acessar o Portal</Button>
              </Link>
              <Link href="/sobre">
                <Button size="md" variant="secondary">
                  Como funciona
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <p className="dateline">O que a plataforma faz</p>
            <h2 className="text-2xl font-bold text-foreground">Três frentes, um só acesso</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {areas.map((area) => {
              const Icon = area.icon;
              return (
                <Card key={area.title}>
                  <CardHeader className="flex flex-row items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <CardTitle className="text-sm font-bold">{area.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs leading-relaxed text-muted">{area.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <p className="dateline">Do upload ao certificado</p>
            <h2 className="text-2xl font-bold text-foreground">O caminho de uma videoaula</h2>
            <p className="max-w-2xl text-sm text-muted">
              Cada etapa dispara a próxima por evento — sem trabalho manual entre elas.
            </p>
          </div>
          <ol className="flex flex-col gap-px overflow-hidden rounded-xl border border-surface-border bg-surface-border">
            {pipeline.map((step, i) => (
              <li key={step.title} className="flex gap-4 bg-surface p-5">
                <span className="font-mono text-xs font-bold text-seal">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">{step.title}</span>
                  <span className="text-xs leading-relaxed text-muted">{step.description}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <p className="dateline">Como é construída</p>
            <h2 className="text-2xl font-bold text-foreground">A plataforma por baixo</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platform.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex flex-col gap-2 rounded-xl border border-surface-border bg-surface p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs leading-relaxed text-muted">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer
        id="rodape"
        className="mx-auto flex w-full max-w-5xl items-center gap-4 border-t border-surface-border px-6 py-6 text-xs text-muted"
      >
        <Seal size={40} decorative className="text-surface-border" />
        <p>
          © {new Date().getFullYear()} {branding.orgName} · Projeto SOPHIIA
        </p>
      </footer>
    </div>
  );
}
