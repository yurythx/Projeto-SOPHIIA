"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Clock, Video } from "lucide-react";

import { sophiiaApi } from "@/lib/api/sophiia";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// LessonPicker escolhe a lição de destino do upload por Sistema → Curso →
// Lição, em vez de exigir que o instrutor cole um UUID (a causa nº 1 de
// "upload deu 404": um id digitado errado nunca existe no banco). O id
// resolvido sobe pelo onChange. O <details> "UUID manual" continua ali
// para quem já tem o id em mãos (ex.: veio de fora do Studio).
export function LessonPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (lessonId: string) => void;
}) {
  const [systemId, setSystemId] = useState("");
  const [courseId, setCourseId] = useState("");

  const { data: systems } = useSWR("sophiia/picker/systems", () => sophiiaApi.listSystems());

  const { data: courses } = useSWR(
    systemId ? ["sophiia/picker/courses", systemId] : null,
    () => sophiiaApi.listCourses(systemId),
  );

  const course = courses?.find((c) => c.id === courseId) ?? null;
  const versionId = course?.current_version_id ?? null;

  const { data: outline, isLoading: loadingOutline } = useSWR(
    versionId ? ["sophiia/picker/outline", versionId] : null,
    () => sophiiaApi.courseOutline(versionId as string),
  );

  const lessons = useMemo(
    () =>
      (outline?.modules ?? []).flatMap((m) =>
        (m.lessons ?? []).map((l) => ({ ...l, moduleTitle: m.title })),
      ),
    [outline],
  );

  const selected = lessons.find((l) => l.id === value) ?? null;
  const courseHasNoVersion = course !== null && versionId === null;

  return (
    <div className="space-y-3 rounded-lg border border-surface-border bg-background p-3">
      <p className="text-xs font-medium text-muted">Lição de destino</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          label="Sistema"
          value={systemId}
          onChange={(v) => {
            setSystemId(v);
            setCourseId("");
          }}
          options={(systems ?? []).map((s) => ({ value: s.id, label: s.name }))}
          placeholder={systems ? "Selecione…" : "Carregando…"}
        />
        <Select
          label="Curso"
          value={courseId}
          onChange={setCourseId}
          disabled={!systemId}
          options={(courses ?? []).map((c) => ({ value: c.id, label: c.title }))}
          placeholder={!systemId ? "—" : courses ? "Selecione…" : "Carregando…"}
        />
        <Select
          label="Lição"
          value={value}
          onChange={onChange}
          disabled={!courseId || courseHasNoVersion}
          options={lessons.map((l) => ({
            value: l.id,
            label: `${l.moduleTitle} › ${l.title}${l.has_video ? "  ✓ vídeo" : ""}`,
          }))}
          placeholder={
            !courseId
              ? "—"
              : courseHasNoVersion
                ? "Curso sem versão publicada"
                : loadingOutline
                  ? "Carregando…"
                  : lessons.length === 0
                    ? "Sem lições"
                    : "Selecione…"
          }
        />
      </div>

      {courseHasNoVersion && (
        <p className="text-[11px] text-warning-strong">
          Este curso não tem versão publicada — publique-a no assistente acima ou escolha outro
          curso.
        </p>
      )}

      {selected && (
        <p className="flex items-center gap-1.5 text-[11px] text-success-strong">
          {selected.has_video ? (
            selected.video_status === "READY" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )
          ) : (
            <Video className="h-3.5 w-3.5" />
          )}
          {selected.moduleTitle} › {selected.title}
          {selected.has_video &&
            ` — já tem vídeo (${selected.video_status ?? "?"}); enviar substitui.`}
        </p>
      )}

      <details className="text-[11px] text-muted">
        <summary className="cursor-pointer select-none">Informar UUID manualmente</summary>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
        />
        {value && !UUID_RE.test(value) && (
          <span className="mt-1 block text-danger-strong">UUID inválido.</span>
        )}
      </details>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-[11px] font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-surface-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-40"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
