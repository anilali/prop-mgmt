import "server-only";

import { createDb, PGPropertyQueries, PGStaffMemberQueries } from "@moonship/db";

import { env } from "~/env";

const db = createDb(env.POSTGRES_URL);

export async function getPropertySetupStatus(sessionStaff: {
  role: "admin" | "staff";
  status: string;
} | null) {
  const isActiveStaff =
    !!sessionStaff && sessionStaff.status !== "deactivated";

  if (isActiveStaff) {
    return { isActiveStaff: true, canClaimAdmin: false };
  }

  const property = await new PGPropertyQueries(db).get();
  if (!property) {
    return { isActiveStaff: false, canClaimAdmin: false };
  }

  const staff = await new PGStaffMemberQueries(db).list();
  const activeStaff = staff.filter((member) => member.status !== "deactivated");

  return {
    isActiveStaff: false,
    canClaimAdmin: activeStaff.length === 0,
  };
}
