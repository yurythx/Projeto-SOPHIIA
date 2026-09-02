import { render } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/script não executa nada útil no jsdom — capturamos as props que o
// componente passa e disparamos os callbacks manualmente, simulando o
// navegador que baixou e rodou o vlibras-plugin.js.
const scriptProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => {
    scriptProps.current = props;
    return null;
  },
}));

import { VLibras } from "./VLibras";

afterEach(() => {
  scriptProps.current = null;
  delete (window as { VLibras?: unknown }).VLibras;
  vi.restoreAllMocks();
});

describe("VLibras", () => {
  it("aponta para o loader oficial do Governo Federal", () => {
    render(<VLibras />);
    expect(scriptProps.current?.src).toBe("https://vlibras.gov.br/app/vlibras-plugin.js");
    expect(scriptProps.current?.strategy).toBe("afterInteractive");
  });

  it("inicializa o widget ancorado à direita quando o script carrega", () => {
    const Widget = vi.fn();
    (window as { VLibras?: unknown }).VLibras = { Widget };

    render(<VLibras />);
    act(() => {
      (scriptProps.current?.onReady as () => void)?.();
    });

    expect(Widget).toHaveBeenCalledTimes(1);
    expect(Widget).toHaveBeenCalledWith({
      rootPath: "https://vlibras.gov.br/app",
      position: "R",
    });
  });

  it("não inicializa duas vezes se onReady e onLoad dispararem", () => {
    const Widget = vi.fn();
    (window as { VLibras?: unknown }).VLibras = { Widget };

    render(<VLibras />);
    act(() => {
      (scriptProps.current?.onReady as () => void)?.();
      (scriptProps.current?.onLoad as () => void)?.();
      (scriptProps.current?.onLoad as () => void)?.();
    });

    expect(Widget).toHaveBeenCalledTimes(1);
  });

  it("não quebra se o callback disparar antes de window.VLibras existir", () => {
    render(<VLibras />);
    expect(() => {
      act(() => {
        (scriptProps.current?.onLoad as () => void)?.();
      });
    }).not.toThrow();
  });
});
