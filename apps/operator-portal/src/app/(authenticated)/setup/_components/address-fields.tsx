"use client";

import type { Address } from "@moonship/shared";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

export interface AddressDraft {
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export function toAddressDraft(address: Address): AddressDraft {
  return {
    street1: address.street1,
    street2: address.street2 ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

export function toAddress(draft: AddressDraft): Address {
  const street2 = draft.street2.trim();
  return {
    street1: draft.street1.trim(),
    ...(street2 ? { street2 } : {}),
    city: draft.city.trim(),
    state: draft.state.trim(),
    postalCode: draft.postalCode.trim(),
    country: draft.country.trim(),
  };
}

export function AddressFields({
  idPrefix,
  value,
  onChange,
  street2Label,
}: {
  idPrefix: string;
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
  street2Label: string;
}) {
  const field = (key: keyof AddressDraft) => ({
    id: `${idPrefix}-${key}`,
    value: value[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [key]: e.target.value }),
  });

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-street1`}>Street</Label>
          <Input {...field("street1")} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-street2`}>{street2Label}</Label>
          <Input {...field("street2")} placeholder="Optional" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <Input {...field("city")} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-state`}>State</Label>
          <Input {...field("state")} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-postalCode`}>Postal code</Label>
          <Input {...field("postalCode")} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-country`}>Country</Label>
          <Input {...field("country")} required />
        </div>
      </div>
    </div>
  );
}

export function formatStreet(address: Address): string {
  return address.street2
    ? `${address.street1}, ${address.street2}`
    : address.street1;
}
