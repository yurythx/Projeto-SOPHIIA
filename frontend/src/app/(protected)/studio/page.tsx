import { ModuleGate } from "@/components/modules/ModuleGate";
import { RoleGate } from "@/components/auth/RoleGate";
import { SOPHIIA_ROLES } from "@/lib/auth/rbac";
import { StudioClient } from "./StudioClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOPHIIA - Studio do Instrutor",
};

export default function StudioPage() {
  return (
    <RoleGate allowedRoles={[SOPHIIA_ROLES.INSTRUCTOR, SOPHIIA_ROLES.ADMIN]} showErrorPanel>
      <ModuleGate flag="module_sophiia_enabled" moduleName="SOPHIIA">
        <StudioClient />
      </ModuleGate>
    </RoleGate>
  );
}
