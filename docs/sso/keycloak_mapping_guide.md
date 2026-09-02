# Guia de Mapeamento SSO - Projeto SOPHIIA (Keycloak)

Este documento estabelece o contrato definitivo de configuração do Keycloak para que o *Single Sign-On (SSO)* funcione em total conformidade com as regras de Controle de Acesso (RBAC) do Projeto SOPHIIA.

O sistema exige que o Keycloak envie no payload do Token JWT (`access_token`) os papéis (Roles) do usuário, para que o Frontend (Next.js) restrinja a exibição visual de menus e o Backend (Go) aplique as regras de autorização de API.

---

## 1. Topologia do Realm

Recomendamos a criação de um Realm dedicado ou a utilização de um Realm corporativo existente.
- **Realm Name:** `sophiia` (ou o nome do domínio institucional).

---

## 2. Clientes (Clients)

O ecossistema SOPHIIA exige a criação de dois clientes distintos no Keycloak, com propósitos diferentes.

### A. Cliente do Frontend (Next.js)
Este cliente é responsável por fazer a ponte de login do usuário e obter o Token JWT.
- **Client ID:** `sophiia-frontend`
- **Client Protocol:** `openid-connect`
- **Access Type:** `confidential` (Requer Client ID e Client Secret)
- **Standard Flow Enabled:** `ON` (Authorization Code Flow)
- **Valid Redirect URIs:** `https://<seu-dominio>/api/auth/callback/keycloak`
- **Web Origins:** `https://<seu-dominio>`

> **Atenção:** O `Secret` gerado para este cliente deve ser injetado na variável de ambiente `KEYCLOAK_FRONTEND_CLIENT_SECRET` no arquivo `.env` do Frontend.

### B. Cliente do Backend (Go API)
Este cliente representa a API (Resource Server). Ele não faz login de usuários, mas é a **audiência** (Audience) esperada para os tokens gerados.
- **Client ID:** `sophiia-backend`
- **Client Protocol:** `openid-connect`
- **Access Type:** `bearer-only`

---

## 3. Papéis (Roles) Mapeados

A plataforma espera EXATAMENTE os nomes de papéis listados abaixo. Eles podem ser criados como **Realm Roles** (Recomendado para uso genérico) ou **Client Roles** no cliente `sophiia-backend`. O sistema consegue ler de ambas as origens.

Crie as seguintes Roles no Keycloak:
1. `sophiia-admin`: Administrador Geral do Sistema.
2. `sophiia-instructor`: Editor / Instrutor com acesso ao Studio para publicação de vídeos.
3. `sophiia-user`: Usuário Servidor Padrão (Acesso apenas ao Portal/Player de vídeo).
4. `sophiia-integration-manager`: Gerente focado apenas nas integrações.
5. `sophiia-auditor`: Perfil de leitura de relatórios e telemetria.

---

## 4. Configuração de Mappers (Importante!)

Para que o Next.js e o Go recebam corretamente a lista de papéis e validem a audiência, certifique-se que o Keycloak insira as Claims abaixo no `access_token`:

### Audience Mapper
Por padrão, o Keycloak pode não injetar a audiência correta do Backend no token do Frontend.
- Vá no Client `sophiia-frontend` > **Client Scopes** > **sophiia-frontend-dedicated** > **Add Mapper** > **Audience**.
- **Name:** `backend-audience`
- **Included Client Audience:** `sophiia-backend`
- **Add to access token:** `ON`

### Role Mapper
Verifique se o escopo `roles` está assinalado no Client Scope padrão. O payload JWT decodificado deve conter a estrutura:
```json
{
  "realm_access": {
    "roles": ["sophiia-user", "sophiia-instructor"]
  },
  "resource_access": {
    "sophiia-backend": {
      "roles": ["sophiia-admin"]
    }
  }
}
```
*O sistema SOPHIIA varre essas duas chaves para unificar as permissões.*

---

## 5. Variáveis de Ambiente a Atualizar (Produção)

Com o Keycloak configurado, o arquivo `.env` dos contêineres deve refletir o ambiente:

```env
# URL base do Realm
KEYCLOAK_ISSUER_URL=https://sso.instituicao.gov.br/realms/sophiia

# Backend OIDC
KEYCLOAK_AUDIENCE=sophiia-backend

# Frontend OIDC
KEYCLOAK_FRONTEND_CLIENT_ID=sophiia-frontend
KEYCLOAK_FRONTEND_CLIENT_SECRET=<seu-secret-aqui>
```
