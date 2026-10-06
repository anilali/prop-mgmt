"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import type { IsoDate } from "@moonship/shared";
import { Button } from "@moonship/ui/button";
import { Money } from "@moonship/ui/money";

import type { TenantView } from "../../_components/tenant-dialog";
import type { AccountSummary, Lease } from "../../_lib/lease-form";
import type { RentLine } from "../../_lib/lease-terms";
import { useTRPC } from "~/trpc/react";
import { formatAddressLines } from "../../_lib/lease-terms";
import { formatDate } from "../../../_lib/format";
import { useLedgerChanged } from "../../../_lib/use-ledger-changed";
import { ConfirmDialog } from "../../../setup/_components/confirm-dialog";
import { lateFeeText } from "./lease-tab";

interface UnitInfo {
  label: string;
  sqft: number;
  addressLines: string[];
  poolNames: string[];
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="label-caps">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Prop({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-2 py-[5px] text-[12.5px] ${className ?? ""}`}
    >
      <span className="text-fg-3">{label}</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

function LinkButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="text-primary cursor-pointer font-medium hover:underline hover:underline-offset-[3px]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="text-fg-3 hover:text-foreground cursor-pointer pl-1 align-[-2px]"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => toast.success("Copied"),
          () => toast.error("Could not copy"),
        );
      }}
    >
      <Copy className="size-[13px]" strokeWidth={1.7} />
    </button>
  );
}

function insuranceText(lease: Lease | undefined, today: IsoDate): ReactNode {
  const date = lease?.insuranceExpiresOn ?? null;
  if (!date) return <span className="text-red">No certificate</span>;
  if (date < today) {
    return <span className="text-red">Expired {formatDate(date)}</span>;
  }
  return <>Until {formatDate(date)}</>;
}

export function AccountSide({
  account,
  tenant,
  unit,
  lease,
  rentLines,
  otherAccounts,
  today,
  onEditTenant,
  onEditAddress,
  onEditInsurance,
  onEditOpening,
}: {
  account: AccountSummary;
  tenant: TenantView | undefined;
  unit: UnitInfo | undefined;
  lease: Lease | undefined;
  rentLines: RentLine[];
  otherAccounts: AccountSummary[];
  today: IsoDate;
  onEditTenant: () => void;
  onEditAddress: () => void;
  onEditInsurance: () => void;
  onEditOpening: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ledgerChanged = useLedgerChanged();
  const [removing, setRemoving] = useState(false);

  const removeAccount = useMutation(
    trpc.account.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.account.list.queryFilter()),
          ledgerChanged(),
        ]);
        toast.success("Account removed");
        router.push("/tenants");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const total = rentLines.reduce((sum, line) => sum + line.amountCents, 0);

  return (
    <aside className="bg-panel border-line flex flex-col gap-[18px] px-[18px] pt-[18px] pb-10 max-[980px]:border-t min-[980px]:border-l">
      <Section
        title="Tenant"
        action={
          tenant ? <LinkButton onClick={onEditTenant}>Edit</LinkButton> : null
        }
      >
        <Prop label="Contact">{tenant?.contactName ?? "-"}</Prop>
        <Prop label="Email">
          {tenant?.email ? (
            <>
              {tenant.email}
              <CopyButton text={tenant.email} label="Copy email" />
            </>
          ) : (
            "-"
          )}
        </Prop>
        <Prop label="Phone">
          {tenant?.phone ? (
            <>
              {tenant.phone}
              <CopyButton text={tenant.phone} label="Copy phone" />
            </>
          ) : (
            "-"
          )}
        </Prop>
        <Prop label="Mailing">
          {tenant?.mailingAddress ? (
            <>
              {formatAddressLines(tenant.mailingAddress).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <LinkButton onClick={onEditAddress}>Edit</LinkButton>
            </>
          ) : (
            <>
              <span className="text-red">Missing.</span>{" "}
              <LinkButton onClick={onEditAddress}>Add address</LinkButton>
            </>
          )}
        </Prop>
        {otherAccounts.length > 0 ? (
          <Prop label="Also rents">
            {otherAccounts.map((other, index) => (
              <span key={other.id}>
                {index > 0 ? ", " : null}
                <Link
                  href={`/tenants/${other.id}`}
                  className="text-primary font-medium hover:underline hover:underline-offset-[3px]"
                >
                  Unit {other.unit.label}
                </Link>
              </span>
            ))}
          </Prop>
        ) : null}
      </Section>

      {unit ? (
        <Section title="Unit">
          <Prop label="Address">
            {unit.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </Prop>
          <Prop label="Size">{unit.sqft.toLocaleString()} sqft</Prop>
          <Prop label="Pools">
            {unit.poolNames.length > 0 ? unit.poolNames.join(", ") : "None"}
          </Prop>
        </Section>
      ) : null}

      {lease ? (
        <Section title="Monthly rent">
          {rentLines.map((line) => (
            <Prop key={line.key} label={line.label}>
              <Money cents={line.amountCents} />
            </Prop>
          ))}
          <Prop
            label="Total"
            className="border-line mt-[3px] border-t pt-[7px]"
          >
            <Money cents={total} className="font-medium" />
          </Prop>
        </Section>
      ) : null}

      <Section title="Lease">
        {lease ? (
          <>
            <Prop label="Term">
              {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
            </Prop>
            <Prop label="Late fee">{lateFeeText(lease)}</Prop>
            <Prop label="Insurance">
              {insuranceText(lease, today)}{" "}
              <LinkButton onClick={onEditInsurance}>Edit</LinkButton>
            </Prop>
          </>
        ) : null}
        <Prop label="Opening">
          <Money cents={account.openingBalanceCents} />{" "}
          <LinkButton onClick={onEditOpening}>Edit</LinkButton>
        </Prop>
      </Section>

      <div className="mt-auto pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-fg-3 hover:text-red -ml-2"
          disabled={removeAccount.isPending}
          onClick={() => setRemoving(true)}
        >
          Remove account
        </Button>
      </div>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove this account?"
        description="The account and all its leases will be deleted. An account with payments, balance entries, statements, or documents cannot be removed."
        confirmLabel="Remove account"
        onConfirm={() => removeAccount.mutate({ id: account.id })}
      />
    </aside>
  );
}
