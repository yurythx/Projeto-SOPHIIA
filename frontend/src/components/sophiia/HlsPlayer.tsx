"use client";

import { useEffect, useRef, useState } from "react";

interface HlsPlayerProps {
  src: string; // URL do master.m3u8
  /** Chamado periodicamente (~a cada 10s) com a posição atual em segundos. */
  onProgress?: (positionSeconds: number) => void;
  /** Chamado quando o vídeo termina. */
  onEnded?: () => void;
  className?: string;
}

// HlsPlayer reproduz HLS adaptativo. Usa o suporte nativo do navegador
// quando disponível (Safari/iOS) e cai para hls.js (Chrome/Firefox),
// carregado sob demanda para não pesar no bundle das telas sem player.
export function HlsPlayer({ src, onProgress, onEnded, className }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className={className}>
      <video
        ref={videoRef}
        controls
        playsInline
        className="w-full rounded-lg bg-black aspect-video"
      />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
