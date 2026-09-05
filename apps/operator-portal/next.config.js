import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
await jiti.import("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@moonship/api-operator",
    "@moonship/db",
    "@moonship/ui",
    "@moonship/shared",
    "@moonship/property",
    "@moonship/events",
    "@moonship/tenant-mgmt",
    "@moonship/lease-mgmt",
    "@moonship/blob-storage",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
};

export default config;
