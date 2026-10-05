"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import { firstDay, isYearMonth, monthOf } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";

import type { AddressDraft } from "./address-fields";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../leases/_lib/format";
import { AddressFields, toAddress, toAddressDraft } from "./address-fields";
import { TimeZoneSelect } from "./time-zone-select";

type PropertyView = RouterOutputs["property"]["get"];

interface LetterDraft {
  ownerName: string;
  ownerTitle: string;
  companyName: string;
  ownerPhone: string;
  ownerEmail: string;
}

const LETTER_FIELDS: {
  key: keyof LetterDraft;
  label: string;
  type?: string;
}[] = [
  { key: "ownerName", label: "Owner name" },
  { key: "ownerTitle", label: "Title" },
  { key: "companyName", label: "Company" },
  { key: "ownerPhone", label: "Phone", type: "tel" },
  { key: "ownerEmail", label: "Email", type: "email" },
];

function toLetterDraft(letter: PropertyView["letter"]): LetterDraft {
  return {
    ownerName: letter.ownerName ?? "",
    ownerTitle: letter.ownerTitle ?? "",
    companyName: letter.companyName ?? "",
    ownerPhone: letter.ownerPhone ?? "",
    ownerEmail: letter.ownerEmail ?? "",
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function PropertyDetailsForm() {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  return <PropertyDetailsFormInner property={property} />;
}

function PropertyDetailsFormInner({ property }: { property: PropertyView }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState<AddressDraft>(
    toAddressDraft(property.address),
  );
  const [trackingMonth, setTrackingMonth] = useState(
    property.trackingStartDate ? monthOf(property.trackingStartDate) : "",
  );
  const [timeZone, setTimeZone] = useState(property.timeZone);
  const [letter, setLetter] = useState<LetterDraft>(
    toLetterDraft(property.letter),
  );

  const update = useMutation(
    trpc.property.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.property.get.queryFilter());
        toast.success("Property saved");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Property</h2>
        <p className="text-muted-foreground text-sm">
          Today at the property is {formatDate(property.today)}.
        </p>
      </div>
      <form
        className="grid max-w-3xl gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          const month = trackingMonth.trim();
          if (month && !isYearMonth(month)) {
            toast.error("Enter the tracking start as a month, like 2026-01");
            return;
          }
          update.mutate({
            name: name.trim(),
            address: toAddress(address),
            trackingStartDate: month ? firstDay(month) : null,
            timeZone,
            letter: {
              ownerName: orNull(letter.ownerName),
              ownerTitle: orNull(letter.ownerTitle),
              companyName: orNull(letter.companyName),
              ownerPhone: orNull(letter.ownerPhone),
              ownerEmail: orNull(letter.ownerEmail),
            },
          });
        }}
      >
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="property-name">Name</Label>
            <Input
              id="property-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <AddressFields
            idPrefix="property"
            value={address}
            onChange={setAddress}
            street2Label="Address line 2"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="property-tracking-start">Tracking starts</Label>
              <Input
                id="property-tracking-start"
                type="month"
                placeholder="YYYY-MM"
                value={trackingMonth}
                onChange={(e) => setTrackingMonth(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Starts on the first of this month. It can&apos;t change once any
                transaction or balance entry exists.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="property-time-zone">Time zone</Label>
              <TimeZoneSelect
                id="property-time-zone"
                value={timeZone}
                onValueChange={setTimeZone}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="space-y-1">
            <h3 className="font-medium">Letter details</h3>
            <p className="text-muted-foreground text-sm">
              Printed on the year-end letters.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LETTER_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`letter-${field.key}`}>{field.label}</Label>
                <Input
                  id={`letter-${field.key}`}
                  type={field.type ?? "text"}
                  value={letter[field.key]}
                  onChange={(e) =>
                    setLetter({ ...letter, [field.key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <Button type="submit" disabled={update.isPending}>
            Save property
          </Button>
        </div>
      </form>
    </section>
  );
}
