import type { DomainEvent, IsoDate } from "@moonship/shared";

import type { UnitCreated, UnitDetailsUpdated } from "../events/unit-events";
import type { Address } from "../value-objects/address";

export interface UnitProps {
  id: string;
  propertyId: string;
  label: string;
  sqft: number;
  sqftChangedOn: IsoDate | null;
  address: Address;
}

function assertSqft(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("sqft must be a positive integer");
  }
}

function cleanLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new Error("Unit label is required");
  }
  return trimmed;
}

export class Unit {
  private props: UnitProps;
  private events: DomainEvent[] = [];

  private constructor(props: UnitProps) {
    this.props = props;
  }

  static create(props: Omit<UnitProps, "sqftChangedOn">): Unit {
    assertSqft(props.sqft);
    const unit = new Unit({
      ...props,
      label: cleanLabel(props.label),
      sqftChangedOn: null,
    });
    const event: UnitCreated = {
      eventType: "UnitCreated",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        propertyId: props.propertyId,
        label: unit.label,
      },
    };
    unit.addEvent(event);
    return unit;
  }

  static reconstitute(props: UnitProps): Unit {
    return new Unit({ ...props });
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

  get sqftChangedOn(): IsoDate | null {
    return this.props.sqftChangedOn;
  }

  get address(): Address {
    return this.props.address;
  }

  updateDetails(
    updates: { label?: string; sqft?: number; address?: Address },
    changedOn: IsoDate | null,
  ): void {
    const label =
      updates.label !== undefined ? cleanLabel(updates.label) : undefined;
    if (updates.sqft !== undefined) assertSqft(updates.sqft);

    if (label !== undefined) this.props.label = label;
    if (updates.address !== undefined) this.props.address = updates.address;
    if (updates.sqft !== undefined && updates.sqft !== this.props.sqft) {
      this.props.sqft = updates.sqft;
      if (changedOn !== null) this.props.sqftChangedOn = changedOn;
    }

    const event: UnitDetailsUpdated = {
      eventType: "UnitDetailsUpdated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
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
