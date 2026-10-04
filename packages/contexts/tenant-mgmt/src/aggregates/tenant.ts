import type { DomainEvent } from "@moonship/shared";

import type {
  TenantArchived,
  TenantCreated,
  TenantUpdated,
} from "../events/tenant-events";

export type TenantStatus = "active" | "archived";

export interface TenantProps {
  id: string;
  propertyId: string;
  fullName: string;
  email?: string;
  phone?: string;
  notes?: string;
  status: TenantStatus;
}

export class Tenant {
  private props: TenantProps;
  private events: DomainEvent[] = [];

  private constructor(props: TenantProps) {
    this.props = props;
  }

  static create(
    props: Omit<TenantProps, "status"> & { status?: TenantStatus },
  ): Tenant {
    const status = props.status ?? "active";
    const tenant = new Tenant({
      ...props,
      status,
    });
    const event: TenantCreated = {
      eventType: "TenantCreated",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        propertyId: props.propertyId,
        fullName: props.fullName,
      },
    };
    tenant.addEvent(event);
    return tenant;
  }

  static reconstitute(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  get id(): string {
    return this.props.id;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get fullName(): string {
    return this.props.fullName;
  }

  get email(): string | undefined {
    return this.props.email;
  }

  get phone(): string | undefined {
    return this.props.phone;
  }

  get notes(): string | undefined {
    return this.props.notes;
  }

  get status(): TenantStatus {
    return this.props.status;
  }

  update(updates: {
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  }): void {
    if (updates.fullName !== undefined) this.props.fullName = updates.fullName;
    if (updates.email !== undefined)
      this.props.email = updates.email ?? undefined;
    if (updates.phone !== undefined)
      this.props.phone = updates.phone ?? undefined;
    if (updates.notes !== undefined)
      this.props.notes = updates.notes ?? undefined;

    const event: TenantUpdated = {
      eventType: "TenantUpdated",
      occurredAt: new Date(),
      aggregateId: this.props.id,
    };
    this.addEvent(event);
  }

  archive(): void {
    if (this.props.status === "archived") return;

    this.props.status = "archived";
    const event: TenantArchived = {
      eventType: "TenantArchived",
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
