import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@moonship/eslint-config/base";
import { reactConfig } from "@moonship/eslint-config/react";

export default defineConfig(
  {
    ignores: [".nitro/**", ".output/**", ".tanstack/**"],
  },
  baseConfig,
  reactConfig,
  restrictEnvAccess,
);
