import type {
  AccessQueries,
  AccessState,
  PlatformAdminRepository,
  Role,
} from "@moonship/access";
import type { PropertyQueries } from "@moonship/property";
import { isPlatformAdmin } from "@moonship/access";

import type { Operator } from "./operator";

export const OPERATOR_CONTEXT_COOKIE = "op_ctx";

export const PLATFORM_CONTEXT_VALUE = "platform";

export interface OperableProperty {
  id: string;
  name: string;
  role: Role;
}

export type OperatorContext =
  | { mode: "property"; propertyId: string; propertyName: string; role: Role }
  | { mode: "platform" }
  | { mode: "no-access" };

export function parseOperatorContextCookie(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export function sortOperableProperties(
  properties: OperableProperty[],
): OperableProperty[] {
  return [...properties].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function resolveOperatorContext(input: {
  cookieValue: string | null | undefined;
  isPlatformAdmin: boolean;
  operableProperties: OperableProperty[];
}): OperatorContext {
  const cookieValue = parseOperatorContextCookie(input.cookieValue);
  const operable = sortOperableProperties(input.operableProperties);

  if (cookieValue !== null) {
    const match = operable.find((p) => p.id === cookieValue);
    if (match) {
      return {
        mode: "property",
        propertyId: match.id,
        propertyName: match.name,
        role: match.role,
      };
    }
    if (cookieValue === PLATFORM_CONTEXT_VALUE && input.isPlatformAdmin) {
      return { mode: "platform" };
    }
  }

  const first = operable[0];
  if (first) {
    return {
      mode: "property",
      propertyId: first.id,
      propertyName: first.name,
      role: first.role,
    };
  }

  if (input.isPlatformAdmin) {
    return { mode: "platform" };
  }

  return { mode: "no-access" };
}

export interface RequestAccess {
  operator: Operator;
  state: AccessState;
  isPlatformAdmin: boolean;
  operableProperties: OperableProperty[];
  context: OperatorContext;
}

export async function loadRequestAccess(
  deps: {
    accessQueries: AccessQueries;
    platformAdminRepository: PlatformAdminRepository;
    propertyQueries: PropertyQueries;
  },
  input: { operator: Operator; cookieValue: string | null | undefined },
): Promise<RequestAccess> {
  const memberships = await deps.accessQueries.listByAuthUserId(
    input.operator.authUserId,
  );
  const platformAdmin = await deps.platformAdminRepository.findByAuthUserId(
    input.operator.authUserId,
  );
  const state: AccessState = {
    platformAdmins: platformAdmin ? [platformAdmin] : [],
    memberships: memberships.map((m) => ({
      propertyId: m.propertyId,
      email: m.email,
      authUserId: m.authUserId,
      role: m.role,
      status: m.status,
    })),
  };
  const admin = isPlatformAdmin(input.operator, state);
  const active = memberships.filter((m) => m.status === "active");
  const views =
    active.length > 0
      ? await deps.propertyQueries.listByIds([
          ...new Set(active.map((m) => m.propertyId)),
        ])
      : [];
  const names = new Map(views.map((v) => [v.id, v.name]));
  const operable = sortOperableProperties(
    active.flatMap((m) => {
      const name = names.get(m.propertyId);
      return name === undefined
        ? []
        : [{ id: m.propertyId, name, role: m.role }];
    }),
  );
  const context = resolveOperatorContext({
    cookieValue: input.cookieValue,
    isPlatformAdmin: admin,
    operableProperties: operable,
  });
  return {
    operator: input.operator,
    state,
    isPlatformAdmin: admin,
    operableProperties: operable,
    context,
  };
}

export function decideOperatorContextSwitch(input: {
  requestedValue: string;
  isPlatformAdmin: boolean;
  operableProperties: OperableProperty[];
}): { ok: boolean; context: OperatorContext; path: string | null } {
  const context = resolveOperatorContext({
    cookieValue: input.requestedValue,
    isPlatformAdmin: input.isPlatformAdmin,
    operableProperties: input.operableProperties,
  });
  if (input.requestedValue === PLATFORM_CONTEXT_VALUE) {
    if (context.mode === "platform") {
      return { ok: true, context, path: "/platform/properties" };
    }
    return { ok: false, context, path: null };
  }
  if (
    context.mode === "property" &&
    context.propertyId === input.requestedValue
  ) {
    return { ok: true, context, path: "/property" };
  }
  return { ok: false, context, path: null };
}
