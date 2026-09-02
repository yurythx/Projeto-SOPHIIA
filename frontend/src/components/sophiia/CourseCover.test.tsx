import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CourseCover, coverIndex } from "./CourseCover";

describe("CourseCover", () => {
  it("coverIndex é determinístico e fica em [0,6)", () => {
    expect(coverIndex("abc-123")).toBe(coverIndex("abc-123"));
    for (const id of ["", "x", "curso-99", crypto.randomUUID()]) {
      const i = coverIndex(id);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });

  it("renderiza gradiente e as iniciais do sistema", () => {
    const { container } = render(<CourseCover id="c1" systemName="Recursos Humanos" />);
    const el = container.querySelector("[style*='linear-gradient']") as HTMLElement;
    expect(el).toBeTruthy();
    expect(screen.getByText("RH")).toBeInTheDocument();
  });
});
