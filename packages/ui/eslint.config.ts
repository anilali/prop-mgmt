import { defineConfig } from "eslint/config";

import { baseConfig } from "@moonship/eslint-config/base";
import { reactConfig } from "@moonship/eslint-config/react";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  reactConfig,
);
