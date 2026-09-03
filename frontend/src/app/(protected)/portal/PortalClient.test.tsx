import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalClient } from "./PortalClient";
import type { MyCourseItem } from "@/lib/api/sophiia";

vi.mock("@/lib/api/sophiia", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/sophiia")>();
  return {
    ...actual,
    sophiiaApi: { listMyCourses: vi.fn(), listCertificates: vi.fn() },
  };
});

import { sophiiaApi } from "@/lib/api/sophiia";

const api = sophiiaApi as unknown as { listMyCourses: ReturnType<typeof vi.fn> };

function mk(over: Partial<MyCourseItem>): MyCourseItem {
  return {
    course_id: crypto.randomUUID(),
    title: "Curso",
    description: "",
    system_name: "Sistema A",
    version_id: crypto.randomUUID(),
    version_tag: "1.0",
    workload_hours: 4,
    total_lessons: 10,
    completed_lessons: 0,
    progress_percentage: 0,
    is_completed: false,
    ...over,
  };
}

const COURSES = [
  mk({
    title: "Introdução à LGPD",
    system_name: "RH",
    progress_percentage: 0,
    completed_lessons: 0,
  }),
  mk({
    title: "Orçamento Público",
    system_name: "Finanças",
    progress_percentage: 45,
    completed_lessons: 4,
  }),
  mk({
    title: "Ética no Serviço",
    system_name: "RH",
    progress_percentage: 100,
    completed_lessons: 10,
    is_completed: true,
  }),
];

function renderPortal() {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PortalClient />
    </SWRConfig>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("PortalClient — catálogo", () => {
  it("renderiza um card por curso", async () => {
    api.listMyCourses.mockResolvedValue(COURSES);
    renderPortal();
    await waitFor(() => expect(screen.getAllByRole("link")).toHaveLength(3));
    expect(screen.getByText("Introdução à LGPD")).toBeInTheDocument();
  });

  it("filtra pela busca textual (curso ou sistema)", async () => {
    api.listMyCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText("Orçamento Público");

    await user.type(screen.getByPlaceholderText(/buscar curso/i), "finanças");
    await waitFor(() => {
      expect(screen.getByText("Orçamento Público")).toBeInTheDocument();
      expect(screen.queryByText("Introdução à LGPD")).not.toBeInTheDocument();
    });
  });

  it('o filtro "Concluídos" mostra só cursos completos', async () => {
    api.listMyCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText("Ética no Serviço");

    await user.click(screen.getByRole("button", { name: "Concluídos" }));
    await waitFor(() => {
      expect(screen.getByText("Ética no Serviço")).toBeInTheDocument();
      expect(screen.queryByText("Orçamento Público")).not.toBeInTheDocument();
    });
  });

  it('ordenar por "Progresso" põe o maior primeiro', async () => {
    api.listMyCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText("Ética no Serviço");

    await user.selectOptions(screen.getByLabelText("Ordenar"), "progress");
    const titles = screen
      .getAllByRole("link")
      .map((a) => within(a).getByRole("heading").textContent);
    expect(titles[0]).toBe("Ética no Serviço"); // 100%
    expect(titles[2]).toBe("Introdução à LGPD"); // 0%
  });

  it("mostra estado vazio quando os filtros não casam", async () => {
    api.listMyCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText("Introdução à LGPD");

    await user.type(screen.getByPlaceholderText(/buscar curso/i), "zzzzz");
    await waitFor(() =>
      expect(screen.getByText(/nenhum curso encontrado com esses filtros/i)).toBeInTheDocument(),
    );
  });
});
