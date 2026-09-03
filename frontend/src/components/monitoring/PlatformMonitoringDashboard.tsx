"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Layers,
  RefreshCw,
  Server,
  Users,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import type { IntegrationStatus } from "@/types/api";
import { apiClient } from "@/lib/api/client";

interface SystemHealthResponse {
  status: string;
  timestamp: string;
  version?: string;
  services?: Record<string, { status: string; latency_ms?: number }>;
}
const fetcher = (url: string) => apiClient.get<SystemHealthResponse>(url).then((res) => res.data);

interface SophiiaTelemetry {
  active_users: number;
  total_watch_hours: number;
}
const telemetryFetcher = (url: string) =>
  apiClient.get<SophiiaTelemetry>(url).then((res) => res.data);

// Metadados estáticos por dependência (o nome vem do backend em
// health.services). Status e latência são SEMPRE do backend — nada
// hardcoded aqui.
const SERVICE_META: Record<string, { label: string; description: string; icon: typeof Server }> = {
  postgres: {
    label: "PostgreSQL",
    description: "Banco relacional principal — catálogo, progresso, certificados e o Outbox.",
    icon: Database,
  },
  rabbitmq: {
    label: "RabbitMQ",
    description: "Broker AMQP — transcodificação, emissão de certificado e notificações.",
    icon: Layers,
  },
  redis: {
    label: "Redis",
    description: "Buffer write-behind do heartbeat do player e cache-aside de catálogo.",
    icon: Database,
  },
  minio: {
    label: "MinIO (S3)",
    description: "Object storage — MP4 bruto, segmentos HLS e PDFs de certificado.",
    icon: HardDrive,
  },
};

function toIndicator(status: string): IntegrationStatus {
  return status === "ok" ? "online" : "offline";
}

