import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassroomClient } from "./ClassroomClient";
import type { CourseOutline, MyCourseItem } from "@/lib/api/sophiia";

vi.mock("@/lib/api/sophiia", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/sophiia")>();
  return { ...actual, sophiiaApi: { courseOutline: vi.fn(), listMyCourses: vi.fn() } };
});
vi.mock("@/app/actions/sophiia", () => ({
  completeLessonAction: vi.fn().mockResolvedValue({ success: true }),
  recordHeartbeatAction: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/components/sophiia/HlsPlayer", () => ({
  HlsPlayer: ({ src }: { src: string }) => <div data-testid="player" data-src={src} />,
}));
vi.mock("@/components/notifications/ToastProvider", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { sophiiaApi } from "@/lib/api/sophiia";
import { completeLessonAction } from "@/app/actions/sophiia";

const api = sophiiaApi as unknown as {
  courseOutline: ReturnType<typeof vi.fn>;
  listMyCourses: ReturnType<typeof vi.fn>;
};

const VID = "ver-1";

const OUTLINE: CourseOutline = {
  course_version_id: VID,
  modules: [
    {
      id: "m1",
      title: "Módulo 1",
      order_index: 0,
      lessons: [
        {
          id: "l1",
          title: "Aula um",
          is_mandatory: true,
          order_index: 0,
          has_video: true,
          video_status: "READY",
          hls_master_key: "hls/l1/master.m3u8",
          duration_seconds: 90,
          completed: true,
          markdown_content: "Conteúdo da aula um.",
        },
        {
          id: "l2",
          title: "Aula dois",
          is_mandatory: true,
          order_index: 1,
          has_video: true,
          video_status: "READY",
          hls_master_key: "hls/l2/master.m3u8",
          duration_seconds: 120,
          completed: false,
        },
      ],
    },
  ],
};

const COURSE: MyCourseItem = {
  course_id: "c1",
  title: "Curso de Teste",
  description: "desc",
  system_name: "Sistema X",
  version_id: VID,
  version_tag: "1.0",
  workload_hours: 4,
  total_lessons: 2,
  completed_lessons: 1,
  progress_percentage: 50,
  is_completed: false,
};

function renderClassroom() {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ClassroomClient versionId={VID} />
    </SWRConfig>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("ClassroomClient", () => {
  it("top bar mostra o curso e o progresso agregado", async () => {
    api.courseOutline.mockResolvedValue(OUTLINE);
    api.listMyCourses.mockResolvedValue([COURSE]);
    renderClassroom();

    await screen.findByText("Curso de Teste");
    expect(screen.getByText("1/2 aulas concluídas")).toBeInTheDocument();
  });

  it("sidebar lista módulos e aulas; a 1ª não concluída fica ativa", async () => {
    api.courseOutline.mockResolvedValue(OUTLINE);
    api.listMyCourses.mockResolvedValue([COURSE]);
    renderClassroom();

    const aside = await screen.findByRole("complementary");
    expect(within(aside).getByText("Módulo 1")).toBeInTheDocument();
    expect(within(aside).getByText("Aula um")).toBeInTheDocument();
    // "Aula dois" (não concluída, READY) é a ativa -> vira o <h1>.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Aula dois"),
    );
    expect(screen.getByTestId("player")).toHaveAttribute("data-src", expect.stringContaining("l2"));
  });

  it('"Próxima aula" não aparece na última; clicar numa aula da sidebar troca o player', async () => {
    api.courseOutline.mockResolvedValue(OUTLINE);
    api.listMyCourses.mockResolvedValue([COURSE]);
    const user = userEvent.setup();
    renderClassroom();

    await screen.findByText("Curso de Teste");
    // ativa = l2 (última) -> sem "Próxima aula"
    expect(screen.queryByRole("button", { name: "Próxima aula" })).not.toBeInTheDocument();

    const aside = screen.getByRole("complementary");
    await user.click(within(aside).getByText("Aula um"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Aula um"),
    );
    // agora há próxima
    expect(screen.getByRole("button", { name: "Próxima aula" })).toBeInTheDocument();
  });

  it("alterna abas e mostra empty state em Material de apoio", async () => {
    api.courseOutline.mockResolvedValue(OUTLINE);
    api.listMyCourses.mockResolvedValue([COURSE]);
    const user = userEvent.setup();
    renderClassroom();

    await screen.findByText("Curso de Teste");
    await user.click(screen.getByRole("button", { name: "Material de apoio" }));
    expect(screen.getByText(/nenhum material de apoio/i)).toBeInTheDocument();
  });

  it('"Marcar como concluída" chama a server action', async () => {
    api.courseOutline.mockResolvedValue(OUTLINE);
    api.listMyCourses.mockResolvedValue([COURSE]);
    const user = userEvent.setup();
    renderClassroom();

    await screen.findByText("Curso de Teste"); // ativa = l2, não concluída
    await user.click(screen.getByRole("button", { name: /marcar como concluída/i }));
    await waitFor(() => expect(completeLessonAction).toHaveBeenCalledWith("l2"));
  });
});
