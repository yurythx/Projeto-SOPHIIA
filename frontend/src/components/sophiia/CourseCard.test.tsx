import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CourseCard } from "./CourseCard";
import type { MyCourseItem } from "@/lib/api/sophiia";

const base: MyCourseItem = {
  course_id: "c-1",
  title: "LGPD para servidores",
  description: "Fundamentos da lei.",
  system_name: "Recursos Humanos",
  version_id: "v-1",
  version_tag: "1.0",
  workload_hours: 8,
  total_lessons: 10,
  completed_lessons: 4,
  progress_percentage: 40,
  is_completed: false,
};

describe("CourseCard", () => {
  it("mostra título, sistema, progresso e carga horária; linka para a sala de aula", () => {
    render(<CourseCard course={base} />);

    const link = screen.getByRole("link", { name: /LGPD para servidores/ });
    expect(link).toHaveAttribute("href", "/portal/curso/v-1");
    expect(screen.getByText("Recursos Humanos")).toBeInTheDocument();
    expect(screen.getByText(/40% concluído · 4\/10 aulas/)).toBeInTheDocument();
    expect(screen.getByText("8h")).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
  });

  it("marca o curso concluído com selo e barra em 100", () => {
    render(<CourseCard course={{ ...base, is_completed: true, progress_percentage: 100 }} />);
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("a capa gerada é estável para o mesmo id", () => {
    const { container: a } = render(<CourseCard course={base} />);
    const { container: b } = render(<CourseCard course={base} />);
    const grad = (c: HTMLElement) =>
      (c.querySelector("[style*='linear-gradient']") as HTMLElement)?.style.backgroundImage;
    expect(grad(a)).toBe(grad(b));
    expect(grad(a)).toMatch(/linear-gradient/);
  });
});
