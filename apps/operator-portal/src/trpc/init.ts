import { createOperatorAPI } from "@moonship/api-operator/server";

import { env } from "~/env";

export const { appRouter, createTRPCContext } = createOperatorAPI({
  databaseUrl: env.POSTGRES_URL,
  s3: {
    endpoint: env.AWS_ENDPOINT_URL_S3,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET,
    forcePathStyle: true,
  },
});
