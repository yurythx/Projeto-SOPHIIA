import { ModuleGate } from "@/components/modules/ModuleGate";
import { PortalClient } from "./PortalClient";
import { serverApiGet } from "@/lib/api/server";
import { SophiiaSystem } from "@/lib/api/sophiia";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOPHIIA - Portal",
};

export default async function PortalPage() {
  let fallbackSystems: SophiiaSystem[] = [];
  try {
    const res = await serverApiGet<SophiiaSystem[]>("v1/sophiia/portal/catalog/systems");
    fallbackSystems = res.data ?? [];
  } catch {
    // Falha silenciosa no servidor; o SWR tentará de novo no cliente.
  }

  return (
    <ModuleGate flag="module_sophiia_enabled" moduleName="SOPHIIA">
      <PortalClient fallbackSystems={fallbackSystems} />
    </ModuleGate>
  );
}
