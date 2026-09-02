"use client";

import {
  DEFAULT_SCALE,
  FONT_SCALE_COOKIE,
  STEP,
  clampScale,
  parseScaleCookie,
} from "@/lib/a11y/fontScale";
import { readCookie, writeCookie } from "@/lib/prefs/cookies";

// "External store" (useSyncExternalStore) da escala de fonte do documento
// (botões A+ / A- / A da barra de acessibilidade). Persistida em COOKIE —
// pelo mesmo motivo do tema/branding: o layout do servidor lê o cookie e
// já carimba `--font-scale` no <html> no 1º paint, sem flash.

export {
  DEFAULT_SCALE,
  FONT_SCALE_COOKIE,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  parseScaleCookie,
} from "@/lib/a11y/fontScale";

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: number | null = null;

function read(): number {
  if (cached != null) return cached;
  cached = parseScaleCookie(readCookie(FONT_SCALE_COOKIE));
  return cached;
}

function applyToDOM(scale: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--font-scale", String(scale));
}

function commit(scale: number) {
  cached = clampScale(scale);
  writeCookie(FONT_SCALE_COOKIE, String(cached));
  applyToDOM(cached);
  for (const l of listeners) l();
}

export function getFontScaleSnapshot(): number {
  return read();
}

// Server snapshot neutro: o layout injeta o valor real via style inline no
// <html>, então não há flash mesmo com este fallback.
export function getFontScaleServerSnapshot(): number {
  return DEFAULT_SCALE;
}

export function subscribeFontScale(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function increaseFontScale(): void {
  commit(read() + STEP);
}
export function decreaseFontScale(): void {
  commit(read() - STEP);
}
export function resetFontScale(): void {
  commit(DEFAULT_SCALE);
}
