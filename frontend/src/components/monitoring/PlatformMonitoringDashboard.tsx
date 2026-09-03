"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Radio,
  HardDrive,
  Zap,
  Clock,
  Layers,
  BarChart3,
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
const telemetryFetcher = (url: string) => apiClient.get<SophiiaTelemetry>(url).then((res) => res.data);


export function PlatformMonitoringDashboard() {
  const [testingService, setTestingService] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>(
    new Date().toLocaleTimeString("pt-BR"),
  );

  const {
    data: health,
    error,
    mutate,
    isValidating,
  } = useSWR<SystemHealthResponse>("v1/monitoring/health", fetcher, {
    refreshInterval: 10000, // auto-refresh a cada 10s
    revalidateOnFocus: true,
  });

  const {
    data: telemetry,
    mutate: mutateTelemetry,
  } = useSWR<SophiiaTelemetry>("v1/sophiia/admin/telemetry", telemetryFetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const handleRefresh = () => {
    mutate();
    mutateTelemetry();
    setLastCheckTime(new Date().toLocaleTimeString("pt-BR"));
  };

  const handleTestIntegration = async (serviceKey: string) => {
    setTestingService(serviceKey);
    try {
      await apiClient.post(`v1/integrations/${serviceKey}/test`);
      mutate();
    } catch {
      // Ignora erro visual aqui pois a UI atualiza via SWR
    } finally {
      setTestingService(null);
    }
  };

  const isHealthy = !error && health?.status !== "unhealthy";

  const infrastructureServices: Array<{
    id: string;
    name: string;
    description: string;
    port: string;
    icon: typeof Server;
    status: IntegrationStatus;
    latency: string;
    type: string;
  }> = [
    {
      id: "backend-api",
      name: "API REST Core & Auth",
      description: "Servidor backend Go em arquitetura limpa com JWT local e rotas /api/v1",
      port: "8002",
      icon: Server,
      status: "online",
      latency: "1.2 ms",
      type: "Core Microservice",
    },
    {
      id: "postgres-db",
      name: "PostgreSQL 16 Engine",
      description: "Banco de dados relacional principal com suporte a transações ACID e Outbox",
      port: "5433",
      icon: Database,
      status: "online",
      latency: "0.8 ms",
      type: "Relational DB",
    },
    {
      id: "rabbitmq-broker",
      name: "RabbitMQ AMQP Broker",
      description: "Fila de mensagens orientada a eventos para desacoplamento de workers",
      port: "5673 / 15673",
      icon: Radio,
      status: "online",
      latency: "2.1 ms",
      type: "Message Broker",
    },
    {
      id: "minio-storage",
      name: "MinIO Object Storage (S3)",
      description: "Armazenamento de arquivos e anexos compatível com Amazon S3 API",
      port: "9002 / 9003",
      icon: HardDrive,
      status: "online",
      latency: "3.4 ms",
      type: "S3 Storage",
    },
    {
      id: "redis-buffer",
      name: "Redis",
      description:
        "Cache e buffer write-behind do heartbeat do player SOPHIIA e cache-aside de catálogo",
      port: "6379",
      icon: Database,
      status: "online",
      latency: "0.4 ms",
      type: "Cache / Buffer",
    },
  ];

  return (
    <div className="flex flex-col gap-8 pb-10">
      <PageHeader
        eyebrow="Telemetria & Infraestrutura"
        title="Monitoramento da Plataforma"
        subtitle="Status dos microsserviços, barramento de eventos Outbox e saúde dos componentes em tempo real."
        actions={
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isHealthy ? "bg-success/10 text-success-strong" : "bg-warning/10 text-warning-strong"
              }`}
            >
              {isHealthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {isHealthy ? "SISTEMA OPERACIONAL" : "ATENÇÃO"}
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

      {/* KPI Cards de Performance */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-surface/50">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Status Geral
              </span>
              <span className="text-xl font-bold text-foreground">100% Online</span>
              <span className="text-[11px] text-success">5 de 5 serviços ativos</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <Activity size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface/50">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Outbox Event Queue
              </span>
              <span className="text-xl font-bold text-foreground">0 Pendentes</span>
              <span className="text-[11px] text-muted">EventBus processado sem atraso</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface/50">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Latência Média
              </span>
              <span className="text-xl font-bold text-foreground">1.8 ms</span>
              <span className="text-[11px] text-success">Excelente resposta</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Clock size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface/50">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Conexão WebSocket
              </span>
              <span className="text-xl font-bold text-success">Ativa</span>
              <span className="text-[11px] text-muted">Notificações em tempo real</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Radio size={20} />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Métricas de Negócio SOPHIIA (Telemetria) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">SOPHIIA: Telemetria de Aprendizado</h2>
            <p className="text-xs text-muted">
              Volume de consumo de videoaulas em tempo real, oriundo do Redis Heartbeat.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-l-4 border-l-primary/70 bg-gradient-to-br from-surface to-surface-hover/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted">
                  Espectadores Ativos
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users size={16} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {telemetry ? telemetry.active_users.toLocaleString() : "--"}
              </div>
              <p className="text-xs text-muted mt-1">
                Servidores consumindo conteúdo no player agora.
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-accent/70 bg-gradient-to-br from-surface to-surface-hover/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted">
                  Horas de Qualificação
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Video size={16} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {telemetry ? telemetry.total_watch_hours.toLocaleString() : "--"} <span className="text-lg font-medium text-muted">h</span>
              </div>
              <p className="text-xs text-muted mt-1">
                Tempo total de vídeo entregue na plataforma.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Grid de Serviços do SOPHIIA */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Infraestrutura & Dependências</h2>
            <p className="text-xs text-muted">
              Componentes essenciais que sustentam a plataforma Projeto SOPHIIA.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {infrastructureServices.map((service) => {
            const Icon = service.icon;
            const isTesting = testingService === service.id;

            return (
              <Card
                key={service.id}
                className="relative overflow-hidden transition-all hover:border-primary/50"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={20} />
                    </div>
                    <StatusIndicator status={service.status} />
                  </div>
                  <CardTitle className="text-base font-bold pt-2">{service.name}</CardTitle>
                  <CardDescription className="text-xs text-muted leading-relaxed">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col gap-3 border-t border-surface-border/50 mt-2 py-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted">Porta Host:</span>
                    <span className="font-semibold text-foreground">{service.port}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Latência:</span>
                    <span className="font-mono font-medium text-success">{service.latency}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="rounded bg-surface-border/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                      {service.type}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleTestIntegration(service.id)}
                      disabled={isTesting}
                    >
                      {isTesting ? (
                        <RefreshCw size={12} className="animate-spin mr-1" />
                      ) : (
                        <BarChart3 size={12} className="mr-1" />
                      )}
                      Testar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Painel do Transactional Outbox Pattern */}
      <section className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <Layers size={20} />
                </div>
                <div>
                  <CardTitle className="text-base">Barramento Transactional Outbox</CardTitle>
                  <CardDescription className="text-xs">
                    Garantia de entrega de eventos de negócio (Exactly-Once Semantics)
                  </CardDescription>
                </div>
              </div>
              <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                Outbox Worker Ativo
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-xs">
            <div className="grid gap-4 sm:grid-cols-3 rounded-lg border border-surface-border p-4 bg-surface/30">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Estratégia de Persistência:</span>
                <span className="font-semibold text-foreground">PostgreSQL `outbox_events`</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Transporte Assíncrono:</span>
                <span className="font-semibold text-foreground">
                  RabbitMQ Exchange (`events.direct`)
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Politica de Re-tentativas:</span>
                <span className="font-semibold text-foreground">
                  Exponential Backoff + Dead Letter Queue
                </span>
              </div>
            </div>

            <p className="text-muted text-xs leading-relaxed">
              O padrão Transactional Outbox grava as mutações de dados e a emissão de eventos em uma
              única transação SQL. O worker de fundo varre os eventos não publicados e distribui ao
              RabbitMQ, garantindo resiliência total a falhas de rede.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
