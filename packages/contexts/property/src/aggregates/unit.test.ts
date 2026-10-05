import { describe, expect, it } from "vitest";

import type { UnitCreated, UnitDetailsUpdated } from "../events/unit-events";
import type { Address } from "../value-objects/address";
import type { UnitProps } from "./unit";
import { Unit } from "./unit";

function buildAddress(overrides: Partial<Address> = {}): Address {
  return {
    street1: "100 Unit Lane",
    street2: "Suite 1A",
    city: "Springfield",
    state: "IL",
    postalCode: "62701",
    country: "US",
    ...overrides,
  };
}

function buildUnitProps(overrides: Partial<UnitProps> = {}): UnitProps {
  return {
    id: "unit-1",
    propertyId: "property-1",
    label: "1A",
    sqft: 850,
    sqftChangedOn: null,
    address: buildAddress(),
    ...overrides,
  };
}

describe("Unit", () => {
  describe("create", () => {
    it("creates a unit and emits UnitCreated with payload", () => {
      const address = buildAddress();
      const unit = Unit.create({
        id: "unit-1",
        propertyId: "property-1",
        label: " 1A ",
        sqft: 900,
        address,
      });

      expect(unit.id).toBe("unit-1");
      expect(unit.propertyId).toBe("property-1");
      expect(unit.label).toBe("1A");
      expect(unit.sqft).toBe(900);
      expect(unit.sqftChangedOn).toBeNull();
      expect(unit.address).toEqual(address);

      const events = unit.pullEvents();
      expect(events).toHaveLength(1);
      const created = events[0] as UnitCreated;
      expect(created.eventType).toBe("UnitCreated");
      expect(created.payload).toEqual({
        propertyId: "property-1",
        label: "1A",
      });
    });

    it("rejects non-positive or fractional sqft", () => {
      for (const sqft of [0, -10, 1.5]) {
        expect(() => Unit.create({ ...buildUnitProps(), sqft })).toThrow(
          "sqft must be a positive integer",
        );
      }
    });

    it("rejects an empty label", () => {
      expect(() => Unit.create({ ...buildUnitProps(), label: " " })).toThrow(
        "Unit label is required",
      );
    });
  });

  describe("reconstitute", () => {
    it("restores a unit without emitting events", () => {
      const unit = Unit.reconstitute(
        buildUnitProps({
          id: "unit-2",
          sqft: 1200,
          sqftChangedOn: "2026-03-02",
        }),
      );

      expect(unit.id).toBe("unit-2");
      expect(unit.sqft).toBe(1200);
      expect(unit.sqftChangedOn).toBe("2026-03-02");
      expect(unit.pullEvents()).toHaveLength(0);
    });
  });

  describe("updateDetails", () => {
    it("updates label and address and emits UnitDetailsUpdated", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      const address = buildAddress({ street2: "Suite 2B" });
      unit.updateDetails({ label: "2B", address }, "2026-05-01");

      expect(unit.label).toBe("2B");
      expect(unit.address).toEqual(address);
      expect(unit.sqftChangedOn).toBeNull();
      const events = unit.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as UnitDetailsUpdated).eventType).toBe(
        "UnitDetailsUpdated",
      );
    });

    it("records the change date when sqft changes", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      unit.updateDetails({ sqft: 1000 }, "2026-05-01");

      expect(unit.sqft).toBe(1000);
      expect(unit.sqftChangedOn).toBe("2026-05-01");
    });

    it("does not record a change date when none is given", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      unit.updateDetails({ sqft: 1000 }, null);

      expect(unit.sqft).toBe(1000);
      expect(unit.sqftChangedOn).toBeNull();
    });

    it("does not record a change date when sqft is unchanged", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      unit.updateDetails({ sqft: 850 }, "2026-05-01");

      expect(unit.sqftChangedOn).toBeNull();
    });

    it("rejects invalid sqft without changing the unit", () => {
      const unit = Unit.reconstitute(buildUnitProps());

      expect(() =>
        unit.updateDetails({ label: "9Z", sqft: 0 }, "2026-05-01"),
      ).toThrow("sqft must be a positive integer");
      expect(unit.label).toBe("1A");
    });
  });
});
