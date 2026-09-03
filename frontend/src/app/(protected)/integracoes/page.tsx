import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { ApiError } from "@/lib/api/client";
import { serverApiGet } from "@/lib/api/server";
import type { Integration } from "@/types/api";
import { RoleGate } from "@/components/auth/RoleGate";
import { SOPHIIA_ROLES } from "@/lib/auth/rbac";

// Integrações (§ menu próprio, separado de Configurações): lista toda
// integração que o Projeto SOPHIIA tem hoje e vai ganhando com o tempo —
// cada card leva pra uma página de detalhe genérica
// (integracoes/[key]/page.tsx) onde de fato se configura/testa aquela
// integração. A lista em si é só pra navegar; testar acontece na página
// de detalhe, não aqui (por isso nenhum card recebe testPath).
export default async function IntegracoesPage() {
  let integrations: Integration[] | null = null;
  let errorMessage: string | null = null;
  try {
    const { data } = await serverApiGet<Integration[]>("v1/integrations");
    integrations = data;
  } catch (err) {
    errorMessage = err instanceof ApiError ? err.message : "Falha ao carregar integrações";
  }

  return (
    <RoleGate
      allowedRoles={[SOPHIIA_ROLES.ADMIN, SOPHIIA_ROLES.INTEGRATION_MANAGER, SOPHIIA_ROLES.AUDITOR]}
      showErrorPanel
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Sistemas externos"
          title="Integrações"
          subtitle="Sistemas aos quais o Projeto SOPHIIA se conecta — clique em um para configurar e testar."
        />

        {errorMessage && <ErrorState message={errorMessage} />}

        {integrations && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                extra={
                  <Link href={`/integracoes/${integration.key}`}>
                    <Button size="sm" variant="ghost">
                      Ver detalhes
                    </Button>
                  </Link>
                }
              />
            ))}
          </div>
        )}
      </div>
    </RoleGate>
  );
}
