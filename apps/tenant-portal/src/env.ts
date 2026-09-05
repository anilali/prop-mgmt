import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

export const env = createEnv({
  extends: [vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
  },
  server: {
    POSTGRES_URL: z.string().min(1),
    TENANT_AUTH_SECRET: z.string().min(1),
    TENANT_GOOGLE_CLIENT_ID: z.string().min(1),
    TENANT_GOOGLE_CLIENT_SECRET: z.string().min(1),
    TENANT_BETTER_AUTH_URL: z.url(),
  },
  client: {},
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
