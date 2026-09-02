"use client";

import Script from "next/script";
import { useRef } from "react";

// Suíte de Tradução VLibras v7 (Governo Federal).
//
// O loader oficial (vlibras-plugin.js, hoje v7.9.x) é um bootstrap que se
// AUTO-INICIALIZA: no DOMContentLoaded ele cria sozinho um
// <div id="vlibras-access-wrapper"> com Shadow DOM isolado e injeta o botão
// azul das mãozinhas em position:fixed, lado direito, top:calc(50vh-20px).
// Não existe mais o esqueleto <div vw> da v6 — ele é ignorado.
//
// Ainda assim chamamos window.VLibras.Widget(...) no onReady/onLoad do
// next/script: é idempotente (a função tem guarda interna própria), serve
// de fallback caso o auto-init não dispare e fixa rootPath/posição.
//
// Requisito de CSP (ver proxy.ts): o widget injeta um <style> SEM nonce no
// Shadow DOM. Por isso style-src fica só com 'unsafe-inline' (sem
// 'nonce-...') — senão o CSP3 ignora 'unsafe-inline' e o botão renderiza
// sem posicionamento. script-src mantém nonce + strict-dynamic; o app do
// avatar (Unity/WASM) carregado em cadeia herda a confiança do nonce.
const VLIBRAS_ROOT_PATH = "https://vlibras.gov.br/app";

declare global {
  interface Window {
    VLibras?: {
      Widget: (
        rootPath?:
          | string
          | { rootPath?: string; position?: "L" | "R"; avatar?: string; personalization?: string },
      ) => void;
    };
  }
}

// O botão do plugin (<button id="vlibras-button">) já carrega um aria-label
// descritivo próprio, mas as <img> internas dele (ícone da mão + popup)
// entram SEM alt — o axe/e-MAG marca isso como violação crítica de
// WCAG 1.1.1. São puramente decorativas (a semântica está no <button>),
// então marcamos como apresentacionais assim que o Shadow DOM existe.
function markPluginImagesDecorative() {
  const wrapper = document.getElementById("vlibras-access-wrapper");
  const root: ParentNode | null = wrapper?.shadowRoot ?? wrapper;
  if (!root) return false;
  const imgs = root.querySelectorAll("img:not([alt])");
  imgs.forEach((img) => {
    img.setAttribute("alt", "");
    img.setAttribute("role", "presentation");
  });
  return wrapper !== null;
}

export function VLibras() {
  const initialized = useRef(false);

  function initWidget() {
    if (initialized.current || typeof window === "undefined" || !window.VLibras) return;
    initialized.current = true;
    // Botão ancorado à direita (padrão dos portais gov.br).
    window.VLibras.Widget({ rootPath: VLIBRAS_ROOT_PATH, position: "R" });

    // O wrapper é criado de forma síncrona por Widget(), mas o caminho de
    // auto-init do plugin pode chegar depois — tenta algumas vezes e
    // desiste. requestAnimationFrame encadeado evita timers mágicos.
    let tries = 0;
    const patch = () => {
      if (markPluginImagesDecorative() || ++tries > 20) return;
      requestAnimationFrame(patch);
    };
    requestAnimationFrame(patch);
  }

  return (
    <Script
      id="vlibras-plugin"
      src="https://vlibras.gov.br/app/vlibras-plugin.js"
      strategy="afterInteractive"
      onReady={initWidget}
      onLoad={initWidget}
    />
  );
}
