import { describe, expect, it } from "vitest";

import type { Address } from "../value-objects/address";
import type { PropertyProps } from "./property";
import { Property } from "./property";

function buildAddress(overrides: Partial<Address> = {}): Address {
  return {
    street1: "123 Main St",
    city: "Springfield",
    state: "IL",
    postalCode: "62701",
    country: "US",
    ...overrides,
  };
}

function buildPropertyProps(
  overrides: Partial<PropertyProps> = {},
): PropertyProps {
  return {
    id: "property-1",
    name: "Oak Street Apartments",
    address: buildAddress(),
    trackingStartDate: null,
    timeZone: "America/Chicago",
    letter: {
      ownerName: null,
      ownerTitle: null,
      companyName: null,
      ownerPhone: null,
      ownerEmail: null,
    },
    ...overrides,
  };
}

describe("Property", () => {
  describe("create", () => {
    it("creates a property with given props", () => {
      const property = Property.create(buildPropertyProps());

      expect(property.id).toBe("property-1");
      expect(property.name).toBe("Oak Street Apartments");
      expect(property.address.city).toBe("Springfield");
    });

    it("defaults the time zone, tracking start, and letter details", () => {
      const property = Property.create({
        id: "property-1",
        name: "Oak Street Apartments",
        address: buildAddress(),
      });

      expect(property.timeZone).toBe("America/Chicago");
      expect(property.trackingStartDate).toBeNull();
      expect(property.letter.ownerName).toBeNull();
    });

    it("rejects an empty name", () => {
      expect(() => Property.create(buildPropertyProps({ name: "  " }))).toThrow(
        "Property name is required",
      );
    });

    it("emits a PropertyRegistered event", () => {
      const property = Property.create(buildPropertyProps());
      const events = property.pullEvents();

      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe("PropertyRegistered");
      expect(events[0]?.aggregateId).toBe("property-1");
    });
  });

  describe("reconstitute", () => {
    it("reconstitutes without emitting events", () => {
      const property = Property.reconstitute(buildPropertyProps());

      expect(property.pullEvents()).toHaveLength(0);
      expect(property.name).toBe("Oak Street Apartments");
    });
  });

  describe("updateMetadata", () => {
    it("updates the property name", () => {
      const property = Property.reconstitute(buildPropertyProps());
      property.updateMetadata({ name: "Pine Court" });

      expect(property.name).toBe("Pine Court");
    });

    it("updates the address", () => {
      const property = Property.reconstitute(buildPropertyProps());
      const address = buildAddress({ city: "Chicago" });
      property.updateMetadata({ address });

      expect(property.address.city).toBe("Chicago");
    });

    it("emits PropertyMetadataUpdated event", () => {
      const property = Property.reconstitute(buildPropertyProps());
      property.updateMetadata({ name: "Updated" });
      const events = property.pullEvents();

      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe("PropertyMetadataUpdated");
    });
  });

  describe("updateMetadata time zone", () => {
    it("updates a valid time zone", () => {
      const property = Property.reconstitute(buildPropertyProps());
      property.updateMetadata({ timeZone: "America/Los_Angeles" });

      expect(property.timeZone).toBe("America/Los_Angeles");
    });

    it("rejects an unknown time zone", () => {
      const property = Property.reconstitute(buildPropertyProps());

      expect(() => property.updateMetadata({ timeZone: "Mars/Base" })).toThrow(
        "Unknown time zone: Mars/Base",
      );
      expect(property.timeZone).toBe("America/Chicago");
    });
  });

  describe("setTrackingStartDate", () => {
    it("accepts the first of a month", () => {
      const property = Property.reconstitute(buildPropertyProps());
      property.setTrackingStartDate("2026-01-01");

      expect(property.trackingStartDate).toBe("2026-01-01");
    });

    it("rejects other days", () => {
      const property = Property.reconstitute(buildPropertyProps());

      expect(() => property.setTrackingStartDate("2026-01-15")).toThrow(
        "Tracking start date must be the first of a month",
      );
      expect(() => property.setTrackingStartDate("2026-02-30")).toThrow(
        "Tracking start date must be the first of a month",
      );
    });

    it("can be cleared", () => {
      const property = Property.reconstitute(
        buildPropertyProps({ trackingStartDate: "2026-01-01" }),
      );
      property.setTrackingStartDate(null);

      expect(property.trackingStartDate).toBeNull();
    });
  });

  describe("updateLetterDetails", () => {
    it("updates given fields, trims them, and clears empty ones", () => {
      const property = Property.reconstitute(
        buildPropertyProps({
          letter: {
            ownerName: "Pat Owner",
            ownerTitle: "Manager",
            companyName: null,
            ownerPhone: null,
            ownerEmail: null,
          },
        }),
      );
      property.updateLetterDetails({
        companyName: "  Oak LLC ",
        ownerTitle: "",
      });

      expect(property.letter).toEqual({
        ownerName: "Pat Owner",
        ownerTitle: null,
        companyName: "Oak LLC",
        ownerPhone: null,
        ownerEmail: null,
      });
    });
  });

  describe("pullEvents", () => {
    it("clears events after pulling", () => {
      const property = Property.create(buildPropertyProps());
      expect(property.pullEvents()).toHaveLength(1);
      expect(property.pullEvents()).toHaveLength(0);
    });
  });
});
