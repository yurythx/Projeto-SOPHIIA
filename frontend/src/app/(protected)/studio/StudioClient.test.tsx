import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioClient } from "./StudioClient";
import type { AdminCourseItem } from "@/lib/api/sophiia";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/sophiia/CatalogWizard", () => ({
  CatalogWizard: () => <div data-testid="wizard" />,
}));
vi.mock("@/lib/api/sophiia", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/sophiia")>();
  return { ...actual, sophiiaApi: { listAdminCourses: vi.fn() } };
});

import { sophiiaApi } from "@/lib/api/sophiia";
const api = sophiiaApi as unknown as { listAdminCourses: ReturnType<typeof vi.fn> };

function mk(over: Partial<AdminCourseItem>): AdminCourseItem {
  return {
    id: crypto.randomUUID(),
    title: "Curso",
    description: "",
    system_id: "s",
    system_name: "Sistema A",
    current_version_id: "v",
    version_tag: "1.0",
    workload_hours: 4,
    is_published: true,
    lessons_count: 4,
    videos_ready_count: 2,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const COURSES = [
  mk({ title: "LGPD", is_published: true, created_at: "2026-03-01T00:00:00Z" }),
  mk({
    title: "Orçamento",
    system_name: "Finanças",
    is_published: false,
    videos_ready_count: 0,
    created_at: "2026-05-01T00:00:00Z",
  }),
  mk({
    title: "Ética",
    is_published: true,
    videos_ready_count: 4,
    lessons_count: 4,
    created_at: "2026-01-15T00:00:00Z",
  }),
];

function renderStudio() {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <StudioClient />
    </SWRConfig>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("StudioClient — grid de cursos", () => {
  it("um card por curso, linkando para a página do curso", async () => {
    api.listAdminCourses.mockResolvedValue(COURSES);
    renderStudio();
    await waitFor(() => expect(screen.getAllByRole("link")).toHaveLength(3));
    const lgpd = screen.getByRole("link", { name: /LGPD/ });
    expect(lgpd.getAttribute("href")).toMatch(/^\/studio\/curso\//);
  });

  it('filtro "Rascunhos" mostra só cursos não publicados', async () => {
    api.listAdminCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderStudio();
    await screen.findByText("Orçamento");
    await user.click(screen.getByRole("button", { name: "Rascunhos" }));
    await waitFor(() => {
      expect(screen.getByText("Orçamento")).toBeInTheDocument();
      expect(screen.queryByText("LGPD")).not.toBeInTheDocument();
    });
  });

  it("busca textual filtra por sistema", async () => {
    api.listAdminCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderStudio();
    await screen.findByText("Orçamento");
    await user.type(screen.getByPlaceholderText(/buscar curso/i), "finanç");
    await waitFor(() => expect(screen.queryByText("LGPD")).not.toBeInTheDocument());
    expect(screen.getByText("Orçamento")).toBeInTheDocument();
  });

  it('ordenar por "Vídeos prontos" põe o mais completo primeiro', async () => {
    api.listAdminCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderStudio();
    await screen.findByText("Ética");
    await user.selectOptions(screen.getByLabelText("Ordenar"), "videos");
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles[0]).toBe("Ética"); // 4/4
  });

  it('"Novo curso" abre o assistente', async () => {
    api.listAdminCourses.mockResolvedValue(COURSES);
    const user = userEvent.setup();
    renderStudio();
    await screen.findByText("LGPD");
    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /novo curso/i }));
    expect(screen.getByTestId("wizard")).toBeInTheDocument();
  });
});
