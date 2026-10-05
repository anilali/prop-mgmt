import { redirect } from "next/navigation";

import { getRequestAccess } from "~/request-access";

export async function requireOperatorContext() {
  const access = await getRequestAccess();
  if (!access) {
    redirect("/");
  }
  if (access.context.mode === "no-access") {
    redirect("/no-access");
  }

  return { access, operator: access.operator, context: access.context };
}

export async function requirePropertyContext() {
  const result = await requireOperatorContext();
  if (result.context.mode !== "property") {
    redirect("/platform/properties");
  }

  return {
    ...result,
    propertyId: result.context.propertyId,
  };
}

export async function requirePlatformContext() {
  const result = await requireOperatorContext();
  if (result.context.mode !== "platform") {
    redirect("/home");
  }

  return result;
}
