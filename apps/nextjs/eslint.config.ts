import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@moonship/eslint-config/base";
import { nextjsConfig } from "@moonship/eslint-config/nextjs";
import { reactConfig } from "@moonship/eslint-config/react";

export default defineConfig(
  {
    ignores: [".next/**"],
  },
  baseConfig,
  reactConfig,
  nextjsConfig,
  restrictEnvAccess,
);
