"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { formatCents } from "@moonship/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@moonship/ui/alert-dialog";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { PageHeader } from "@moonship/ui/page-header";

import type { Lease } from "../../_lib/lease-form";
import type { LeaseDialogTarget } from "./lease-dialog";
import { useTRPC } from "~/trpc/react";
import {
  ACCOUNT_STATE_LABELS,
  ACCOUNT_STATE_VARIANTS,
  formatDate,
} from "../../_lib/format";
import { leaseToForm, newestLease, renewalForm } from "../../_lib/lease-form";
import { LeaseCard } from "./lease-card";
import { LeaseDialog } from "./lease-dialog";
import { OpeningBalanceDialog } from "./opening-balance-dialog";
import { useAccountUpdated } from "./use-account-updated";

export function AccountPageContent({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const accountUpdated = useAccountUpdated(accountId);
  const { data } = useSuspenseQuery(
    trpc.account.get.queryOptions({ id: accountId }),
  );
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());
  const { account, unitPools } = data;

  const [leaseTarget, setLeaseTarget] = useState<LeaseDialogTarget | null>(
    null,
  );
  const [leaseToRemove, setLeaseToRemove] = useState<Lease | null>(null);
  const [removingAccount, setRemovingAccount] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);

  const leases = [...account.leases].sort((a, b) =>
    a.startDate < b.startDate ? -1 : 1,
  );
  const newest = newestLease(leases);

  const removeLease = useMutation(
    trpc.lease.remove.mutationOptions({
      onSuccess: async (detail) => {
        await accountUpdated(detail);
        toast.success("Lease removed");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeAccount = useMutation(
    trpc.account.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.account.list.queryFilter());
        toast.success("Account removed");
        router.push("/leases");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const balanceDescription = property.trackingStartDate
    ? `What the tenant owed at the end of the day before ${formatDate(property.trackingStartDate)}, including last year's true-up. Enter a prepayment as a negative amount. Only an account that starts on or before that date can have one; use an adjustment otherwise.`
    : "Set the tracking start date in Setup before entering an opening balance.";

  return (
    <div className="space-y-6">
      <Link
        href="/leases"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Leases
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {account.tenant.businessName}
            <Badge variant={ACCOUNT_STATE_VARIANTS[account.state]}>
              {ACCOUNT_STATE_LABELS[account.state]}
            </Badge>
          </span>
        }
        description={`Unit ${account.unit.label}`}
        action={
          <>
            {newest?.moveOutDate === null ? (
              <Button
                type="button"
                onClick={() =>
                  setLeaseTarget({
                    mode: "add",
                    initial: renewalForm(newest, unitPools),
                  })
                }
              >
                Add lease
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemovingAccount(true)}
            >
              Remove account
            </Button>
          </>
        }
      />

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-muted-foreground">Account start</dt>
          <dd className="font-medium">{formatDate(account.startDate)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Move-out</dt>
          <dd className="font-medium">{formatDate(account.endDate)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Opening balance</dt>
          <dd className="flex items-center gap-2 font-medium tabular-nums">
            {formatCents(account.openingBalanceCents)}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => setEditingBalance(true)}
            >
              Edit
            </Button>
          </dd>
        </div>
      </dl>

      <div className="space-y-4">
        {leases.map((lease) => (
          <LeaseCard
            key={lease.id}
            accountId={accountId}
            version={account.version}
            lease={lease}
            pools={unitPools}
            isNewest={lease.id === newest?.id}
            canRemove={leases.length > 1}
            onEdit={() =>
              setLeaseTarget({
                mode: "edit",
                lease,
                initial: leaseToForm(lease, unitPools),
                isNewest: lease.id === newest?.id,
              })
            }
            onRemove={() => setLeaseToRemove(lease)}
          />
        ))}
      </div>

      <LeaseDialog
        accountId={accountId}
        version={account.version}
        target={leaseTarget}
        pools={unitPools}
        onClose={() => setLeaseTarget(null)}
      />

      <OpeningBalanceDialog
        accountId={accountId}
        version={account.version}
        openingBalanceCents={account.openingBalanceCents}
        description={balanceDescription}
        open={editingBalance}
        onOpenChange={setEditingBalance}
      />

      <AlertDialog
        open={leaseToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setLeaseToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this lease?</AlertDialogTitle>
            <AlertDialogDescription>
              {leaseToRemove
                ? `The lease from ${formatDate(leaseToRemove.startDate)} to ${formatDate(leaseToRemove.endDate)} and its rent and estimate steps will be deleted.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (leaseToRemove) {
                  removeLease.mutate({
                    accountId,
                    expectedVersion: account.version,
                    leaseId: leaseToRemove.id,
                  });
                }
              }}
            >
              Remove lease
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removingAccount} onOpenChange={setRemovingAccount}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account?</AlertDialogTitle>
            <AlertDialogDescription>
              The account and all its leases will be deleted. An account with
              payments, balance entries, or statements cannot be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeAccount.mutate({ id: accountId })}
            >
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
