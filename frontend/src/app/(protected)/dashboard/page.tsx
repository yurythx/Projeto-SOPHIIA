import { getServerSession } from "next-auth/next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  GraduationCap,
  PlayCircle,
  Plug,
  Settings,
  Shield,
  Users,
  Video,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { authOptions } from "@/lib/auth/options";
import { ApiError } from "@/lib/api/client";
import { serverApiGet } from "@/lib/api/server";
import type { Integration } from "@/types/api";
import { RoleGate } from "@/components/auth/RoleGate";
import { SOPHIIA_ROLES } from "@/lib/auth/rbac";

function PlatformStatCell({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Shield;
}) {
  return (
    <div className="flex min-w-[10rem] flex-1 items-center gap-4 rounded-xl border border-surface-border bg-surface p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={20} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="font-mono text-xl font-bold text-foreground">{value}</span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
    </div>
  );
}

export default async function DashboardOverviewPage() {
  const session = await getServerSession(authOptions);
  const firstName = (session?.user?.name ?? session?.user?.email ?? "").split(/[@\s]/)[0];

  const competencia = new Date()
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .toUpperCase();

  let integrations: Integration[] | null = null;
  let errorMessage: string | null = null;

  try {
    const integrationsRes = await serverApiGet<Integration[]>("v1/integrations");
    integrations = integrationsRes.data;
  } catch (err) {
    errorMessage = err instanceof ApiError ? err.message : "Falha ao carregar integracoes";
  }

  const modules = [
    {
      id: "portal",
      title: "Portal do Servidor",
      description:
        "Videoaulas com streaming HLS adaptativo, registro de progresso e certificados dos sistemas municipais.",
      icon: PlayCircle,
      tag: "Capacitação",
      status: "ATIVO",
      href: "/portal",
    },
    {
      id: "studio",
      title: "Studio do Instrutor",
      description:
        "Publicação de videoaulas com upload resiliente por URL pré-assinada e acompanhamento da transcodificação HLS.",
      icon: Clapperboard,
      tag: "Instrução",
      status: "ATIVO",
      href: "/studio",
    },
    {
      id: "users",
      title: "Gestão de Usuários & Perfis",
      description:
        "Contas locais, sincronização Keycloak SSO e atribuição de papéis (sophiia-admin, sophiia-instructor, sophiia-user).",
      icon: Users,
      tag: "Segurança & RBAC",
      status: "ATIVO",
      href: "/configuracao/usuarios",
    },
    {
      id: "integrations",
      title: "Barramento de Integrações",
      description: "Saúde dos provedores externos de apoio e registros de conectividade.",
      icon: Plug,
      tag: "Conectividade",
      status: "ONLINE",
      href: "/integracoes",
    },
    {
      id: "monitoring",
      title: "Monitoramento & Telemetria",
      description:
        "Métricas Prometheus, OpenTelemetry e a saúde do Transactional Outbox / RabbitMQ e dos workers.",
      icon: Activity,
      tag: "Observabilidade",
      status: "MONITORADO",
      href: "/monitoramento",
    },
  ];

  return (
    <RoleGate allowedRoles={[SOPHIIA_ROLES.ADMIN]} showErrorPanel>
      <div className="flex flex-col gap-8 pb-10">
        <PageHeader
          eyebrow={`Projeto SOPHIIA · ${competencia}`}
          title={firstName ? `Bem-vindo(a), ${firstName}` : "Visão geral"}
          subtitle="Acompanhe a capacitação dos servidores, as integrações e a saúde da plataforma."
          actions={
            <>
              <Link href="/portal">
                <Button size="sm" className="gap-2">
                  <GraduationCap size={16} />
                  Ir para o Portal
                </Button>
              </Link>
              <Link href="/configuracao">
                <Button size="sm" variant="secondary" className="gap-2">
                  <Settings size={16} />
                  Configurações
                </Button>
              </Link>
            </>
          }
        />

        {/* Indicadores da plataforma */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Indicadores da plataforma
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PlatformStatCell
              label="Capacitação"
              value="Módulo SOPHIIA"
              hint="Portal · Studio · Validação pública"
              icon={GraduationCap}
            />
            <PlatformStatCell
              label="Autenticação"
              value="OIDC + SSO"
              hint="Keycloak & login local RSA"
              icon={Shield}
            />
            <PlatformStatCell
              label="Mensageria"
              value="Outbox EventBus"
              hint="PostgreSQL + RabbitMQ DLQ"
              icon={Zap}
            />
            <PlatformStatCell
              label="Vídeo"
              value="HLS adaptativo"
              hint="FFmpeg → MinIO (S3)"
              icon={Video}
            />
          </div>
        </section>

        {/* Áreas e administração */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Áreas e administração</h2>
              <p className="text-xs text-muted">
                As áreas do SOPHIIA e a administração da plataforma.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <Card
                  key={mod.id}
                  className="relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon size={22} />
                      </div>
                      <span className="rounded-md bg-surface-border/60 px-2 py-1 text-[11px] font-medium text-foreground">
                        {mod.tag}
                      </span>
                    </div>
                    <CardTitle className="pt-2 text-base font-bold">{mod.title}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed text-muted">
                      {mod.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-2 flex items-center justify-between border-t border-surface-border/50 py-3 pt-0 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-success-strong">
                      <CheckCircle2 size={14} />
                      {mod.status}
                    </span>
                    <Link
                      href={mod.href}
                      className="flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      Acessar <ArrowRight size={14} />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Status de Conectividade e Integrações */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Status de serviços & integrações</h2>
            <Link href="/integracoes" className="text-xs text-primary hover:underline">
              Ver todas →
            </Link>
          </div>
          <Card>
            <CardContent className="pt-4">
              {errorMessage && <ErrorState message={errorMessage} />}
              {integrations && (
                <ul className="flex flex-col divide-y divide-surface-border">
                  {integrations.map((integration) => (
                    <li key={integration.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-border/40 text-foreground">
                          <Plug size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{integration.name}</p>
                          <p className="text-xs text-muted">Serviço externo de apoio</p>
                        </div>
                      </div>
                      <StatusIndicator status={integration.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </RoleGate>
  );
}
