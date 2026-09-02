import type { Metadata } from "next";

import { RoleGate } from "@/components/auth/RoleGate";
import { ModuleGate } from "@/components/modules/ModuleGate";
import { SOPHIIA_ROLES } from "@/lib/auth/rbac";
import { CourseStudioClient } from "./CourseStudioClient";

export const metadata: Metadata = {
  title: "SOPHIIA - Studio · Curso",
};

export default async function StudioCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <RoleGate allowedRoles={[SOPHIIA_ROLES.INSTRUCTOR, SOPHIIA_ROLES.ADMIN]} showErrorPanel>
      <ModuleGate flag="module_sophiia_enabled" moduleName="SOPHIIA">
        <CourseStudioClient courseId={courseId} />
      </ModuleGate>
    </RoleGate>
  );
}
