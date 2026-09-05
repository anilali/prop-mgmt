import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db-integration",
    include: ["**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
