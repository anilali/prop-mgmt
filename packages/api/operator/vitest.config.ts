import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-operator",
    passWithNoTests: true,
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
  },
});
