import { CheckCircle2, XCircle, ShieldCheck, Award } from "lucide-react";
import { BACKEND_INTERNAL_URL } from "@/lib/api/backendUrl";
import type { Metadata } from "next";

// Espelha a publicCertificateView do backend (transport/public_view.go):
// só o necessário para conferir autenticidade. O documento já chega
// mascarado do servidor (***.***.***-NN) — nunca o CPF completo.
interface Certificate {
  validation_token: string;
  holder_name: string;
  holder_document: string;
  course_title: string;
  version_tag: string;
  workload_hours: number;
  issued_at: string;
  status: "valid" | "revoked";
  is_valid: boolean;
}

export const metadata: Metadata = {
  title: "SOPHIIA - Validação de Certificado",
};

async function getCertificate(token: string): Promise<Certificate | null> {
  const url = new URL(
    `/api/v1/sophiia/public/certificates/validate/${encodeURIComponent(token)}`,
    BACKEND_INTERNAL_URL,
  );

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || json;
  } catch {
    return null;
  }
}

export default async function ValidateCertificatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cert = await getCertificate(token);

  return (
    <main
      id="conteudo"
      className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground"
    >
      <div className="w-full max-w-xl space-y-6 rounded-2xl border border-surface-border bg-surface p-8 shadow-lg">
        <div className="flex items-center justify-between border-b border-surface-border pb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-success" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">SOPHIIA</h1>
              <p className="text-xs text-muted">Validação Pública de Certificados Institucionais</p>
            </div>
          </div>
          <Award className="h-8 w-8 text-warning" />
        </div>

        {!cert && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-danger-strong"
          >
            <XCircle className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold">Certificado Inválido ou Não Encontrado</p>
              <p className="text-xs">
                O código {token} não foi localizado na base oficial da plataforma.
              </p>
            </div>
          </div>
        )}

        {cert && (
          <div className="space-y-6">
            {cert.is_valid ? (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-success-strong"
              >
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <div>
                  <p className="font-semibold">Certificado Autêntico e Válido</p>
                  <p className="text-xs">Emitido digitalmente via SOPHIIA Platform</p>
                </div>
              </div>
            ) : (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-warning-strong"
              >
                <XCircle className="h-6 w-6 shrink-0" />
                <div>
                  <p className="font-semibold">Certificado Revogado</p>
                  <p className="text-xs">
                    Este certificado consta na base oficial, mas foi revogado e não é mais válido.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div className="rounded-lg border border-surface-border bg-surface-hover p-3">
                <span className="block text-xs uppercase tracking-wider text-muted">
                  Servidor Publico
                </span>
                <span className="font-medium text-foreground">{cert.holder_name}</span>
              </div>
              <div className="rounded-lg border border-surface-border bg-surface-hover p-3">
                <span className="block text-xs uppercase tracking-wider text-muted">Documento</span>
                <span className="font-medium text-foreground">{cert.holder_document}</span>
              </div>
              <div className="rounded-lg border border-surface-border bg-surface-hover p-3 md:col-span-2">
                <span className="block text-xs uppercase tracking-wider text-muted">
                  Treinamento / Curso
                </span>
                <span className="font-medium text-foreground">
                  {cert.course_title} (v{cert.version_tag})
                </span>
              </div>
              <div className="rounded-lg border border-surface-border bg-surface-hover p-3">
                <span className="block text-xs uppercase tracking-wider text-muted">
                  Carga Horária
                </span>
                <span className="font-medium text-foreground">{cert.workload_hours} Horas</span>
              </div>
              <div className="rounded-lg border border-surface-border bg-surface-hover p-3">
                <span className="block text-xs uppercase tracking-wider text-muted">
                  Data de Emissão
                </span>
                <span className="font-medium text-foreground">
                  {new Date(cert.issued_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>

            <div className="pt-2 text-center">
              <p className="font-mono text-xs text-muted">
                Token de Verificação: {cert.validation_token}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
