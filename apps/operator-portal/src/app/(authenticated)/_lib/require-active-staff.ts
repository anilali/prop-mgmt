import { redirect } from "next/navigation";

import { getEnrichedSession } from "~/auth/server";

export async function requireActiveStaff() {
  const session = await getEnrichedSession();
  if (!session) {
    redirect("/");
  }

  const isActiveStaff =
    !!session.staff && session.staff.status !== "deactivated";
  if (!isActiveStaff) {
    redirect("/property");
  }

  return session;
}
