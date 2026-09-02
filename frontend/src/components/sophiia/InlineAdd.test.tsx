import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InlineAdd } from "./InlineAdd";

describe("InlineAdd", () => {
  it("abre o campo, envia o valor no Enter e fecha", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlineAdd label="Módulo" placeholder="Título do módulo" onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: /Módulo/ }));
    const input = screen.getByPlaceholderText("Título do módulo");
    await user.type(input, "  Introdução  {Enter}");

    expect(onAdd).toHaveBeenCalledWith("Introdução"); // trimado
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Título do módulo")).not.toBeInTheDocument(),
    );
  });

  it("Esc cancela sem chamar onAdd", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<InlineAdd label="Lição" placeholder="Título" onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: /Lição/ }));
    await user.type(screen.getByPlaceholderText("Título"), "algo{Escape}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Título")).not.toBeInTheDocument();
  });

  it("mostra o erro e mantém o campo aberto quando onAdd rejeita", async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error("já existe"));
    const user = userEvent.setup();
    render(<InlineAdd label="Módulo" placeholder="Título" onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: /Módulo/ }));
    await user.type(screen.getByPlaceholderText("Título"), "x{Enter}");

    await waitFor(() => expect(screen.getByText("já existe")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Título")).toBeInTheDocument();
  });

  it("não envia valor vazio", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<InlineAdd label="Módulo" placeholder="Título" onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: /Módulo/ }));
    await user.type(screen.getByPlaceholderText("Título"), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });
});
