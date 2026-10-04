"use server";

import "server-only";

import { cookies } from "next/headers";

import {
  decideOperatorContextSwitch,
  OPERATOR_CONTEXT_COOKIE,
} from "@moonship/api-operator/server";

import { getRequestAccess } from "~/request-access";
import { env } from "~/env";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function setOperatorContextAction(
  value: string,
): Promise<{ ok: boolean; path: string | null }> {
  const access = await getRequestAccess();
  if (!access) return { ok: false, path: null };
  const decision = decideOperatorContextSwitch({
    requestedValue: value,
    isPlatformAdmin: access.isPlatformAdmin,
    operableProperties: access.operableProperties,
  });
  if (!decision.ok || !decision.path) return { ok: false, path: null };
  (await cookies()).set(OPERATOR_CONTEXT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return { ok: true, path: decision.path };
}
