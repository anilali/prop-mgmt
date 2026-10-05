import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-operator-integration",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
