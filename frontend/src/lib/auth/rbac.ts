/**
 * Definição centralizada dos papéis (roles) da plataforma SOPHIIA.
 * Estes valores devem bater EXATAMENTE com as roles cadastradas no SSO (Keycloak).
 * O array de roles vem do JWT injetado no token (ver `types/next-auth.d.ts`).
 */

export const SOPHIIA_ROLES = {
  /**
   * Administrador Geral.
   * Tem acesso a todas as configurações, integrações, métricas e ao Studio.
   */
  ADMIN: "sophiia-admin",

  /**
   * Instrutor / Editor.
   * Tem acesso ao Studio para criar treinamentos e fazer upload de videoaulas.
   */
  INSTRUCTOR: "sophiia-instructor",

  /**
   * Usuário Comum (Servidor).
   * Tem acesso APENAS ao Portal SOPHIIA (visualização de aulas de seu grupo e perfil).
   */
  USER: "sophiia-user",

  /**
   * Gerente de Integrações.
   * Acesso focado em painéis de API e integrações externas.
   */
  INTEGRATION_MANAGER: "sophiia-integration-manager",

  /**
   * Auditor.
   * Papel somente-leitura para métricas e relatórios.
   */
  AUDITOR: "sophiia-auditor",
} as const;

export type SophiiaRole = (typeof SOPHIIA_ROLES)[keyof typeof SOPHIIA_ROLES];

/**
 * Verifica se um usuário possui pelo menos uma das roles exigidas.
 * Nota: `sophiia-admin` tem acesso irrestrito por padrão nesta função.
 */
export function hasRequiredRole(userRoles: string[] = [], requiredRoles: SophiiaRole[] = []): boolean {
  if (requiredRoles.length === 0) return true; // Sem restrições
  if (userRoles.includes(SOPHIIA_ROLES.ADMIN)) return true; // Admin acessa tudo

  return requiredRoles.some((role) => userRoles.includes(role));
}
