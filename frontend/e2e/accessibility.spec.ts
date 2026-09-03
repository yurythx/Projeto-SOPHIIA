import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Verifica rotas não-autenticadas
test.describe("Acessibilidade (e-MAG / WCAG) - Rotas Públicas", () => {
  test("Página de Validação de Certificados não deve ter violações automáticas de acessibilidade", async ({
    page,
  }) => {
    // Um token mockado para abrir a página (mesmo que dê NotFound, a estrutura deve ser acessível)
    await page.goto("/validar-certificado/00000000-0000-0000-0000-000000000000");

    // Aguarda montagem inicial
    await page.waitForSelector("main#conteudo");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Página Inicial (Landing Page) não deve ter violações", async ({ page }) => {
    await page.goto("/");

    // Aguarda montagem
    await page.waitForSelector("main");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
