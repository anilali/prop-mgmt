import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { createDb } from "@moonship/db";
import * as authSchema from "@moonship/db/schemas/auth-tenant";

import { env } from "~/env";

const db = createDb(env.POSTGRES_URL);

export const auth = betterAuth({
  baseURL: env.TENANT_BETTER_AUTH_URL,
  secret: env.TENANT_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...authSchema,
    },
  }),
  basePath: "/api/auth",
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [nextCookies()],
});

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const getEnrichedSession = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  };
});
