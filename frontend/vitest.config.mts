import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Config em ESM (.mts): sem __dirname/__filename globais — derivados de
// import.meta.url. Migrado de .ts porque o carregador nativo de config do
// Vite (padrão num major futuro) recusa sintaxe ESM num arquivo tratado
// como CommonJS.
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // e2e/ é Playwright, não Vitest (fixtures/APIs incompatíveis — page,
    // expect, etc. vêm de @playwright/test, não daqui) — sem o exclude,
    // o Vitest tenta rodar esses arquivos como se fossem seus e falha
    // com um erro de import, achado real adicionando o Playwright.
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
