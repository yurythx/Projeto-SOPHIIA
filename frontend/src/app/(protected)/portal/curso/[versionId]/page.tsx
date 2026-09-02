import type { Metadata } from "next";

import { ModuleGate } from "@/components/modules/ModuleGate";
import { ClassroomClient } from "./ClassroomClient";

export const metadata: Metadata = {
  title: "SOPHIIA - Sala de Aula",
};

export default async function ClassroomPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  return (
    <ModuleGate flag="module_sophiia_enabled" moduleName="SOPHIIA">
      <ClassroomClient versionId={versionId} />
    </ModuleGate>
  );
}
