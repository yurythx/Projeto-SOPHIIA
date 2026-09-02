import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { authOptions } from "@/lib/auth/options";
import { hasRequiredRole, type SophiiaRole } from "@/lib/auth/rbac";

interface RoleGateProps {
  children: ReactNode;
  allowedRoles: SophiiaRole[];
  /**
   * Se true, exibe um painel de "Acesso Negado".
   * Se false (padrão), redireciona o usuário para o `/portal`.
   */
  showErrorPanel?: boolean;
}

/**
 * Server Component que barra a renderização de seu conteúdo se o usuário logado
 * não possuir ao menos uma das `allowedRoles` exigidas.
 */
export async function RoleGate({ children, allowedRoles, showErrorPanel = false }: RoleGateProps) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/login");
  }

  // Se o usuário não tiver as roles necessárias (e não for Admin)
  if (!hasRequiredRole(session.user.roles, allowedRoles)) {
    if (showErrorPanel) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-danger/20 bg-danger/5 p-12 text-center text-danger">
          <ShieldAlert className="mb-4 h-12 w-12 opacity-80" />
          <h2 className="text-lg font-bold">Acesso Negado</h2>
          <p className="mt-2 max-w-md text-sm opacity-80">
            Você não possui as permissões necessárias (roles: {allowedRoles.join(" ou ")})
            para acessar este painel. Caso acredite ser um erro, contate o administrador.
          </p>
        </div>
      );
    }
    
    // Redirecionamento silencioso (Padrão)
    redirect("/portal");
  }

  return <>{children}</>;
}
