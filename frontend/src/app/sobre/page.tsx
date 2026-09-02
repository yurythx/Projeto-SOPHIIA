import { Accessibility, GraduationCap, ShieldCheck, Workflow } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Logo } from "@/components/ui/Logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { BRANDING_COOKIE, parseBrandingCookie } from "@/components/branding/brandingConfig";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);
  const description =
    `Como a plataforma SOPHIIA de capacitação e certificação da ${branding.orgName} funciona: as três áreas (Portal do Servidor, ` +
    `Studio do Instrutor, Validação Pública), o fluxo por eventos do upload ao certificado e as garantias de segurança.`;

  return {
    title: "Sobre — Projeto SOPHIIA",
    description,
    openGraph: { title: "Sobre o Projeto SOPHIIA", description, type: "website" },
  };
}

const principles = [
  {
    icon: GraduationCap,
    title: "Três áreas, um acesso",
    description:
      "Portal do Servidor (assistir e concluir), Studio do Instrutor (publicar videoaulas) e a Validação Pública de certificados — sob o mesmo login institucional.",
  },
  {
    icon: Workflow,
    title: "Fluxo por eventos",
    description:
      "Cada etapa dispara a próxima por mensagem: Transactional Outbox no PostgreSQL + RabbitMQ, com workers idempotentes para transcodificação, certificado e e-mail.",
  },
  {
    icon: ShieldCheck,
    title: "Segurança institucional",
    description:
      "Keycloak SSO (OIDC/PKCE) ou login local com chave RSA própria, RBAC por papéis, auditoria imutável, rate limiting distribuído e CSP com nonce.",
  },
  {
    icon: Accessibility,
    title: "Acessível e configurável",
    description:
      "Interface em conformidade com o e-MAG (alto contraste, redimensionamento de fonte, VLibras) e o módulo inteiro atrás de uma feature flag ligável em runtime.",
  },
];

// Fluxo do módulo SOPHIIA (README § Fluxo do módulo SOPHIIA).
const flow = [
  {
    step: "Instrutor gera a URL de upload",
    detail: "POST …/sophiia/admin/lessons/{id}/upload-url → Presigned PUT em raw-uploads/",
  },
  {
    step: "Cliente envia o MP4 direto ao MinIO",
    detail: "PUT <presigned-url> — o binário não passa pela API",
  },
  {
    step: "Instrutor confirma o upload",
    detail:
      "POST …/admin/video-assets/{id}/confirm → transação: PROCESSING + outbox video.uploaded",
  },
  {
    step: "Worker de vídeo",
    detail: "consome sophiia.video.transcode → FFmpeg → hls/<lesson>/ → video_asset READY",
  },
  {
    step: "Servidor assiste e conclui as aulas",
    detail: "player HLS + …/portal/progress/heartbeat + …/portal/lessons/{id}/complete",
  },
  {
    step: "Consolidação da trilha",
    detail: "≥ 90% das aulas obrigatórias → na virada, outbox course.completed",
  },
  {
    step: "Worker de certificado",
    detail:
      "consome sophiia.cert.generate → PDF (Maroto v2) + QR → tabela certificates + evento notification.email.requested (mesma transação)",
  },
  {
    step: "Worker de notificação",
    detail: "consome sophiia.notify.email → e-mail institucional (SMTP; em dev, só log)",
  },
  {
    step: "Validação pública",
    detail:
      "GET /api/v1/public/certificates/validate/{token} — sem autenticação, documento do titular mascarado",
  },
];

const owaspMapping = [
  {
    code: "A01",
    risk: "Broken Access Control",
    today:
      "RBAC por permissão em cada rota — o Studio exige o papel de instrutor; o Portal exige apenas sessão válida.",
  },
  {
    code: "A02",
    risk: "Cryptographic Failures",
    today:
      "RS256 com chave própria no login local, bcrypt, segredos por arquivo; em produção o startup recusa TLS desligado para banco e storage.",
  },
  {
    code: "A03",
    risk: "Injection",
    today:
      "100% das consultas parametrizadas — zero concatenação de string em SQL em todo o backend.",
  },
  {
    code: "A04",
    risk: "Insecure Design",
    today:
      "Monólito modular com fronteiras de módulo e decisões de arquitetura registradas em ADRs.",
  },
  {
    code: "A05",
    risk: "Security Misconfiguration",
    today:
      "CSP com nonce por requisição, containers non-root, headers de segurança em toda resposta.",
  },
  {
    code: "A07",
    risk: "Identification & Auth Failures",
    today:
      "Bloqueio de conta, rate limiting distribuído e erro sempre genérico — nunca revela se um usuário existe.",
  },
  {
    code: "A08",
    risk: "Software & Data Integrity Failures",
    today:
      "Idempotência por evento e outbox transacional: o certificado e o pedido de e-mail commitam juntos, ou nenhum dos dois.",
  },
  {
    code: "A09",
    risk: "Logging & Monitoring Failures",
    today:
      "Auditoria imutável (a tabela recusa UPDATE/DELETE), logs correlacionados por request id, métricas e tracing.",
  },
];

