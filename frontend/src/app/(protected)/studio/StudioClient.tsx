"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud, Video } from "lucide-react";

import { useToast } from "@/components/notifications/ToastProvider";
import { CatalogWizard } from "@/components/sophiia/CatalogWizard";
import { LessonPicker } from "@/components/sophiia/LessonPicker";
import { putToPresignedUrl, sophiiaApi, type VideoStatus } from "@/lib/api/sophiia";

type Phase = "idle" | "requesting" | "uploading" | "confirming" | "processing" | "ready" | "failed";

export function StudioClient() {
  const { showToast } = useToast();
  const [lessonId, setLessonId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [videoStatus, setVideoStatus] = useState<VideoStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const asset = await sophiiaApi.getLessonVideo(id);
          setVideoStatus(asset.status);
          if (asset.status === "READY") {
            setPhase("ready");
            setErrorMsg(null);
            stopPolling();
            showToast({ title: "Transcodificação concluída", tone: "success" });
          } else if (asset.status === "FAILED") {
            setPhase("failed");
            setErrorMsg(asset.error_message ?? "Falha na transcodificação.");
            stopPolling();
            showToast({ title: "Transcodificação falhou", tone: "danger" });
          }
        } catch {
          /* mantém o polling; erro transitório */
        }
      }, 4000);
    },
    [showToast, stopPolling],
  );

  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    lessonId.trim(),
  );

  async function handleUpload() {
    if (!uuidOk || !file) return;
    const id = lessonId.trim();
    setErrorMsg(null);
    setPct(0);
    try {
      setPhase("requesting");
      const ticket = await sophiiaApi.createUploadUrl(id);

      setPhase("uploading");
      await putToPresignedUrl(ticket.upload_url, file, setPct);

      setPhase("confirming");
      await sophiiaApi.confirmUpload(ticket.video_asset_id);

      setPhase("processing");
      setVideoStatus("PROCESSING");
      poll(id);
      showToast({
        title: "Upload concluído",
        description: "Transcodificação HLS em andamento…",
        tone: "info",
      });
    } catch (e) {
      setPhase("failed");
      setErrorMsg(e instanceof Error ? e.message : "Erro no upload.");
      showToast({ title: "Falha no upload", tone: "danger" });
    }
  }

  const busy = ["requesting", "uploading", "confirming"].includes(phase);

  return (
    <div className="space-y-6">
      <header className="border-b border-surface-border pb-4">
        <h1 className="text-2xl font-bold text-foreground">Studio do Instrutor — SOPHIIA</h1>
        <p className="text-sm text-muted">
          Upload resiliente de videoaula (Presigned PUT direto no MinIO) e transcodificação HLS
          multi-bitrate.
        </p>
      </header>

      <CatalogWizard onLessonCreated={(id) => setLessonId(id)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-surface-border bg-surface p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <UploadCloud className="h-4 w-4 text-primary" /> Enviar videoaula
          </h2>

          <LessonPicker value={lessonId} onChange={setLessonId} />
          {lessonId && !uuidOk && (
            <span className="block text-[11px] text-danger-strong">
              ID de lição inválido — selecione uma lição acima.
            </span>
          )}

          <label
            className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              file ? "border-primary/50" : "border-surface-border hover:border-primary/50"
            }`}
          >
            <input
              type="file"
              accept="video/mp4,video/quicktime"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Video className="mb-2 h-8 w-8 text-muted" />
            <span className="text-xs font-semibold text-foreground">
              {file ? file.name : "Clique para escolher o MP4"}
            </span>
            <span className="mt-1 text-[10px] text-muted">
              {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "MP4 / MOV"}
            </span>
          </label>

          <button
            onClick={handleUpload}
            disabled={!uuidOk || !file || busy || phase === "processing"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {phaseLabel(phase)}
          </button>

          {(phase === "uploading" || phase === "confirming") && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border/50">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-surface-border bg-surface p-5">
          <h2 className="text-base font-bold text-foreground">Status</h2>
          <StatusLine phase={phase} videoStatus={videoStatus} />
          {errorMsg && (
            <p className="flex items-start gap-1.5 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {errorMsg}
            </p>
          )}
          <p className="border-t border-surface-border pt-3 text-[11px] text-muted">
            Use o assistente acima para criar a estrutura (sistema → curso → versão → módulo →
            lição) — a lição nova já fica selecionada — ou escolha uma lição existente no seletor
            Sistema → Curso → Lição. Requer a role <code>sophiia-instructor</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "requesting":
      return "Gerando URL…";
    case "uploading":
      return "Enviando…";
    case "confirming":
      return "Confirmando…";
    case "processing":
      return "Transcodificando…";
    case "ready":
      return "Enviar outra";
    default:
      return "Enviar e transcodificar";
  }
}

function StatusLine({ phase, videoStatus }: { phase: Phase; videoStatus: VideoStatus | null }) {
  if (phase === "ready" || videoStatus === "READY") {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" /> Vídeo pronto (HLS publicado)
      </p>
    );
  }
  if (phase === "failed" || videoStatus === "FAILED") {
    return (
      <p role="alert" aria-live="assertive" className="flex items-center gap-2 text-sm text-danger">
        <AlertTriangle className="h-4 w-4" /> Falhou
      </p>
    );
  }
  if (phase === "processing" || videoStatus === "PROCESSING") {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-warning">
        <Loader2 className="h-4 w-4 animate-spin" /> Transcodificação em andamento
      </p>
    );
  }
  if (phase === "idle") {
    return <p className="text-sm text-muted">Aguardando envio.</p>;
  }
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {phaseLabel(phase)}
    </p>
  );
}
