import { PlatformMonitoringDashboard } from "@/components/monitoring/PlatformMonitoringDashboard";
import { RoleGate } from "@/components/auth/RoleGate";
import { SOPHIIA_ROLES } from "@/lib/auth/rbac";

export default function MonitoramentoPage() {
  return (
    <RoleGate allowedRoles={[SOPHIIA_ROLES.ADMIN]} showErrorPanel>
      <PlatformMonitoringDashboard />
    </RoleGate>
  );
}
