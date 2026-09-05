import type { DomainEvent } from "@moonship/shared";

import type {
  UnitCreated,
  UnitDetailsUpdated,
  UnitStatusChanged,
} from "../events/unit-events";
import type { Address } from "../value-objects/address";

export type UnitStatus = "vacant" | "occupied" | "offline";

export type UtilityType = "electric" | "gas" | "water" | "sewer" | "trash";

export type UtilityAssignment =
  | { type: UtilityType; kind: "individual" }
  | { type: UtilityType; kind: "shares"; withUnitId: string };

export interface UnitProps {
  id: string;
  propertyId: string;
  label: string;
  sqft: number;
  bedrooms?: number;
  bathrooms?: number;
  addressOverride?: Address | null;
  utilities: UtilityAssignment[];
  status: UnitStatus;
}

export function validateUtilityAssignments(
  unitId: string,
  assignments: UtilityAssignment[],
  existingUnitIds: Set<string>,
): void {
  const seenTypes = new Set<UtilityType>();

  for (const assignment of assignments) {
    if (seenTypes.has(assignment.type)) {
      throw new Error(`Duplicate utility type: ${assignment.type}`);
    }
    seenTypes.add(assignment.type);

    if (assignment.kind === "shares") {
      if (assignment.withUnitId === unitId) {
        throw new Error("Unit cannot share a utility with itself");
      }
      if (!existingUnitIds.has(assignment.withUnitId)) {
        throw new Error(
          `Shared utility target unit not found: ${assignment.withUnitId}`,
        );
      }
    }
  }
}

function assertPositiveInt(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

export class Unit {
  private props: UnitProps;
  private events: DomainEvent[] = [];

  private constructor(props: UnitProps) {
    this.props = props;
  }

  static create(props: UnitProps): Unit {
    assertPositiveInt(props.sqft, "sqft");
    const unit = new Unit({
      ...props,
      addressOverride: props.addressOverride ?? null,
      utilities: props.utilities,
    });
    const event: UnitCreated = {
      eventType: "UnitCreated",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        propertyId: props.propertyId,
        label: props.label,
      },
    };
    unit.addEvent(event);
    return unit;
  }

  static reconstitute(props: UnitProps): Unit {
    return new Unit({
      ...props,
      addressOverride: props.addressOverride ?? null,
      utilities: props.utilities,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get label(): string {
    return this.props.label;
  }

  get sqft(): number {
    return this.props.sqft;
  }

  get bedrooms(): number | undefined {
    return this.props.bedrooms;
  }

  get bathrooms(): number | undefined {
    return this.props.bathrooms;
  }

  get addressOverride(): Address | null {
    return this.props.addressOverride ?? null;
  }

  get utilities(): UtilityAssignment[] {
    return this.props.utilities;
  }

  get status(): UnitStatus {
    return this.props.status;
  }

  updateDetails(updates: {
    label?: string;
    sqft?: number;
    bedrooms?: number | null;
    bathrooms?: number | null;
    addressOverride?: Address | null;
    utilities?: UtilityAssignment[];
  }): void {
    if (updates.label !== undefined) this.props.label = updates.label;
    if (updates.sqft !== undefined) {
      assertPositiveInt(updates.sqft, "sqft");
      this.props.sqft = updates.sqft;
    }
    if (updates.bedrooms !== undefined)
      this.props.bedrooms = updates.bedrooms ?? undefined;
    if (updates.bathrooms !== undefined)
      this.props.bathrooms = updates.bathrooms ?? undefined;
    if (updates.addressOverride !== undefined)
      this.props.addressOverride = updates.addressOverride;
    if (updates.utilities !== undefined)
      this.props.utilities = updates.utilities;

    const event: UnitDetailsUpdated = {
      eventType: "UnitDetailsUpdated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    };
    this.addEvent(event);
  }

  changeStatus(status: UnitStatus): void {
    if (this.props.status === status) return;

    this.props.status = status;
    const event: UnitStatusChanged = {
      eventType: "UnitStatusChanged",
      occurredAt: new Date(),
      aggregateId: this.props.id,
      payload: { status },
    };
    this.addEvent(event);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }
}
