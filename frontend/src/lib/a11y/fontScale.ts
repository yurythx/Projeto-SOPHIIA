// Constantes e parsing puros da escala de fonte e-MAG — sem "use client",
// para o layout do servidor poder ler o cookie e carimbar `--font-scale`
// no <html> antes do 1º paint (sem flash). O store reativo do cliente
// (fontScaleStore.ts) reexporta e consome estes valores.

export const FONT_SCALE_COOKIE = "sophiia-font-scale";

// e-MAG pede permitir aumentar o texto significativamente; aqui de 90% a
// 150% em passos de 10%.
export const MIN_SCALE = 0.9;
export const MAX_SCALE = 1.5;
export const STEP = 0.1;
export const DEFAULT_SCALE = 1;

export function clampScale(v: number): number {
  if (Number.isNaN(v)) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v * 100) / 100));
}

export function parseScaleCookie(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_SCALE;
  return clampScale(parseFloat(raw));
}
