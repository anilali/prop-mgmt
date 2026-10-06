"use client";

import type { Address } from "@moonship/shared";
import { Input } from "@moonship/ui/input";

export interface AddressDraft {
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export function addressDraft(
  address: Address | null | undefined,
): AddressDraft {
  return {
    street1: address?.street1 ?? "",
    street2: address?.street2 ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? "US",
  };
}

export function toAddress(draft: AddressDraft): Address | null {
  const filled = [
    draft.street1,
    draft.street2,
    draft.city,
    draft.state,
    draft.postalCode,
  ].some((part) => part.trim() !== "");
  if (!filled) return null;
  if (
    !draft.street1.trim() ||
    !draft.city.trim() ||
    !draft.state.trim() ||
    !draft.postalCode.trim()
  ) {
    throw new Error(
      "Enter the street, city, state, and postal code for the mailing address",
    );
  }
  if (!draft.country.trim()) {
    throw new Error("Enter the country for the mailing address");
  }
  return {
    street1: draft.street1.trim(),
    street2: draft.street2.trim() || undefined,
    city: draft.city.trim(),
    state: draft.state.trim(),
    postalCode: draft.postalCode.trim(),
    country: draft.country.trim(),
  };
}

export function AddressFields({
  value,
  onChange,
}: {
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
}) {
  const set = (key: keyof AddressDraft) => (text: string) =>
    onChange({ ...value, [key]: text });

  return (
    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
      <Input
        aria-label="Street"
        placeholder="Street"
        className="col-span-full"
        value={value.street1}
        onChange={(e) => set("street1")(e.target.value)}
      />
      <Input
        aria-label="Suite or unit"
        placeholder="Suite or unit"
        className="col-span-full"
        value={value.street2}
        onChange={(e) => set("street2")(e.target.value)}
      />
      <Input
        aria-label="City"
        placeholder="City"
        value={value.city}
        onChange={(e) => set("city")(e.target.value)}
      />
      <Input
        aria-label="State"
        placeholder="State"
        value={value.state}
        onChange={(e) => set("state")(e.target.value)}
      />
      <Input
        aria-label="Postal code"
        placeholder="Postal code"
        value={value.postalCode}
        onChange={(e) => set("postalCode")(e.target.value)}
      />
      <Input
        aria-label="Country"
        placeholder="Country"
        value={value.country}
        onChange={(e) => set("country")(e.target.value)}
      />
    </div>
  );
}
