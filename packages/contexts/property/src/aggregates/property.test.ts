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

  describe("pullEvents", () => {
    it("clears events after pulling", () => {
      const property = Property.create(buildPropertyProps());
      expect(property.pullEvents()).toHaveLength(1);
      expect(property.pullEvents()).toHaveLength(0);
    });
  });
});
