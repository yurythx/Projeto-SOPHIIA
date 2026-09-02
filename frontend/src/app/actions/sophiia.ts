"use server";

import { BACKEND_INTERNAL_URL } from "@/lib/api/backendUrl";
import { getServerToken } from "@/lib/auth/serverToken";
import { accessTokenUsable } from "@/lib/auth/tokenState";

/**
 * Registra o progresso de uma aula de forma segura no servidor.
 * Protegido nativamente pelo Next.js contra CSRF (React Server Actions).
 */
export async function recordHeartbeatAction(
  courseVersionId: string,
  lessonId: string,
  positionSeconds: number
) {
  const token = await getServerToken();

  if (!accessTokenUsable(token)) {
    throw new Error("Unauthorized");
  }

  const res = await fetch(`${BACKEND_INTERNAL_URL}/api/v1/sophiia/portal/progress/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify({
      course_version_id: courseVersionId,
      lesson_id: lessonId,
      position_seconds: Math.max(0, Math.round(positionSeconds)),
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to record heartbeat");
  }

  return { success: true };
}

/**
 * Marca uma aula como concluída.
 */
export async function completeLessonAction(lessonId: string) {
  const token = await getServerToken();

  if (!accessTokenUsable(token)) {
    throw new Error("Unauthorized");
  }

  const res = await fetch(`${BACKEND_INTERNAL_URL}/api/v1/sophiia/portal/lessons/${lessonId}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to complete lesson");
  }

  return { success: true };
}
