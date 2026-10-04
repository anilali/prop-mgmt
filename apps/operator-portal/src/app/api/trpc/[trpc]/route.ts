import type { NextRequest } from "next/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import {
  mapSessionToOperator,
  OPERATOR_CONTEXT_COOKIE,
} from "@moonship/api-operator/server";

import { auth } from "~/auth/server";
import { appRouter, createTRPCContext } from "~/trpc/init";
import { operatorApi } from "~/server/operator-api";

const setCorsHeaders = (res: Response) => {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Request-Method", "*");
  res.headers.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
  res.headers.set("Access-Control-Allow-Headers", "*");
};

export const OPTIONS = () => {
  const response = new Response(null, {
    status: 204,
  });
  setCorsHeaders(response);
  return response;
};

const handler = async (req: NextRequest) => {
  const session = await auth.api.getSession({ headers: req.headers });
  const operator = session
    ? mapSessionToOperator({
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
      })
    : null;
  const access = operator
    ? await operatorApi.loadRequestAccess({
        operator,
        cookieValue: req.cookies.get(OPERATOR_CONTEXT_COOKIE)?.value,
      })
    : null;

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    createContext: () =>
      createTRPCContext({
        headers: req.headers,
        access,
      }),
    onError({ error, path }) {
      console.error(`>>> tRPC Error on '${path}'`, error);
    },
  });

  setCorsHeaders(response);
  return response;
};

export { handler as GET, handler as POST };
