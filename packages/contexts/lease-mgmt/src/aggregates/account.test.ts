import { describe, expect, it } from "vitest";

import type { AccountOpened, LeaseAdded } from "../events/account-events";
import type { LeaseTermsInput, NewLease } from "./account";
import { Account } from "./account";

const CAM = "pool-cam";
const WATER = "pool-water";

function buildTerms(overrides: Partial<LeaseTermsInput> = {}): LeaseTermsInput {
  return {
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    moveOutDate: null,
    lateFee: { amountCents: 5000, day: 10 },
    insuranceExpiresOn: "2024-11-30",
    rentSteps: [
      { id: "rent-1", startsOn: "2024-01-01", amountCents: 250_000 },
      { id: "rent-2", startsOn: "2024-07-01", amountCents: 260_000 },
    ],
    estimateSteps: [
      { id: "est-1", poolId: CAM, startsOn: "2024-01-01", amountCents: 26_861 },
    ],
    ...overrides,
  };
}

function buildLease(
  id: string,
  overrides: Partial<LeaseTermsInput> = {},
): NewLease {
  return { id, ...buildTerms(overrides) };
}

function openAccount(lease: NewLease = buildLease("lease-1")): Account {
  return Account.open(
    {
      id: "account-1",
      propertyId: "property-1",
      tenantId: "tenant-1",
      unitId: "unit-1",
      openingBalanceCents: 0,
    },
    lease,
  );
}

function renewal(id: string, startDate: string, endDate: string): NewLease {
  return buildLease(id, {
    startDate,
    endDate,
    rentSteps: [
      { id: `${id}-rent`, startsOn: startDate, amountCents: 270_000 },
    ],
    estimateSteps: [],
  });
}

