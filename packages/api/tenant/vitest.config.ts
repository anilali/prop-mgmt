import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-tenant",
    passWithNoTests: true,
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
  },
});
