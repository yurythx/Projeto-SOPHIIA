"use client";

import { useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";

import { useToast } from "@/components/notifications/ToastProvider";
import { sophiiaApi } from "@/lib/api/sophiia";

type Step = "system" | "course" | "version" | "module" | "lesson" | "done";

// CatalogWizard cria a estrutura mínima até uma lição (sistema → curso →
// versão → módulo → lição) e devolve o id da lição criada, para o Studio
// já apontar o upload de vídeo para ela. Requer a role sophiia-instructor.
export function CatalogWizard({
  onLessonCreated,
}: {
  onLessonCreated: (lessonId: string) => void;
}) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("system");
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState<{
    system?: string;
    course?: string;
    version?: string;
    module?: string;
  }>({});

  // campos
  const [sysCode, setSysCode] = useState("");
  const [sysName, setSysName] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [versionTag, setVersionTag] = useState("1.0");
  const [workload, setWorkload] = useState(20);
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [mandatory, setMandatory] = useState(true);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast({
        title: "Falha ao salvar",
        description: e instanceof Error ? e.message : undefined,
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  const label: Record<Step, string> = {
    system: "1 · Sistema",
    course: "2 · Curso",
    version: "3 · Versão",
    module: "4 · Módulo",
    lesson: "5 · Lição",
    done: "Concluído",
  };

  return (
    <div className="space-y-3 rounded-xl border border-surface-border bg-surface p-5">
      <h2 className="text-base font-bold text-foreground">Criar estrutura de curso</h2>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {(["system", "course", "version", "module", "lesson"] as const).map((s) => (
          <span
            key={s}
            className={`rounded px-1.5 py-0.5 ${
              step === s
                ? "bg-primary text-primary-foreground"
                : (["course", "version", "module", "lesson", "done"] as Step[]).indexOf(step) >
                    (["system", "course", "version", "module", "lesson"] as Step[]).indexOf(s)
                  ? "bg-success/10 text-success"
                  : "bg-surface-border/40 text-muted"
            }`}
          >
            {label[s]}
          </span>
        ))}
      </div>

      {step === "system" && (
        <Form
          busy={busy}
          onSubmit={() =>
            guard(async () => {
              const { id } = await sophiiaApi.createSystem({
                code: sysCode.trim(),
                name: sysName.trim(),
              });
              setIds((p) => ({ ...p, system: id }));
              setStep("course");
            })
          }
          disabled={!sysCode.trim() || !sysName.trim()}
          cta="Criar sistema"
        >
          <Text label="Código" value={sysCode} onChange={setSysCode} placeholder="SIGEF" />
          <Text
            label="Nome"
            value={sysName}
            onChange={setSysName}
            placeholder="Gestão Orçamentária"
          />
        </Form>
      )}

      {step === "course" && (
        <Form
          busy={busy}
          onSubmit={() =>
            guard(async () => {
              const { id } = await sophiiaApi.createCourse(ids.system as string, {
                title: courseTitle.trim(),
              });
              setIds((p) => ({ ...p, course: id }));
              setStep("version");
            })
          }
          disabled={!courseTitle.trim()}
          cta="Criar curso"
        >
          <Text label="Título do curso" value={courseTitle} onChange={setCourseTitle} />
        </Form>
      )}

      {step === "version" && (
        <Form
          busy={busy}
          onSubmit={() =>
            guard(async () => {
              const { id } = await sophiiaApi.createVersion(ids.course as string, {
                version_tag: versionTag.trim(),
                workload_hours: workload,
              });
              setIds((p) => ({ ...p, version: id }));
              setStep("module");
            })
          }
          disabled={!versionTag.trim() || workload <= 0}
          cta="Criar versão"
        >
          <Text label="Tag da versão" value={versionTag} onChange={setVersionTag} />
          <label className="block text-xs font-medium text-muted">
            Carga horária (h)
            <input
              type="number"
              min={1}
              value={workload}
              onChange={(e) => setWorkload(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </Form>
      )}

      {step === "module" && (
        <Form
          busy={busy}
          onSubmit={() =>
            guard(async () => {
              const { id } = await sophiiaApi.createModule(ids.version as string, {
                title: moduleTitle.trim(),
                order_index: 0,
              });
              setIds((p) => ({ ...p, module: id }));
              setStep("lesson");
            })
          }
          disabled={!moduleTitle.trim()}
          cta="Criar módulo"
        >
          <Text label="Título do módulo" value={moduleTitle} onChange={setModuleTitle} />
        </Form>
      )}

      {step === "lesson" && (
        <Form
          busy={busy}
          onSubmit={() =>
            guard(async () => {
              const { id } = await sophiiaApi.createLesson(ids.module as string, {
                title: lessonTitle.trim(),
                is_mandatory: mandatory,
                order_index: 0,
              });
              // A publicação da versão precisa dar certo: sem is_current a
              // lição não aparece no seletor do Studio nem no Portal. Não
              // engole mais o erro — o upload de vídeo continua possível
              // (só depende da lição existir), mas o instrutor fica sabendo.
              let published = false;
              if (ids.version) {
                try {
                  await sophiiaApi.publishVersion(ids.version);
                  published = true;
                } catch (e) {
                  showToast({
                    title: "Lição criada, mas a versão não foi publicada",
                    description: e instanceof Error ? e.message : "Publique-a manualmente.",
                    tone: "danger",
                  });
                }
              }
              setStep("done");
              onLessonCreated(id);
              if (published) {
                showToast({
                  title: "Lição criada",
                  description: "Versão publicada. Agora envie a videoaula abaixo.",
                  tone: "success",
                });
              }
            })
          }
          disabled={!lessonTitle.trim()}
          cta="Criar lição e publicar versão"
        >
          <Text label="Título da lição" value={lessonTitle} onChange={setLessonTitle} />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
            />
            Obrigatória (conta para os 90% do certificado)
          </label>
        </Form>
      )}

      {step === "done" && (
        <p className="flex items-center gap-2 text-sm text-success">
          <Check className="h-4 w-4" /> Estrutura criada. O campo de upload já aponta para a nova
          lição.
        </p>
      )}
    </div>
  );
}

function Form({
  children,
  onSubmit,
  disabled,
  busy,
  cta,
}: {
  children: React.ReactNode;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  cta: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      {children}
      <button
        type="submit"
        disabled={disabled || busy}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {cta}
      </button>
    </form>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
