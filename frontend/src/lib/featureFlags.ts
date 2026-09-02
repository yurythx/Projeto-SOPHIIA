"use client";

import useSWR from "swr";

import { apiClient } from "@/lib/api/client";
import type { FeatureFlag } from "@/types/api";

// SWR key compartilhada com components/layout/Sidebar.tsx — as duas
// consultas de-duplicam no cache do SWR, sem request extra.
const FLAGS_KEY = "v1/admin/feature-flags";

export type FlagState = "on" | "off" | "unknown";

// useFeatureFlag resolve o estado de uma feature flag pelo endpoint
// administrativo. Retorna "unknown" enquanto carrega OU quando o usuário
// não tem permissão para ler as flags (sophiia-admin) — nesse caso o
// componente deve *fail-open* (mesmo comportamento do Sidebar), já que o
// backend ainda barra o acesso real com 503.
export function useFeatureFlag(key: string): FlagState {
  const { data, error } = useSWR<FeatureFlag[]>(
    FLAGS_KEY,
    () => apiClient.get<FeatureFlag[]>(FLAGS_KEY).then((res) => res.data),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (error || !data) return "unknown";
  const flag = data.find((f) => f.key === key);
  if (!flag) return "on"; // flag nunca registrada = habilitada por padrão
  return flag.enabled ? "on" : "off";
}
