"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";
import { PageHeader } from "@moonship/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { AccountSummary } from "../_lib/lease-form";
import { useTRPC } from "~/trpc/react";
import {
  ACCOUNT_STATE_LABELS,
  ACCOUNT_STATE_VARIANTS,
  formatDate,
} from "../_lib/format";
import { newestLease } from "../_lib/lease-form";
import { OpenAccountDialog } from "./open-account-dialog";

export function AccountsPageContent() {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.account.list.queryOptions());
  const [open, setOpen] = useState(false);

  const groups: {
    unitId: string;
    label: string;
    accounts: AccountSummary[];
  }[] = [];
  for (const account of data.accounts) {
    const group = groups.find((g) => g.unitId === account.unit.id);
    if (group) {
      group.accounts.push(account);
    } else {
      groups.push({
        unitId: account.unit.id,
        label: account.unit.label,
        accounts: [account],
      });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leases"
        description="Each account is one tenant in one unit. Renewals are new leases on the same account."
        action={
          <Button type="button" onClick={() => setOpen(true)}>
            Open account
          </Button>
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          headline="No accounts"
          description="Open an account to start tracking a tenant's rent."
          className="rounded-lg border border-dashed py-16"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Move-out</TableHead>
              <TableHead>Newest lease ends</TableHead>
              <TableHead>Leases</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.unitId}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={7} className="font-semibold">
                    Unit {group.label}
                  </TableCell>
                </TableRow>
                {group.accounts.map((account) => {
                  const newest = newestLease(account.leases);
                  return (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">
                        <Link
                          className="underline underline-offset-4"
                          href={`/leases/${account.id}`}
                        >
                          {account.tenant.businessName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACCOUNT_STATE_VARIANTS[account.state]}>
                          {ACCOUNT_STATE_LABELS[account.state]}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(account.startDate)}</TableCell>
                      <TableCell>{formatDate(account.endDate)}</TableCell>
                      <TableCell>{formatDate(newest?.endDate)}</TableCell>
                      <TableCell>{account.leases.length}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link href={`/leases/${account.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
      <OpenAccountDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
