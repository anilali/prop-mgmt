import { describe, expect, it } from "vitest";

import type {
  UnitCreated,
  UnitDetailsUpdated,
  UnitStatusChanged,
} from "../events/unit-events";
import type { Address } from "../value-objects/address";
import type { UnitProps, UtilityAssignment } from "./unit";
import { Unit, validateUtilityAssignments } from "./unit";

function buildAddress(overrides: Partial<Address> = {}): Address {
  return {
    street1: "100 Unit Lane",
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
    bedrooms: 2,
    bathrooms: 1,
    addressOverride: null,
    utilities: [],
    status: "vacant",
    ...overrides,
  };
}

describe("Unit", () => {
  describe("create", () => {
    it("creates a unit and emits UnitCreated with payload", () => {
      const utilities: UtilityAssignment[] = [
        { type: "electric", kind: "individual" },
        { type: "gas", kind: "shares", withUnitId: "unit-2" },
      ];
      const addressOverride = buildAddress();
      const unit = Unit.create(
        buildUnitProps({ sqft: 900, addressOverride, utilities }),
      );

      expect(unit.id).toBe("unit-1");
      expect(unit.propertyId).toBe("property-1");
      expect(unit.label).toBe("1A");
      expect(unit.sqft).toBe(900);
      expect(unit.bedrooms).toBe(2);
      expect(unit.bathrooms).toBe(1);
      expect(unit.addressOverride).toEqual(addressOverride);
      expect(unit.utilities).toEqual(utilities);
      expect(unit.status).toBe("vacant");

      const events = unit.pullEvents();
      expect(events).toHaveLength(1);
      const created = events[0] as UnitCreated;
      expect(created.eventType).toBe("UnitCreated");
      expect(created.payload).toEqual({
        propertyId: "property-1",
        label: "1A",
      });
    });

    it("rejects non-positive sqft", () => {
      expect(() => Unit.create(buildUnitProps({ sqft: 0 }))).toThrow(
        "sqft must be a positive integer",
      );
      expect(() => Unit.create(buildUnitProps({ sqft: -10 }))).toThrow(
        "sqft must be a positive integer",
      );
      expect(() => Unit.create(buildUnitProps({ sqft: 1.5 }))).toThrow(
        "sqft must be a positive integer",
      );
    });
  });

  describe("reconstitute", () => {
    it("restores a unit without emitting events", () => {
      const unit = Unit.reconstitute(
        buildUnitProps({ id: "unit-2", sqft: 1200 }),
      );

      expect(unit.id).toBe("unit-2");
      expect(unit.sqft).toBe(1200);
      expect(unit.pullEvents()).toHaveLength(0);
    });
  });

  describe("updateDetails", () => {
    it("updates label and emits UnitDetailsUpdated", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      unit.updateDetails({ label: "2B" });

      expect(unit.label).toBe("2B");
      const events = unit.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as UnitDetailsUpdated).eventType).toBe(
        "UnitDetailsUpdated",
      );
    });

    it("updates sqft, addressOverride, and utilities", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      const addressOverride = buildAddress({ street1: "200 Override Ave" });
      const utilities: UtilityAssignment[] = [
        { type: "water", kind: "individual" },
      ];

      unit.updateDetails({ sqft: 1000, addressOverride, utilities });

      expect(unit.sqft).toBe(1000);
      expect(unit.addressOverride).toEqual(addressOverride);
      expect(unit.utilities).toEqual(utilities);
    });

    it("clears bedrooms when set to null", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      unit.updateDetails({ bedrooms: null });

      expect(unit.bedrooms).toBeUndefined();
    });

    it("clears addressOverride when set to null", () => {
      const unit = Unit.reconstitute(
        buildUnitProps({ addressOverride: buildAddress() }),
      );
      unit.updateDetails({ addressOverride: null });

      expect(unit.addressOverride).toBeNull();
    });
  });

  describe("changeStatus", () => {
    it("changes status and emits UnitStatusChanged", () => {
      const unit = Unit.reconstitute(buildUnitProps());
      unit.changeStatus("occupied");

      expect(unit.status).toBe("occupied");
      const events = unit.pullEvents();
      expect(events).toHaveLength(1);
      const statusChanged = events[0] as UnitStatusChanged;
      expect(statusChanged.eventType).toBe("UnitStatusChanged");
      expect(statusChanged.payload).toEqual({ status: "occupied" });
    });

    it("does not emit when status is unchanged", () => {
      const unit = Unit.reconstitute(buildUnitProps({ status: "vacant" }));
      unit.changeStatus("vacant");

      expect(unit.pullEvents()).toHaveLength(0);
    });
  });
});

describe("validateUtilityAssignments", () => {
  const existingUnitIds = new Set(["unit-1", "unit-2", "unit-3"]);

  it("accepts valid individual and shared assignments", () => {
    expect(() =>
      validateUtilityAssignments(
        "unit-1",
        [
          { type: "electric", kind: "individual" },
          { type: "gas", kind: "shares", withUnitId: "unit-2" },
        ],
        existingUnitIds,
      ),
    ).not.toThrow();
  });

  it("rejects self-share", () => {
    expect(() =>
      validateUtilityAssignments(
        "unit-1",
        [{ type: "water", kind: "shares", withUnitId: "unit-1" }],
        existingUnitIds,
      ),
    ).toThrow("Unit cannot share a utility with itself");
  });

  it("rejects missing share target", () => {
    expect(() =>
      validateUtilityAssignments(
        "unit-1",
        [{ type: "sewer", kind: "shares", withUnitId: "unit-missing" }],
        existingUnitIds,
      ),
    ).toThrow("Shared utility target unit not found: unit-missing");
  });

  it("rejects duplicate utility types", () => {
    expect(() =>
      validateUtilityAssignments(
        "unit-1",
        [
          { type: "trash", kind: "individual" },
          { type: "trash", kind: "shares", withUnitId: "unit-2" },
        ],
        existingUnitIds,
      ),
    ).toThrow("Duplicate utility type: trash");
  });
});
