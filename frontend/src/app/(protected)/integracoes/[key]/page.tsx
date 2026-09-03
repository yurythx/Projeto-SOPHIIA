import { notFound } from "next/navigation";

import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { integrationRegistry } from "@/lib/integrations/registry";
import { ApiError } from "@/lib/api/client";
import { serverApiGet } from "@/lib/api/server";
import type { Integration } from "@/types/api";
import { RoleGate } from "@/components/auth/RoleGate";
import { SOPHIIA_ROLES } from "@/lib/auth/rbac";

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  let integration: Integration | undefined;
  let errorMessage: string | null = null;
  try {
    const { data } = await serverApiGet<Integration[]>("v1/integrations");
    integration = data.find((i) => i.key === key);
  } catch (err) {
    errorMessage = err instanceof ApiError ? err.message : "Falha ao carregar";
  }

  if (!errorMessage && !integration) {
    notFound();
  }

  const registryEntry = integrationRegistry[key];

  return (
    <RoleGate allowedRoles={[SOPHIIA_ROLES.ADMIN, SOPHIIA_ROLES.INTEGRATION_MANAGER, SOPHIIA_ROLES.AUDITOR]} showErrorPanel>
    <div className="flex flex-col gap-6">
      {errorMessage && <ErrorState message={errorMessage} />}

      {integration && (
        <>
          <PageHeader
            eyebrow="Integração"
            title={integration.name}
            subtitle={
              registryEntry?.description ??
              "Configuração e teste de conectividade desta integração."
            }
          />

          <IntegrationCard integration={integration} testPath={registryEntry?.testPath} />
        </>
      )}
    </div>
    </RoleGate>
  );
}
