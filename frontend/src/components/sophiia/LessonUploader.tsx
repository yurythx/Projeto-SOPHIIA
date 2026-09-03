"use client";

import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, UploadCloud } from "lucide-react";

import { useToast } from "@/components/notifications/ToastProvider";
import { putToPresignedUrl, sophiiaApi, type VideoAsset } from "@/lib/api/sophiia";

type Phase = "requesting" | "uploading" | "confirming";

// LessonUploader: o widget de upload + transcodificação de UMA lição.
// Mostra duas barras — envio ao MinIO (%) e transcodificação HLS (% vindo
// de video_assets.progress_percent). Reutilizado por lição na página do
// curso. onChanged avisa o pai para atualizar contadores.
export function LessonUploader({
  lessonId,
  onChanged,
}: {
  lessonId: string;
  onChanged?: () => void;
}) {
  const { showToast } = useToast();
  const [busyPhase, setBusyPhase] = useState<Phase | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: asset, mutate } = useSWR<VideoAsset | undefined>(
    ["sophiia/lesson-video", lessonId],
    () => sophiiaApi.getLessonVideo(lessonId).catch(() => undefined),
    {
      // Enquanto transcodifica, atualiza rápido para a barra andar.
      refreshInterval: (d) => (d?.status === "PROCESSING" || d?.status === "UPLOADING" ? 2500 : 0),
    },
  );

  const status = busyPhase ? "UPLOADING" : (asset?.status ?? "NONE");

  const startUpload = useCallback(
    async (file: File) => {
      setLocalError(null);
      setUploadPct(0);
      try {
        setBusyPhase("requesting");
        const ticket = await sophiiaApi.createUploadUrl(lessonId);
        setBusyPhase("uploading");
        await putToPresignedUrl(ticket.upload_url, file, setUploadPct);
        setBusyPhase("confirming");
        await sophiiaApi.confirmUpload(ticket.video_asset_id);
        setBusyPhase(null);
        await mutate();
        onChanged?.();
        showToast({ title: "Upload concluído", description: "Transcodificando…", tone: "info" });
      } catch (e) {
        setBusyPhase(null);
        setLocalError(e instanceof Error ? e.message : "Erro no upload.");
        showToast({ title: "Falha no upload", tone: "danger" });
      }
    },
    [lessonId, mutate, onChanged, showToast],
  );

  function pickFile() {
    fileInput.current?.click();
  }

  return (
    <div className="rounded-lg border border-surface-border bg-background p-3">
      <input
        ref={fileInput}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void startUpload(f);
        }}
      />

      {status === "NONE" && (
        <button
          type="button"
          onClick={pickFile}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-surface-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/60"
        >
          <UploadCloud className="h-4 w-4 text-primary" /> Enviar videoaula (MP4/MOV)
        </button>
      )}

      {status === "UPLOADING" && (
        <Progress
          label={
            busyPhase === "requesting"
              ? "Gerando URL de upload…"
              : busyPhase === "confirming"
                ? "Confirmando…"
                : "Enviando ao storage…"
          }
          pct={uploadPct}
        />
      )}

      {status === "PROCESSING" && (
        <Progress
          label="Transcodificando para HLS…"
          pct={asset?.progress_percent ?? 0}
          tone="warn"
        />
      )}

      {status === "READY" && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-success-strong">
            <CheckCircle2 className="h-4 w-4" /> Vídeo pronto (HLS publicado)
            {asset?.duration_seconds ? ` · ${fmtDur(asset.duration_seconds)}` : ""}
          </span>
          <button
            type="button"
            onClick={pickFile}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Substituir
          </button>
        </div>
      )}

      {status === "FAILED" && (
        <div className="space-y-1.5">
          <p className="flex items-start gap-1.5 text-xs text-danger-strong">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {asset?.error_message ?? "Falha na transcodificação."}
          </p>
          <button
            type="button"
            onClick={pickFile}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <RotateCcw className="h-3 w-3" /> Reenviar vídeo
          </button>
        </div>
      )}

      {localError && status !== "FAILED" && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-danger-strong">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {localError}
        </p>
      )}
    </div>
  );
}

function Progress({
  label,
  pct,
  tone = "primary",
}: {
  label: string;
  pct: number;
  tone?: "primary" | "warn";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> {label}
        </span>
        <span className="font-mono">{clamped}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border/50"
      >
        <div
          className={`h-full transition-all ${tone === "warn" ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
