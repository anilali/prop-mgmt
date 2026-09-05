import { createOperatorAPI } from "@moonship/api-operator/server";

import { env } from "~/env";

export const { appRouter, createTRPCContext } = createOperatorAPI({
  databaseUrl: env.POSTGRES_URL,
  s3: {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  },
});