export default async function AboutPage() {
  await connection();
  const cookieStore = await cookies();
  const branding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Logo size={32} />
          Projeto SOPHIIA
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted hover:text-foreground">
            Início
          </Link>
          <Link href="/login">
            <Button size="sm">Entrar</Button>
          </Link>
        </nav>
      </header>

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-12"
      >
        <section className="flex flex-col gap-4">
          <p className="dateline">{branding.orgName}</p>
          <h1 className="text-3xl font-bold text-foreground">Sobre a plataforma SOPHIIA</h1>
          <p className="text-muted">
            <strong>SOPHIIA</strong> —{" "}
            <em>
              Sistema Organizacional de Plataforma de Habilitação, Instrução e Inteligência Aplicada
            </em>{" "}
            — é a plataforma institucional de{" "}
            <strong className="font-semibold text-foreground">
              capacitação, documentação e auditoria operacional
            </strong>{" "}
            dos sistemas municipais: videoaulas com streaming HLS adaptativo, trilhas de curso
            versionadas, consolidação de progresso e emissão de certificados com validação pública
            por QR Code.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-foreground">Como está organizada</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {principles.map((principle) => {
              const Icon = principle.icon;
              return (
                <Card key={principle.title}>
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <CardTitle className="text-base">{principle.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted">{principle.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Do upload ao certificado</h2>
            <p className="mt-1 text-sm text-muted">
              O caminho de uma videoaula pela plataforma. Cada etapa dispara a próxima por evento.
            </p>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Etapa</TableHeaderCell>
                <TableHeaderCell>Rota / evento</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flow.map((row, i) => (
                <TableRow key={row.step}>
                  <TableCell className="whitespace-nowrap align-top font-medium text-foreground">
                    <span className="font-mono text-xs font-semibold text-seal">
                      {String(i + 1).padStart(2, "0")}
                    </span>{" "}
                    {row.step}
                  </TableCell>
                  <TableCell className="align-top font-mono text-xs text-muted">
                    {row.detail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">OWASP Top 10</h2>
            <p className="mt-1 text-sm text-muted">
              Tratado como checklist de engenharia desde o primeiro commit. A coluna da direita
              descreve a prática hoje no Projeto SOPHIIA.
            </p>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Risco</TableHeaderCell>
                <TableHeaderCell>Prática hoje no Projeto SOPHIIA</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {owaspMapping.map((item) => (
                <TableRow key={item.code}>
                  <TableCell className="whitespace-nowrap align-top font-medium text-foreground">
                    <span className="font-mono text-xs font-semibold text-seal">{item.code}</span>{" "}
                    {item.risk}
                  </TableCell>
                  <TableCell className="text-muted">{item.today}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-foreground">Stack de tecnologias</h2>
          <p className="text-muted">
            <strong>Backend em Go (Clean Architecture):</strong> monólito modular (Go 1.26),
            PostgreSQL 16, RabbitMQ (AMQP), Redis, MinIO (S3), FFmpeg para HLS e Maroto v2 para o
            PDF do certificado com QR Code.
          </p>
          <p className="text-muted">
            <strong>Frontend em Next.js 16 (App Router):</strong> React 19 com TypeScript, Tailwind
            CSS, NextAuth (SSO Keycloak + login local) e WebSocket para notificações em tempo real.
          </p>
        </section>
      </main>

      <footer
        id="rodape"
        className="border-t border-surface-border px-6 py-6 text-center text-xs text-muted"
      >
        © {new Date().getFullYear()} {branding.orgName} · Projeto SOPHIIA
      </footer>
    </div>
  );
}
