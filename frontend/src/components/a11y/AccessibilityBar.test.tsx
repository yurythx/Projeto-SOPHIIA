import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// usePathname é a única dependência de plataforma da barra — os stores de
// branding/fontScale já caem nos defaults sem cookie no jsdom.
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { AccessibilityBar } from "./AccessibilityBar";

// Âncoras de salto num container próprio — nunca mexemos no resto do
// <body>, onde o testing-library monta a própria barra.
let anchorHost: HTMLElement | null = null;
function setAnchors(ids: string[]) {
  anchorHost?.remove();
  anchorHost = document.createElement("div");
  anchorHost.setAttribute("data-testid", "anchor-host");
  for (const id of ids) {
    const el = document.createElement("main");
    el.id = id;
    anchorHost.appendChild(el);
  }
  document.body.appendChild(anchorHost);
}

afterEach(() => {
  anchorHost?.remove();
  anchorHost = null;
  pathname.current = "/";
});

describe("AccessibilityBar — atalhos de salto", () => {
  it("nunca renderiza um link para #busca (não há busca global)", async () => {
    setAnchors(["conteudo", "menu", "rodape"]);
    render(<AccessibilityBar />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Ir para o rodapé/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /Ir para a busca/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="#busca"]')).toBeNull();
  });

  it("mantém apenas os links cujo alvo existe na página", async () => {
    // Página pública típica: só o conteúdo principal tem âncora.
    setAnchors(["conteudo"]);
    render(<AccessibilityBar />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Ir para o conteúdo/ })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Ir para o menu/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Ir para o rodapé/ })).not.toBeInTheDocument();
    });
  });

  it("mostra menu e rodapé quando ambas as âncoras existem (telas do sistema)", async () => {
    setAnchors(["conteudo", "menu", "rodape"]);
    render(<AccessibilityBar />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Ir para o conteúdo/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Ir para o menu/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Ir para o rodapé/ })).toBeInTheDocument();
    });
  });

  it("cada link de salto carrega a accessKey e-MAG correspondente", async () => {
    setAnchors(["conteudo", "menu", "rodape"]);
    render(<AccessibilityBar />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Ir para o conteúdo/ })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /Ir para o conteúdo/ })).toHaveAttribute(
      "accesskey",
      "1",
    );
    expect(screen.getByRole("link", { name: /Ir para o menu/ })).toHaveAttribute("accesskey", "2");
    expect(screen.getByRole("link", { name: /Ir para o rodapé/ })).toHaveAttribute(
      "accesskey",
      "4",
    );
  });

  it("re-checa as âncoras quando a rota muda", async () => {
    setAnchors(["conteudo", "menu", "rodape"]);
    const { rerender } = render(<AccessibilityBar />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Ir para o menu/ })).toBeInTheDocument(),
    );

    // Navegação para uma página pública sem menu/rodapé.
    setAnchors(["conteudo"]);
    pathname.current = "/sobre";
    rerender(<AccessibilityBar />);

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Ir para o menu/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /Ir para o conteúdo/ })).toBeInTheDocument();
  });
});
