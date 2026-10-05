import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./test-setup-stores";

async function errorFrom(path: string, input: unknown) {
  const app = createTestApp();
  const access = await app.accessFor();
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: app.appRouter,
    req: new Request(`http://localhost/api/trpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(superjson.serialize(input)),
    }),
    createContext: () => ({ access }),
  });
  const body = (await response.json()) as {
    error: Parameters<typeof superjson.deserialize>[0];
  };
  return {
    status: response.status,
    error: superjson.deserialize<{ message: string; data: { code: string } }>(
      body.error,
    ),
  };
}

describe("error messages sent to the portal", () => {
  it("turns a failed input check into the first issue with its field", async () => {
    const { status, error } = await errorFrom("reconciliation.setLetterDate", {
      year: 2026,
      letterDate: "1/4/2027",
    });
    expect(status).toBe(400);
    expect(error.data.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("letterDate: Use a YYYY-MM-DD date");
  });

  it("names nested fields with dots", async () => {
    const { error } = await errorFrom("tenant.create", {
      businessName: "Cafe",
      mailingAddress: {
        street1: " ",
        city: "Springfield",
        state: "IL",
        postalCode: "62701",
        country: "US",
      },
    });
    expect(error.message).toMatch(/^mailingAddress\.street1: /);
  });

  it("keeps messages the procedures write", async () => {
    const { error } = await errorFrom("reconciliation.setLetterDate", {
      year: 2026,
      letterDate: "2026-12-01",
    });
    expect(error.message).toBe(
      "The letter date must be in 2027, the year after 2026",
    );
  });
});
