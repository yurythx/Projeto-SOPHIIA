import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HlsPlayer } from "./HlsPlayer";

// jsdom não tem MediaSource — força o caminho hls.js, e aqui ele "não é
// suportado", então o componente cai em `video.src = src`. O que
// interessa é quantas vezes o efeito de setup roda.
vi.mock("hls.js", () => ({ default: { isSupported: () => false } }));

// currentTime/duration com backing store (jsdom não implementa de verdade).
function fakeMedia(video: HTMLVideoElement, duration: number) {
  let ct = 0;
  Object.defineProperty(video, "currentTime", {
    get: () => ct,
    set: (v: number) => {
      ct = v;
    },
    configurable: true,
  });
  Object.defineProperty(video, "duration", { value: duration, configurable: true });
}

describe("HlsPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("não recarrega o vídeo quando só as callbacks mudam de identidade", () => {
    const addSpy = vi.spyOn(window.HTMLMediaElement.prototype, "addEventListener");
    const timeupdateRegs = () => addSpy.mock.calls.filter(([evt]) => evt === "timeupdate").length;

    const { rerender } = render(
      <HlsPlayer src="https://x/master.m3u8" onProgress={() => {}} onEnded={() => {}} />,
    );
    // Absoluto varia com o StrictMode (efeito roda 2x na montagem); o que
    // importa é o delta.
    const afterMount = timeupdateRegs();
    expect(afterMount).toBeGreaterThan(0);

    // A sala de aula re-renderiza a cada heartbeat/troca de aba e recria
    // essas funções. O efeito de setup NÃO pode re-rodar por isso.
    rerender(<HlsPlayer src="https://x/master.m3u8" onProgress={() => {}} onEnded={() => {}} />);
    rerender(<HlsPlayer src="https://x/master.m3u8" onProgress={() => {}} onEnded={() => {}} />);
    expect(timeupdateRegs()).toBe(afterMount);

    // Trocar a fonte de verdade SIM recarrega.
    rerender(<HlsPlayer src="https://x/outro.m3u8" onProgress={() => {}} onEnded={() => {}} />);
    expect(timeupdateRegs()).toBeGreaterThan(afterMount);
  });

  it("dispara onEnded/onProgress mais recentes sem depender da identidade na montagem", () => {
    const firstEnded = vi.fn();
    const { rerender, container } = render(
      <HlsPlayer src="https://x/master.m3u8" onEnded={firstEnded} />,
    );
    const video = container.querySelector("video")!;

    const latestEnded = vi.fn();
    rerender(<HlsPlayer src="https://x/master.m3u8" onEnded={latestEnded} />);

    video.dispatchEvent(new Event("ended"));
    expect(firstEnded).not.toHaveBeenCalled();
    expect(latestEnded).toHaveBeenCalledTimes(1);
  });

  describe("retomar posição (resumeKey)", () => {
    it("retoma a posição salva quando o metadata carrega", () => {
      window.localStorage.setItem("sophiia:resume:v:l", "30");
      const { container } = render(
        <HlsPlayer src="https://x/m.m3u8" resumeKey="sophiia:resume:v:l" />,
      );
      const video = container.querySelector("video")!;
      fakeMedia(video, 100);

      video.dispatchEvent(new Event("loadedmetadata"));
      expect(video.currentTime).toBe(30);
    });

    it("não retoma se a posição salva está perto do fim", () => {
      window.localStorage.setItem("sophiia:resume:v:l", "97");
      const { container } = render(
        <HlsPlayer src="https://x/m.m3u8" resumeKey="sophiia:resume:v:l" />,
      );
      const video = container.querySelector("video")!;
      fakeMedia(video, 100);

      video.dispatchEvent(new Event("loadedmetadata"));
      expect(video.currentTime).toBe(0);
    });

    it("salva ao pausar e limpa ao terminar", () => {
      const { container } = render(
        <HlsPlayer src="https://x/m.m3u8" resumeKey="sophiia:resume:v:l" />,
      );
      const video = container.querySelector("video")!;
      fakeMedia(video, 100);
      video.currentTime = 42;

      video.dispatchEvent(new Event("pause"));
      expect(window.localStorage.getItem("sophiia:resume:v:l")).toBe("42");

      video.dispatchEvent(new Event("ended"));
      expect(window.localStorage.getItem("sophiia:resume:v:l")).toBeNull();
    });

    it("salva ao desmontar (sair da aula)", () => {
      const { container, unmount } = render(
        <HlsPlayer src="https://x/m.m3u8" resumeKey="sophiia:resume:v:l" />,
      );
      const video = container.querySelector("video")!;
      fakeMedia(video, 100);
      video.currentTime = 55;

      unmount();
      expect(window.localStorage.getItem("sophiia:resume:v:l")).toBe("55");
    });
  });
});
