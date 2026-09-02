import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LessonPicker } from "./LessonPicker";

vi.mock("@/lib/api/sophiia", () => ({
  sophiiaApi: {
    listSystems: vi.fn(),
    listCourses: vi.fn(),
    courseOutline: vi.fn(),
  },
}));

import { sophiiaApi } from "@/lib/api/sophiia";

const mockApi = sophiiaApi as unknown as {
  listSystems: ReturnType<typeof vi.fn>;
  listCourses: ReturnType<typeof vi.fn>;
  courseOutline: ReturnType<typeof vi.fn>;
};

const SYSTEMS = [
  { id: "sys-1", code: "SIGEF", name: "Gestão Orçamentária", description: "", is_active: true },
];
const COURSE_PUBLISHED = {
  id: "course-1",
  system_id: "sys-1",
  title: "Curso Publicado",
  description: "",
  is_active: true,
  current_version_id: "ver-1",
};
const COURSE_UNPUBLISHED = {
  id: "course-2",
  system_id: "sys-1",
  title: "Curso Sem Versão",
  description: "",
  is_active: true,
  current_version_id: null,
};
const OUTLINE = {
  course_version_id: "ver-1",
  modules: [
    {
      id: "mod-1",
      title: "Módulo 1",
      order_index: 0,
      lessons: [
        { id: "less-1", title: "Aula 1", is_mandatory: true, order_index: 0, has_video: false, completed: false },
        { id: "less-2", title: "Aula 2", is_mandatory: true, order_index: 1, has_video: true, video_status: "READY" as const, completed: false },
      ],
    },
  ],
};

// Wrapper com estado real — o LessonPicker é controlado (value/onChange),
// então o teste precisa segurar o valor para o campo manual acumular
// texto e para o seletor de lição refletir a escolha.
function Harness({ onChange }: { onChange: (id: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <LessonPicker
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange(id);
        }}
      />
    </SWRConfig>
  );
}

const sel = (name: RegExp) => screen.getByRole("combobox", { name });

afterEach(() => {
  vi.clearAllMocks();
});

describe("LessonPicker", () => {
  it("cascata Sistema → Curso → Lição e emite o id da lição escolhida", async () => {
    mockApi.listSystems.mockResolvedValue(SYSTEMS);
    mockApi.listCourses.mockResolvedValue([COURSE_PUBLISHED]);
    mockApi.courseOutline.mockResolvedValue(OUTLINE);
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await within(sel(/sistema/i)).findByRole("option", { name: "Gestão Orçamentária" });
    await user.selectOptions(sel(/sistema/i), "sys-1");

    await within(sel(/curso/i)).findByRole("option", { name: "Curso Publicado" });
    await user.selectOptions(sel(/curso/i), "course-1");

    await within(sel(/lição/i)).findByRole("option", { name: /Módulo 1 › Aula 1/ });
    await user.selectOptions(sel(/lição/i), "less-1");

    expect(onChange).toHaveBeenCalledWith("less-1");
    expect(mockApi.listCourses).toHaveBeenCalledWith("sys-1");
    expect(mockApi.courseOutline).toHaveBeenCalledWith("ver-1");
  });

  it("marca no rótulo as lições que já têm vídeo", async () => {
    mockApi.listSystems.mockResolvedValue(SYSTEMS);
    mockApi.listCourses.mockResolvedValue([COURSE_PUBLISHED]);
    mockApi.courseOutline.mockResolvedValue(OUTLINE);
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);

    await within(sel(/sistema/i)).findByRole("option", { name: "Gestão Orçamentária" });
    await user.selectOptions(sel(/sistema/i), "sys-1");
    await within(sel(/curso/i)).findByRole("option", { name: "Curso Publicado" });
    await user.selectOptions(sel(/curso/i), "course-1");

    await within(sel(/lição/i)).findByRole("option", { name: /Aula 2.*✓ vídeo/ });
  });

  it("avisa e bloqueia a seleção quando o curso não tem versão publicada", async () => {
    mockApi.listSystems.mockResolvedValue(SYSTEMS);
    mockApi.listCourses.mockResolvedValue([COURSE_UNPUBLISHED]);
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);

    await within(sel(/sistema/i)).findByRole("option", { name: "Gestão Orçamentária" });
    await user.selectOptions(sel(/sistema/i), "sys-1");
    await within(sel(/curso/i)).findByRole("option", { name: "Curso Sem Versão" });
    await user.selectOptions(sel(/curso/i), "course-2");

    await waitFor(() => expect(screen.getByText(/não tem versão publicada/i)).toBeInTheDocument());
    expect(sel(/lição/i)).toBeDisabled();
    expect(mockApi.courseOutline).not.toHaveBeenCalled();
  });

  it("aceita um UUID colado no campo manual", async () => {
    mockApi.listSystems.mockResolvedValue(SYSTEMS);
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByText(/informar uuid manualmente/i));
    await user.type(
      screen.getByPlaceholderText("00000000-0000-0000-0000-000000000000"),
      "abc123",
    );

    expect(onChange).toHaveBeenLastCalledWith("abc123");
  });
});
