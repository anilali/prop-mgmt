"use client";

import type { Address } from "@moonship/shared";
import { Input } from "@moonship/ui/input";

import { FormField } from "./form-field";

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

export function addressProblem(draft: AddressDraft): string | null {
  const address = toAddress(draft);
  const missing = [
    address.street1,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].some((part) => part === "");
  return missing
    ? "Enter the street, city, state, postal code, and country"
    : null;
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
        <FormField label="Street" htmlFor={`${idPrefix}-street1`}>
          <Input {...field("street1")} required />
        </FormField>
        <FormField label={street2Label} htmlFor={`${idPrefix}-street2`}>
          <Input {...field("street2")} placeholder="Optional" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <FormField
          label="City"
          htmlFor={`${idPrefix}-city`}
          className="col-span-2 sm:col-span-1"
        >
          <Input {...field("city")} required />
        </FormField>
        <FormField label="State" htmlFor={`${idPrefix}-state`}>
          <Input {...field("state")} required />
        </FormField>
        <FormField label="Postal code" htmlFor={`${idPrefix}-postalCode`}>
          <Input {...field("postalCode")} required />
        </FormField>
        <FormField label="Country" htmlFor={`${idPrefix}-country`}>
          <Input {...field("country")} required />
        </FormField>
      </div>
    </div>
  );
}

export function formatStreet(address: Address): string {
  return address.street2
    ? `${address.street1}, ${address.street2}`
    : address.street1;
}
