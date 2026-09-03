import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renderiza título como <h1>, subtítulo e eyebrow", () => {
    render(<PageHeader eyebrow="Seção" title="Integrações" subtitle="Sistemas externos." />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Integrações");
    expect(screen.getByText("Seção")).toBeInTheDocument();
    expect(screen.getByText("Sistemas externos.")).toBeInTheDocument();
  });

  it("omite eyebrow/subtítulo e a área de ações quando não passados", () => {
    const { container } = render(<PageHeader title="Só título" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Só título");
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("mostra as ações passadas", () => {
    render(<PageHeader title="X" actions={<button type="button">Nova coisa</button>} />);
    expect(screen.getByRole("button", { name: "Nova coisa" })).toBeInTheDocument();
  });
});
