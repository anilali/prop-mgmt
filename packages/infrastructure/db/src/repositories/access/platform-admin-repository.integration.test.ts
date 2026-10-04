import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "../../client";
import { platformAdmins } from "../../schemas/access/schema";
import { PGPlatformAdminRepository } from "./platform-admin-repository";

const databaseUrl = process.env.POSTGRES_URL;

describe.skipIf(!databaseUrl)("PGPlatformAdminRepository", () => {
  if (!databaseUrl) throw new Error("POSTGRES_URL is required for this suite");
  const db = createDb(databaseUrl);
  const repo = new PGPlatformAdminRepository(db);
  const emails: string[] = [];

  afterAll(async () => {
    for (const email of emails) {
      await db.delete(platformAdmins).where(eq(platformAdmins.email, email));
    }
    await db.$client.end({ timeout: 5 });
  });

  it("claims an unclaimed row but never rebinds a claimed one", async () => {
    const email = `claim-test-${randomUUID()}@example.com`;
    emails.push(email);
    await db.insert(platformAdmins).values({ email });

    expect(await repo.claimByEmail(email, "auth-first")).toBe(true);
    expect(await repo.claimByEmail(email, "auth-second")).toBe(false);

    const kept = await repo.findByAuthUserId("auth-first");
    expect(kept?.email).toBe(email);
    expect(await repo.findByAuthUserId("auth-second")).toBeNull();
  });
});
