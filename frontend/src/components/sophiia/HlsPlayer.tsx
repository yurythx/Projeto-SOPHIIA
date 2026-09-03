"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface HlsPlayerProps {
  src: string; // URL do master.m3u8
  /** Chamado periodicamente (~a cada 10s) com a posição atual em segundos. */
  onProgress?: (positionSeconds: number) => void;
  /** Chamado quando o vídeo termina. */
  onEnded?: () => void;
  className?: string;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

// HlsPlayer reproduz HLS adaptativo. Usa o suporte nativo do navegador
// quando disponível (Safari/iOS) e cai para hls.js (Chrome/Firefox),
// carregado sob demanda para não pesar no bundle das telas sem player.
// Controles nativos (play/pause, volume, fullscreen) + botões de
// velocidade (a barra nativa não expõe isso de forma confiável).
export function HlsPlayer({ src, onProgress, onEnded, className }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const lastReport = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hls: any = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            video.src = src; // última tentativa
            return;
          }
          hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal?: boolean }) => {
            if (data?.fatal) setError("Falha ao carregar o vídeo.");
          });
        })
        .catch(() => setError("Não foi possível inicializar o player."));
    }

    function handleTimeUpdate() {
      if (!video || !onProgress) return;
      const now = Date.now();
      if (now - lastReport.current >= 10_000) {
        lastReport.current = now;
        onProgress(video.currentTime);
      }
    }
    function handleEnded() {
      onProgress?.(video?.duration ?? 0);
      onEnded?.();
    }

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      destroyed = true;
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      if (hls) hls.destroy();
    };
  }, [src, onProgress, onEnded]);

  const setPlaybackRate = useCallback((rate: number) => {
    setSpeed(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, []);

  return (
    <div className={className}>
      <div className="relative">
        <video ref={videoRef} controls playsInline className="aspect-video w-full bg-black" />
        <div className="pointer-events-none absolute right-2 top-2 flex gap-0.5 rounded-md bg-black/60 p-0.5 text-[11px] font-semibold backdrop-blur">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPlaybackRate(s)}
              className={`pointer-events-auto rounded px-1.5 py-0.5 transition-colors ${
                speed === s ? "bg-white text-black" : "text-white/80 hover:text-white"
              }`}
              aria-pressed={speed === s}
            >
              {s === 1 ? "1×" : `${s}×`}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger-strong">{error}</p>}
    </div>
  );
}
