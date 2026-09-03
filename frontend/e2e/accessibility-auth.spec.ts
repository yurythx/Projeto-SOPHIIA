import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Varredura axe / e-MAG das telas AUTENTICADAS (catálogo, sala de aula,
// Studio, monitoramento, etc.) — as rotas públicas já são cobertas por
// accessibility.spec.ts. Mesmo gate da suíte de auth: precisa de
// E2E_ADMIN_PASSWORD (o job `e2e` do CI semeia com `make seed-admin`).
//
// Faz UM login para o arquivo inteiro (context compartilhado) — o login
// local tem rate limit por IP (5/60s) e uma varredura por teste
// estouraria isso em execução paralela.
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe("Acessibilidade (e-MAG / WCAG) — Rotas autenticadas", () => {
  test.skip(
    !ADMIN_PASSWORD,
    "E2E_ADMIN_PASSWORD não definida — rode `make seed-admin` e exporte a senha impressa.",
  );
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await page.goto("/login");
    await page.getByLabel("Usuário").fill(ADMIN_USERNAME);
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  async function scan() {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // A raiz do documento (barra e-MAG + Topbar) é compartilhada e já
      // coberta pelos testes públicos; aqui foca-se no <main> da tela.
      .include("main#conteudo")
      .analyze();
    expect(results.violations).toEqual([]);
  }

  for (const [label, path] of [
    ["Visão geral", "/dashboard"],
    ["Meus Cursos (catálogo)", "/portal"],
    ["Studio (grid de cursos)", "/studio"],
    ["Integrações", "/integracoes"],
    ["Configurações", "/configuracao"],
    ["Configurações · Usuários", "/configuracao/usuarios"],
    ["Monitoramento", "/monitoramento"],
  ] as const) {
    test(`${label} sem violações`, async () => {
      await page.goto(path);
      await page.waitForSelector("main#conteudo");
      await page.waitForTimeout(1500); // deixa o SWR resolver os grids
      await scan();
    });
  }

  test("Sala de aula do Portal sem violações", async () => {
    await page.goto("/portal");
    await page.waitForSelector('a[href^="/portal/curso/"]');
    await page.locator('a[href^="/portal/curso/"]').first().click();
    await page.waitForSelector("main#conteudo");
    await page.waitForTimeout(2000);
    await scan();
  });

  test("Página do curso no Studio sem violações", async () => {
    await page.goto("/studio");
    await page.waitForSelector('a[href^="/studio/curso/"]');
    await page.locator('a[href^="/studio/curso/"]').first().click();
    await page.waitForSelector("main#conteudo");
    await page.waitForTimeout(2000);
    await scan();
  });
});
