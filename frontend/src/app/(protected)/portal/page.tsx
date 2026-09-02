import type { Metadata } from "next";

import { ModuleGate } from "@/components/modules/ModuleGate";
import { PortalClient } from "./PortalClient";

export const metadata: Metadata = {
  title: "SOPHIIA - Meus Cursos",
};

export default function PortalPage() {
  return (
    <ModuleGate flag="module_sophiia_enabled" moduleName="SOPHIIA">
      <PortalClient />
    </ModuleGate>
  );
}