export function PlatformMonitoringDashboard() {
  const [lastCheckTime, setLastCheckTime] = useState<string>(
    new Date().toLocaleTimeString("pt-BR"),
  );

  const {
    data: health,
    error,
    mutate,
    isValidating,
  } = useSWR<SystemHealthResponse>("v1/monitoring/health", fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  const { data: telemetry, mutate: mutateTelemetry } = useSWR<SophiiaTelemetry>(
    "v1/sophiia/admin/telemetry",
    telemetryFetcher,
    { refreshInterval: 10000, revalidateOnFocus: true, shouldRetryOnError: false },
  );

  function handleRefresh() {
    void mutate();
    void mutateTelemetry();
    setLastCheckTime(new Date().toLocaleTimeString("pt-BR"));
  }

  const services = useMemo(() => {
    const entries = Object.entries(health?.services ?? {});
    return entries.map(([key, s]) => ({
      key,
      status: s.status,
      latencyMs: s.latency_ms ?? null,
      ...(SERVICE_META[key] ?? {
        label: key,
        description: "Dependência da plataforma.",
        icon: Server,
      }),
    }));
  }, [health]);

  const okCount = services.filter((s) => s.status === "ok").length;
  const isHealthy = !error && health?.status === "healthy";
  const avgLatency = useMemo(() => {
    const vals = services.map((s) => s.latencyMs).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [services]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        eyebrow="Telemetria & Infraestrutura"
        title="Monitoramento da Plataforma"
        subtitle="Saúde das dependências, barramento de eventos Outbox e telemetria de aprendizado, em tempo real."
        actions={
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                error
                  ? "bg-danger/10 text-danger-strong"
                  : isHealthy
                    ? "bg-success/10 text-success-strong"
                    : "bg-warning/10 text-warning-strong"
              }`}
            >
              {isHealthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {error ? "SEM RESPOSTA" : isHealthy ? "OPERACIONAL" : "DEGRADADO"}
            </span>
            <span className="text-xs text-muted">Atualizado às {lastCheckTime}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRefresh}
              disabled={isValidating}
              className="gap-2"
            >
              <RefreshCw size={14} className={isValidating ? "animate-spin" : ""} />
              Atualizar
            </Button>
          </>
        }
      />

      {/* KPIs — todos derivados do /api/v1/monitoring/health */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Dependências"
          value={services.length ? `${okCount}/${services.length} ativas` : "—"}
          hint={
            error
              ? "endpoint de health sem resposta"
              : isHealthy
                ? "todas alcançáveis"
                : "há dependência fora"
          }
          icon={CheckCircle2}
          tone={
            error
              ? "danger"
              : okCount === services.length && services.length
                ? "success"
                : "warning"
          }
        />
        <KpiCard
          label="Latência média"
          value={avgLatency != null ? `${avgLatency} ms` : "—"}
          hint="tempo de resposta das verificações"
          icon={Clock}
          tone="accent"
        />
        <KpiCard
          label="Revisão em produção"
          value={health?.version || "—"}
          hint="commit da imagem em execução"
          icon={Layers}
          tone="primary"
        />
        <KpiCard
          label="Última verificação"
          value={health?.timestamp ? new Date(health.timestamp).toLocaleTimeString("pt-BR") : "—"}
          hint="carimbo do backend"
          icon={Clock}
          tone="accent"
        />
      </section>

      {/* Telemetria de aprendizado SOPHIIA */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Telemetria de aprendizado</h2>
          <p className="text-xs text-muted">
            Consumo de videoaulas em tempo real, do Redis Heartbeat.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-l-4 border-l-primary/70">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted">
                  Espectadores ativos
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users size={16} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {telemetry ? telemetry.active_users.toLocaleString("pt-BR") : "--"}
              </div>
              <p className="mt-1 text-xs text-muted">
                Servidores consumindo conteúdo no player agora.
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-accent/70">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted">
                  Horas de qualificação
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Video size={16} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {telemetry ? telemetry.total_watch_hours.toLocaleString("pt-BR") : "--"}{" "}
                <span className="text-lg font-medium text-muted">h</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Tempo total de vídeo entregue na plataforma.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Dependências — status e latência reais */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Infraestrutura & dependências</h2>
          <p className="text-xs text-muted">
            Verificadas a cada 10&nbsp;s pelo backend (<code>GET /api/v1/monitoring/health</code>).
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger-strong">
            Não foi possível obter o relatório de saúde do backend.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.key} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={20} />
                    </div>
                    <StatusIndicator status={toIndicator(s.status)} />
                  </div>
                  <CardTitle className="pt-2 text-base font-bold">{s.label}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed text-muted">
                    {s.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-2 flex items-center justify-between border-t border-surface-border/50 py-3 text-xs">
                  <span className="text-muted">Latência</span>
                  <span
                    className={`font-mono font-medium ${
                      s.status === "ok" ? "text-success-strong" : "text-danger-strong"
                    }`}
                  >
                    {s.latencyMs != null ? `${s.latencyMs} ms` : "—"}
                  </span>
                </CardContent>
              </Card>
            );
          })}
          {!error && services.length === 0 && (
            <p className="text-xs text-muted">Carregando dependências…</p>
          )}
        </div>
      </section>

      {/* Explicativo do Transactional Outbox (documentação) */}
      <section className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning-strong">
                <Layers size={20} />
              </div>
              <div>
                <CardTitle className="text-base">Barramento Transactional Outbox</CardTitle>
                <CardDescription className="text-xs">
                  Como os eventos de negócio são entregues sem dual-write com o broker.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-xs">
            <div className="grid gap-4 rounded-lg border border-surface-border bg-surface/30 p-4 sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Persistência</span>
                <span className="font-semibold text-foreground">
                  PostgreSQL <code>outbox_events</code>
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Transporte</span>
                <span className="font-semibold text-foreground">
                  RabbitMQ (LISTEN/NOTIFY + relay)
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Falhas</span>
                <span className="font-semibold text-foreground">
                  Backoff exponencial + DLQ por fila
                </span>
              </div>
            </div>
            <p className="leading-relaxed text-muted">
              As mutações e a emissão de eventos são gravadas na mesma transação SQL. O worker de
              Outbox varre os eventos não publicados e os distribui ao RabbitMQ — resiliente a
              falhas de rede.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Server;
  tone: "success" | "warning" | "danger" | "primary" | "accent";
}) {
  const toneClass = {
    success: "bg-success/10 text-success-strong",
    warning: "bg-warning/10 text-warning-strong",
    danger: "bg-danger/10 text-danger-strong",
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
          <span className="truncate text-xl font-bold text-foreground">{value}</span>
          <span className="text-[11px] text-muted">{hint}</span>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}
        >
          <Icon size={20} />
        </div>
      </CardContent>
    </Card>
  );
}
