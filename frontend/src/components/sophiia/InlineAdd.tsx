"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";

// InlineAdd: um botão "+ <label>" que vira um campo de texto inline
// (Enter confirma, Esc cancela). Substitui window.prompt — estilizável,
// com feedback de erro e sem bloquear a thread.
export function InlineAdd({
  label,
  placeholder,
  onAdd,
  size = "sm",
}: {
  label: string;
  placeholder: string;
  onAdd: (value: string) => Promise<void>;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setValue("");
    setError(null);
  }

  async function submit() {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(v);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={`inline-flex items-center gap-1 rounded font-medium text-primary hover:bg-primary/10 ${
          size === "md" ? "px-3 py-2 text-xs" : "px-2 py-1 text-[11px]"
        }`}
      >
        <Plus className="h-3 w-3" /> {label}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") close();
          }}
          placeholder={placeholder}
          disabled={busy}
          className="w-52 rounded-md border border-surface-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !value.trim()}
          aria-label="Confirmar"
          className="rounded p-1 text-success-strong hover:bg-success/10 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Cancelar"
          className="rounded p-1 text-muted hover:bg-surface-hover"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <span className="text-[10px] text-danger-strong">{error}</span>}
    </div>
  );
}
