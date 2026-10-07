import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { claimAccessOnSignIn } from "@moonship/api-operator/server";
import { eq } from "@moonship/db";
import * as authSchema from "@moonship/db/schemas/auth-operator";

import { env } from "~/env";
import { db, operatorApi } from "~/server/operator-api";

export const auth = betterAuth({
  baseURL: env.OPERATOR_BETTER_AUTH_URL,
  secret: env.OPERATOR_AUTH_SECRET,
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
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          try {
            const rows = await db
              .select({
                email: authSchema.user.email,
                name: authSchema.user.name,
              })
              .from(authSchema.user)
              .where(eq(authSchema.user.id, session.userId))
              .limit(1);
            const row = rows[0];
            if (!row?.email) return;
            await claimAccessOnSignIn(operatorApi.claimAccessDeps, {
              authUserId: session.userId,
              email: row.email,
              name: row.name,
            });
          } catch (error) {
            console.error(
              "[operator-portal] claimAccessOnSignIn failed; signing in with no access",
              error,
            );
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