describe("Account", () => {
  describe("open", () => {
    it("opens an account with its first lease and emits events", () => {
      const account = openAccount();

      expect(account.id).toBe("account-1");
      expect(account.tenantId).toBe("tenant-1");
      expect(account.unitId).toBe("unit-1");
      expect(account.leases).toHaveLength(1);
      expect(account.leases[0]?.rentSteps.map((s) => s.id)).toEqual([
        "rent-1",
        "rent-2",
      ]);

      const events = account.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual([
        "AccountOpened",
        "LeaseAdded",
      ]);
      expect((events[0] as AccountOpened).payload).toEqual({
        propertyId: "property-1",
        tenantId: "tenant-1",
        unitId: "unit-1",
      });
      expect((events[1] as LeaseAdded).payload.leaseId).toBe("lease-1");
    });

    it("rejects a non-integer opening balance", () => {
      expect(() =>
        Account.open(
          {
            id: "account-1",
            propertyId: "property-1",
            tenantId: "tenant-1",
            unitId: "unit-1",
            openingBalanceCents: 1.5,
          },
          buildLease("lease-1"),
        ),
      ).toThrow("Opening balance must be a whole number of cents");
    });

    it("accepts a negative opening balance for a prepayment", () => {
      const account = openAccount();
      account.setOpeningBalance(-36_279);

      expect(account.openingBalanceCents).toBe(-36_279);
    });
  });

  describe("rule 1: lease dates", () => {
    it("rejects an end date before the start date", () => {
      expect(() =>
        openAccount(buildLease("lease-1", { endDate: "2023-12-31" })),
      ).toThrow("endDate must be on or after startDate");
    });

    it("rejects a move-out date before the start date", () => {
      expect(() =>
        openAccount(buildLease("lease-1", { moveOutDate: "2023-12-31" })),
      ).toThrow("moveOutDate must be on or after startDate");
    });

    it("accepts a move-out date before the end date", () => {
      const account = openAccount(
        buildLease("lease-1", { moveOutDate: "2024-08-15" }),
      );

      expect(account.leases[0]?.moveOutDate).toBe("2024-08-15");
    });

    it("rejects impossible dates", () => {
      expect(() =>
        openAccount(buildLease("lease-1", { endDate: "2024-02-30" })),
      ).toThrow("endDate must be a date");
    });
  });

  describe("rule 2: rent steps", () => {
    it("requires at least one step", () => {
      expect(() =>
        openAccount(buildLease("lease-1", { rentSteps: [] })),
      ).toThrow("A lease needs at least one base rent step");
    });

    it("requires the first step to start on the lease start date", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", {
            rentSteps: [{ id: "r", startsOn: "2024-02-01", amountCents: 1 }],
          }),
        ),
      ).toThrow("The first base rent step must start on the lease start date");
    });

    it("rejects two steps on one date", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", {
            rentSteps: [
              { id: "a", startsOn: "2024-01-01", amountCents: 1 },
              { id: "b", startsOn: "2024-01-01", amountCents: 2 },
            ],
          }),
        ),
      ).toThrow("Two base rent steps start on 2024-01-01");
    });

    it("rejects negative amounts", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", {
            rentSteps: [{ id: "a", startsOn: "2024-01-01", amountCents: -1 }],
          }),
        ),
      ).toThrow("Base rent must be a whole number of cents >= 0");
    });

    it("moves the first step when the start date changes", () => {
      const account = openAccount();
      const lease = account.leases[0];
      if (!lease) throw new Error("missing lease");

      account.updateLease(lease.id, {
        ...buildTerms(),
        startDate: "2023-12-01",
      });

      const steps = account.leases[0]?.rentSteps;
      expect(steps?.map((s) => s.startsOn)).toEqual([
        "2023-12-01",
        "2024-07-01",
      ]);
      expect(steps?.[0]?.id).toBe("rent-1");
    });

    it("keeps step ids and notified times across updates", () => {
      const account = openAccount();
      const notifiedAt = new Date("2024-05-01T12:00:00Z");
      account.markRentStepNotified("lease-1", "rent-2", notifiedAt);

      account.updateLease("lease-1", {
        ...buildTerms(),
        rentSteps: [
          { id: "fresh-1", startsOn: "2024-01-01", amountCents: 250_000 },
          { id: "fresh-2", startsOn: "2024-07-01", amountCents: 260_000 },
          { id: "fresh-3", startsOn: "2024-10-01", amountCents: 270_000 },
        ],
      });

      const steps = account.leases[0]?.rentSteps;
      expect(steps?.map((s) => s.id)).toEqual(["rent-1", "rent-2", "fresh-3"]);
      expect(steps?.[1]?.tenantNotifiedAt).toEqual(notifiedAt);
      expect(steps?.[2]?.tenantNotifiedAt).toBeNull();
    });

    it("clears the notified time when a step's amount changes", () => {
      const account = openAccount();
      account.markRentStepNotified(
        "lease-1",
        "rent-2",
        new Date("2024-05-01T12:00:00Z"),
      );

      account.updateLease("lease-1", {
        ...buildTerms(),
        rentSteps: [
          { id: "rent-1", startsOn: "2024-01-01", amountCents: 250_000 },
          { id: "rent-2", startsOn: "2024-07-01", amountCents: 265_000 },
        ],
      });

      const step = account.leases[0]?.rentSteps[1];
      expect(step?.id).toBe("rent-2");
      expect(step?.amountCents).toBe(265_000);
      expect(step?.tenantNotifiedAt).toBeNull();
    });

    it("clears the notified time when a step's date changes", () => {
      const account = openAccount();
      account.markRentStepNotified(
        "lease-1",
        "rent-2",
        new Date("2024-05-01T12:00:00Z"),
      );

      account.updateLease("lease-1", {
        ...buildTerms(),
        rentSteps: [
          { id: "rent-1", startsOn: "2024-01-01", amountCents: 250_000 },
          { id: "rent-2", startsOn: "2024-08-01", amountCents: 260_000 },
        ],
      });

      const step = account.leases[0]?.rentSteps[1];
      expect(step?.id).toBe("rent-2");
      expect(step?.startsOn).toBe("2024-08-01");
      expect(step?.tenantNotifiedAt).toBeNull();
    });
  });

  describe("rule 3: estimate steps", () => {
    it("accepts a first step after the start date", () => {
      const account = openAccount(
        buildLease("lease-1", {
          estimateSteps: [
            {
              id: "w",
              poolId: WATER,
              startsOn: "2024-07-01",
              amountCents: 15_000,
            },
          ],
        }),
      );

      expect(account.leases[0]?.estimateSteps[0]?.startsOn).toBe("2024-07-01");
    });

    it("accepts steps after the end date", () => {
      const account = openAccount(
        buildLease("lease-1", {
          estimateSteps: [
            { id: "c", poolId: CAM, startsOn: "2025-01-01", amountCents: 1 },
          ],
        }),
      );

      expect(account.leases[0]?.estimateSteps).toHaveLength(1);
    });

    it("rejects a step before the start date", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", {
            estimateSteps: [
              { id: "c", poolId: CAM, startsOn: "2023-12-01", amountCents: 1 },
            ],
          }),
        ),
      ).toThrow("Estimate steps must start on or after the lease start date");
    });

    it("rejects two steps for one pool on one date", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", {
            estimateSteps: [
              { id: "a", poolId: CAM, startsOn: "2024-01-01", amountCents: 1 },
              { id: "b", poolId: CAM, startsOn: "2024-01-01", amountCents: 2 },
            ],
          }),
        ),
      ).toThrow("Two estimate steps for one pool start on 2024-01-01");
    });

    it("allows two pools on one date", () => {
      const account = openAccount(
        buildLease("lease-1", {
          estimateSteps: [
            { id: "a", poolId: CAM, startsOn: "2024-01-01", amountCents: 1 },
            { id: "b", poolId: WATER, startsOn: "2024-01-01", amountCents: 2 },
          ],
        }),
      );

      expect(account.leases[0]?.estimateSteps).toHaveLength(2);
    });

    it("rejects negative amounts", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", {
            estimateSteps: [
              { id: "a", poolId: CAM, startsOn: "2024-01-01", amountCents: -5 },
            ],
          }),
        ),
      ).toThrow("Estimate must be a whole number of cents >= 0");
    });
  });

  describe("rule 4: late fee", () => {
    it("accepts no late fee", () => {
      const account = openAccount(buildLease("lease-1", { lateFee: null }));

      expect(account.leases[0]?.lateFee).toBeNull();
    });

    it("rejects a zero amount", () => {
      expect(() =>
        openAccount(
          buildLease("lease-1", { lateFee: { amountCents: 0, day: 10 } }),
        ),
      ).toThrow("Late fee amount must be above 0");
    });

    it("rejects a day outside 1 to 28", () => {
      for (const day of [0, 29]) {
        expect(() =>
          openAccount(
            buildLease("lease-1", { lateFee: { amountCents: 5000, day } }),
          ),
        ).toThrow("Late fee day must be between 1 and 28");
      }
    });
  });

  describe("rule 5: leases on one account", () => {
    it("adds a renewal that starts after the first lease ends", () => {
      const account = openAccount();
      account.addLease(renewal("lease-2", "2025-01-01", "2025-12-31"));

      expect(account.leases.map((l) => l.id)).toEqual(["lease-1", "lease-2"]);
    });

    it("rejects overlapping leases", () => {
      const account = openAccount();

      expect(() =>
        account.addLease(renewal("lease-2", "2024-12-31", "2025-12-31")),
      ).toThrow("Leases on one account cannot overlap");
      expect(account.leases).toHaveLength(1);
    });

    it("rejects an update that makes leases overlap", () => {
      const account = openAccount();
      account.addLease(renewal("lease-2", "2025-01-01", "2025-12-31"));

      expect(() =>
        account.updateLease("lease-1", {
          ...buildTerms(),
          endDate: "2025-01-01",
        }),
      ).toThrow("Leases on one account cannot overlap");
      expect(account.leases[0]?.endDate).toBe("2024-12-31");
    });

    it("keeps at least one lease", () => {
      const account = openAccount();

      expect(() => account.removeLease("lease-1")).toThrow(
        "An account needs at least one lease",
      );
    });

    it("removes a lease when another remains", () => {
      const account = openAccount();
      account.addLease(renewal("lease-2", "2025-01-01", "2025-12-31"));
      account.pullEvents();

      account.removeLease("lease-1");

      expect(account.leases.map((l) => l.id)).toEqual(["lease-2"]);
      expect(account.pullEvents().map((e) => e.eventType)).toEqual([
        "LeaseRemoved",
      ]);
    });
  });

  describe("rule 6: move-out", () => {
    it("rejects a lease added after a lease with a move-out date", () => {
      const account = openAccount(
        buildLease("lease-1", { moveOutDate: "2024-08-15" }),
      );

      expect(() =>
        account.addLease(renewal("lease-2", "2025-01-01", "2025-12-31")),
      ).toThrow("Only the newest lease can have a move-out date");
    });

    it("rejects a move-out date on an older lease", () => {
      const account = openAccount();
      account.addLease(renewal("lease-2", "2025-01-01", "2025-12-31"));

      expect(() =>
        account.updateLease("lease-1", {
          ...buildTerms(),
          moveOutDate: "2024-12-31",
        }),
      ).toThrow("Only the newest lease can have a move-out date");
    });

    it("accepts a move-out date on the newest lease", () => {
      const account = openAccount();
      account.addLease(renewal("lease-2", "2025-01-01", "2025-12-31"));
      const newest = renewal("lease-2", "2025-01-01", "2025-12-31");

      account.updateLease("lease-2", { ...newest, moveOutDate: "2025-06-30" });

      expect(account.leases[1]?.moveOutDate).toBe("2025-06-30");
    });
  });

  describe("setEstimateStep", () => {
    it("adds a step on a new date", () => {
      const account = openAccount();
      account.setEstimateStep("lease-1", CAM, "2025-01-01", 28_724, "new-step");

      const steps = account.leases[0]?.estimateSteps;
      expect(steps?.map((s) => [s.id, s.startsOn, s.amountCents])).toEqual([
        ["est-1", "2024-01-01", 26_861],
        ["new-step", "2025-01-01", 28_724],
      ]);
    });

    it("replaces a step on the same date and keeps later steps", () => {
      const account = openAccount(
        buildLease("lease-1", {
          estimateSteps: [
            { id: "a", poolId: CAM, startsOn: "2024-01-01", amountCents: 1 },
            { id: "b", poolId: CAM, startsOn: "2025-01-01", amountCents: 2 },
            { id: "c", poolId: CAM, startsOn: "2025-06-01", amountCents: 3 },
          ],
        }),
      );

      account.setEstimateStep("lease-1", CAM, "2025-01-01", 99, "unused");

      expect(
        account.leases[0]?.estimateSteps.map((s) => [s.id, s.amountCents]),
      ).toEqual([
        ["a", 1],
        ["b", 99],
        ["c", 3],
      ]);
    });

    it("rejects an unknown lease", () => {
      const account = openAccount();

      expect(() =>
        account.setEstimateStep("missing", CAM, "2025-01-01", 1, "x"),
      ).toThrow("Lease not found: missing");
    });
  });

  describe("markRentStepNotified", () => {
    it("sets and clears the notified time", () => {
      const account = openAccount();
      const at = new Date("2024-06-01T00:00:00Z");

      account.markRentStepNotified("lease-1", "rent-2", at);
      expect(account.leases[0]?.rentSteps[1]?.tenantNotifiedAt).toEqual(at);

      account.markRentStepNotified("lease-1", "rent-2", null);
      expect(account.leases[0]?.rentSteps[1]?.tenantNotifiedAt).toBeNull();
    });

    it("rejects an unknown step", () => {
      const account = openAccount();

      expect(() =>
        account.markRentStepNotified("lease-1", "missing", new Date()),
      ).toThrow("Base rent step not found: missing");
    });
  });

  describe("reconstitute", () => {
    it("restores leases in start date order without events", () => {
      const first = openAccount().leases[0];
      if (!first) throw new Error("missing lease");
      const second = {
        ...first,
        id: "lease-2",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        rentSteps: [
          {
            id: "r2",
            startsOn: "2025-01-01",
            amountCents: 1,
            tenantNotifiedAt: null,
          },
        ],
      };

      const account = Account.reconstitute({
        id: "account-1",
        propertyId: "property-1",
        tenantId: "tenant-1",
        unitId: "unit-1",
        openingBalanceCents: 100,
        leases: [second, first],
      });

      expect(account.leases.map((l) => l.id)).toEqual(["lease-1", "lease-2"]);
      expect(account.pullEvents()).toHaveLength(0);
    });
  });
});
