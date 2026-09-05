import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    passWithNoTests: true,
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
  },
});
