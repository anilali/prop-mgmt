import "server-only";

import type { DatabaseClient } from "@moonship/db";
import { createOperatorAPI } from "@moonship/api-operator/server";
import { createDb } from "@moonship/db";

import { env } from "~/env";

const globalForOperatorApi = globalThis as unknown as {
  operatorDb?: DatabaseClient;
  operatorApi?: ReturnType<typeof createOperatorAPI>;
};

export const db = globalForOperatorApi.operatorDb ?? createDb(env.POSTGRES_URL);

export const operatorApi =
  globalForOperatorApi.operatorApi ??
  createOperatorAPI({
    db,
    s3: {
      endpoint: env.AWS_ENDPOINT_URL_S3,
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
      forcePathStyle: true,
    },
  });

if (env.NODE_ENV !== "production") {
  globalForOperatorApi.operatorDb = db;
  globalForOperatorApi.operatorApi = operatorApi;
}
