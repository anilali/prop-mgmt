import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import {
  mapSessionToOperator,
  OPERATOR_CONTEXT_COOKIE,
} from "@moonship/api-operator/server";

import { getSession } from "~/auth/server";
import { operatorApi } from "~/server/operator-api";

export const getRequestAccess = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const operator = mapSessionToOperator({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  });
  if (!operator) return null;
  const cookieValue = (await cookies()).get(OPERATOR_CONTEXT_COOKIE)?.value;
  return operatorApi.loadRequestAccess({ operator, cookieValue });
});
