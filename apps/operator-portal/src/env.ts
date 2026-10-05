import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

export const env = createEnv({
  extends: [vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
  },
  server: {
    POSTGRES_URL: z.string().min(1),
    OPERATOR_AUTH_SECRET: z.string().min(1),
    OPERATOR_GOOGLE_CLIENT_ID: z.string().min(1),
    OPERATOR_GOOGLE_CLIENT_SECRET: z.string().min(1),
    OPERATOR_BETTER_AUTH_URL: z.url(),
    AWS_ENDPOINT_URL_S3: z.string().url(),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    TODAY_OVERRIDE: z.iso.date().optional(),
  },
  client: {},
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
