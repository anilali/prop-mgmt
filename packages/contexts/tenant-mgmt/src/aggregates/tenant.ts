import type { Address, DomainEvent } from "@moonship/shared";

import type {
  TenantArchived,
  TenantCreated,
  TenantUpdated,
} from "../events/tenant-events";

export type TenantStatus = "active" | "archived";

export interface TenantProps {
  id: string;
  propertyId: string;
  businessName: string;
  contactName?: string;
  mailingAddress?: Address;
  email?: string;
  phone?: string;
  notes?: string;
  status: TenantStatus;
}

function cleanBusinessName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Business name is required");
  }
  return trimmed;
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
      businessName: cleanBusinessName(props.businessName),
      status,
    });
    const event: TenantCreated = {
      eventType: "TenantCreated",
      occurredAt: new Date(),
      aggregateId: props.id,
      payload: {
        propertyId: props.propertyId,
        businessName: tenant.businessName,
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

  get businessName(): string {
    return this.props.businessName;
  }

  get contactName(): string | undefined {
    return this.props.contactName;
  }

  get mailingAddress(): Address | undefined {
    return this.props.mailingAddress;
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
    businessName?: string;
    contactName?: string | null;
    mailingAddress?: Address | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  }): void {
    const businessName =
      updates.businessName !== undefined
        ? cleanBusinessName(updates.businessName)
        : undefined;
    if (businessName !== undefined) this.props.businessName = businessName;
    if (updates.contactName !== undefined)
      this.props.contactName = updates.contactName ?? undefined;
    if (updates.mailingAddress !== undefined)
      this.props.mailingAddress = updates.mailingAddress ?? undefined;
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
