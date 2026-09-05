import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { createDb, PGStaffMemberQueries } from "@moonship/db";
import * as authSchema from "@moonship/db/schemas/auth-operator";

import { env } from "~/env";

const db = createDb(env.POSTGRES_URL);

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
      clientId: env.OPERATOR_GOOGLE_CLIENT_ID,
      clientSecret: env.OPERATOR_GOOGLE_CLIENT_SECRET,
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

  const staffMember = await new PGStaffMemberQueries(db).getByAuthUserId(
    session.user.id,
  );

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    staff: staffMember
      ? {
          id: staffMember.id,
          role: staffMember.role,
          status: staffMember.status,
        }
      : null,
  };
});
