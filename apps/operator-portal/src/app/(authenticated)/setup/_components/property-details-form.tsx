"use client";

import type { ReactNode } from "react";
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

import type { AddressDraft } from "./address-fields";
import { useTRPC } from "~/trpc/react";
import { formatDate } from "../../_lib/format";
import { useLedgerChanged } from "../../_lib/use-ledger-changed";
import {
  AddressFields,
  addressProblem,
  toAddress,
  toAddressDraft,
} from "./address-fields";
import { FormField } from "./form-field";
import { TimeZoneSelect } from "./time-zone-select";

type PropertyView = RouterOutputs["property"]["get"];

interface LetterDraft {
  ownerName: string;
  ownerTitle: string;
  companyName: string;
  ownerPhone: string;
  ownerEmail: string;
}

interface PropertyDraft {
  name: string;
  address: AddressDraft;
  trackingMonth: string;
  timeZone: string;
  letter: LetterDraft;
}

const LETTER_FIELDS: {
  key: keyof LetterDraft;
  label: string;
  type?: string;
  wide?: boolean;
}[] = [
  { key: "ownerName", label: "Owner name" },
  { key: "ownerTitle", label: "Title" },
  { key: "companyName", label: "Company", wide: true },
  { key: "ownerPhone", label: "Phone", type: "tel" },
  { key: "ownerEmail", label: "Email", type: "email" },
];

function toDraft(property: PropertyView): PropertyDraft {
  return {
    name: property.name,
    address: toAddressDraft(property.address),
    trackingMonth: property.trackingStartDate
      ? monthOf(property.trackingStartDate)
      : "",
    timeZone: property.timeZone,
    letter: {
      ownerName: property.letter.ownerName ?? "",
      ownerTitle: property.letter.ownerTitle ?? "",
      companyName: property.letter.companyName ?? "",
      ownerPhone: property.letter.ownerPhone ?? "",
      ownerEmail: property.letter.ownerEmail ?? "",
    },
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function CardHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="border-line flex items-center justify-between gap-2.5 border-b px-3.5 py-[11px] [&:not(:first-child)]:border-t">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {sub ? <span className="text-fg-3 text-[11.5px]">{sub}</span> : null}
    </div>
  );
}

function CardBody({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 p-3.5">{children}</div>;
}

export function PropertyDetailsForm() {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { data: bank } = useSuspenseQuery(trpc.rent.bankStatus.queryOptions());
  return (
    <PropertyDetailsFormInner
      property={property}
      trackingLocked={bank.newestBankDate !== null}
    />
  );
}

function PropertyDetailsFormInner({
  property,
  trackingLocked,
}: {
  property: PropertyView;
  trackingLocked: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const [draft, setDraft] = useState<PropertyDraft>(() => toDraft(property));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(property));

  const update = useMutation(
    trpc.property.update.mutationOptions({
      onSuccess: async (saved) => {
        setDraft(toDraft(saved));
        await Promise.all([
          queryClient.invalidateQueries(trpc.property.get.queryFilter()),
          ledgerChanged(),
        ]);
        toast.success("Property saved");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const setLetter = (key: keyof LetterDraft, value: string) =>
    setDraft({ ...draft, letter: { ...draft.letter, [key]: value } });

  return (
    <form
      className="border-line bg-panel animate-rise max-w-[720px] rounded-[9px] border"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.name.trim() === "") {
          toast.error("Enter the property name");
          return;
        }
        const problem = addressProblem(draft.address);
        if (problem) {
          toast.error(problem);
          return;
        }
        const month = draft.trackingMonth.trim();
        if (month && !isYearMonth(month)) {
          toast.error("Enter the tracking start as a month, like 2026-01");
          return;
        }
        update.mutate({
          name: draft.name.trim(),
          address: toAddress(draft.address),
          trackingStartDate: month ? firstDay(month) : null,
          timeZone: draft.timeZone,
          letter: {
            ownerName: orNull(draft.letter.ownerName),
            ownerTitle: orNull(draft.letter.ownerTitle),
            companyName: orNull(draft.letter.companyName),
            ownerPhone: orNull(draft.letter.ownerPhone),
            ownerEmail: orNull(draft.letter.ownerEmail),
          },
        });
      }}
    >
      <CardHeading title="Property" />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name" htmlFor="property-name">
            <Input
              id="property-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Time zone" htmlFor="property-time-zone">
            <TimeZoneSelect
              id="property-time-zone"
              value={draft.timeZone}
              onValueChange={(timeZone) => setDraft({ ...draft, timeZone })}
            />
          </FormField>
        </div>
        <AddressFields
          idPrefix="property"
          value={draft.address}
          onChange={(address) => setDraft({ ...draft, address })}
          street2Label="Address line 2"
        />
        <FormField
          label="Tracking start"
          htmlFor="property-tracking-start"
          className="sm:max-w-[calc(50%-6px)]"
          hint={
            trackingLocked
              ? "Locked because transactions exist."
              : "Starts on the 1st of this month. Locks once a transaction or balance exists."
          }
        >
          {trackingLocked ? (
            <Input
              id="property-tracking-start"
              value={formatDate(property.trackingStartDate)}
              disabled
              readOnly
            />
          ) : (
            <Input
              id="property-tracking-start"
              type="month"
              placeholder="YYYY-MM"
              value={draft.trackingMonth}
              onChange={(e) =>
                setDraft({ ...draft, trackingMonth: e.target.value })
              }
            />
          )}
        </FormField>
      </CardBody>
      <CardHeading title="Letter details" sub="Printed on every letter" />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2">
          {LETTER_FIELDS.map((field) => (
            <FormField
              key={field.key}
              label={field.label}
              htmlFor={`letter-${field.key}`}
              className={field.wide ? "sm:col-span-2" : undefined}
            >
              <Input
                id={`letter-${field.key}`}
                type={field.type ?? "text"}
                value={draft.letter[field.key]}
                onChange={(e) => setLetter(field.key, e.target.value)}
              />
            </FormField>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={!dirty || update.isPending}
            title={dirty ? undefined : "No changes to save"}
          >
            Save
          </Button>
        </div>
      </CardBody>
    </form>
  );
}
