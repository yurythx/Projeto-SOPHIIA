"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface HlsPlayerProps {
  src: string; // URL do master.m3u8
  /** Chamado periodicamente (~a cada 10s) com a posição atual em segundos. */
  onProgress?: (positionSeconds: number) => void;
  /** Chamado quando o vídeo termina. */
  onEnded?: () => void;
  className?: string;
  /**
   * Se definido, o player guarda a posição atual em localStorage sob essa
   * chave e retoma dali ao montar de novo (ex: o servidor sai da aula e
   * volta). Limpa a chave quando o vídeo termina.
   */
  resumeKey?: string;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function readPos(key: string | undefined): number | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writePos(key: string | undefined, seconds: number): void {
  if (!key || typeof window === "undefined" || !Number.isFinite(seconds)) return;
  try {
    window.localStorage.setItem(key, String(Math.max(0, Math.round(seconds))));
  } catch {
    /* modo privado / cota — retomar posição não é essencial */
  }
}

function clearPos(key: string | undefined): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// HlsPlayer reproduz HLS adaptativo. Usa o suporte nativo do navegador
// quando disponível (Safari/iOS) e cai para hls.js (Chrome/Firefox),
// carregado sob demanda para não pesar no bundle das telas sem player.
// Controles nativos (play/pause, volume, fullscreen) + botões de
// velocidade (a barra nativa não expõe isso de forma confiável).
export function HlsPlayer({ src, onProgress, onEnded, className, resumeKey }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const lastReport = useRef(0);
  const lastSave = useRef(0);

  // Callbacks/chave guardados em ref: a tela de aula re-renderiza o tempo
  // todo (heartbeat, troca de aba, recolher a sidebar) e recria essas
  // props. Se entrassem nas deps do efeito de setup, cada re-render
  // destruiria e recriaria o <video>/hls.js — o vídeo voltava ao início.
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const resumeKeyRef = useRef(resumeKey);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onEndedRef.current = onEnded;
    resumeKeyRef.current = resumeKey;
  });

  // Só recarrega quando a fonte muda de verdade. Trocar de aula continua
  // recriando o player pela `key={lesson.id}` no componente pai.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    lastReport.current = 0;
    lastSave.current = 0;
    let destroyed = false;
    let ended = false;
    let seeked = false;
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

    function saveNow() {
      if (video && !ended) writePos(resumeKeyRef.current, video.currentTime);
    }

    function handleLoadedMetadata() {
      if (seeked || !video) return;
      seeked = true;
      const pos = readPos(resumeKeyRef.current);
      const dur = video.duration;
      // Retoma só se faz sentido: passou dos primeiros segundos e ainda
      // falta um pedaço pro fim.
      if (pos != null && Number.isFinite(dur) && pos > 3 && pos < dur - 5) {
        try {
          video.currentTime = pos;
        } catch {
          /* alguns navegadores recusam seek antes do 1º frame — tudo bem */
        }
      }
    }

    function handleTimeUpdate() {
      if (!video) return;
      const now = Date.now();
      if (now - lastSave.current >= 2_000) {
        lastSave.current = now;
        saveNow();
      }
      const report = onProgressRef.current;
      if (report && now - lastReport.current >= 10_000) {
        lastReport.current = now;
        report(video.currentTime);
      }
    }
    function handleEnded() {
      ended = true;
      clearPos(resumeKeyRef.current);
      onProgressRef.current?.(video?.duration ?? 0);
      onEndedRef.current?.();
    }

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("pause", saveNow);
    video.addEventListener("ended", handleEnded);
    window.addEventListener("pagehide", saveNow);

    return () => {
      destroyed = true;
      saveNow(); // sair da aula / trocar de aula / fechar a aba
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("pause", saveNow);
      video.removeEventListener("ended", handleEnded);
      window.removeEventListener("pagehide", saveNow);
      if (hls) hls.destroy();
    };
  }, [src]);

  const setPlaybackRate = useCallback((rate: number) => {
    setSpeed(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, []);

  return (
    <div className={className}>
      <div className="relative h-full">
        <video
          ref={videoRef}
          controls
          playsInline
          className="h-full w-full bg-black object-contain"
        />
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
