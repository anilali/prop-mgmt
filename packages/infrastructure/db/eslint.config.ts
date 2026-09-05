import { defineConfig } from "eslint/config";

import { baseConfig } from "@moonship/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**", "migrations/**"],
  },
  baseConfig,
);
