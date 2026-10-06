"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Chip } from "@moonship/ui/chip";
import { Money } from "@moonship/ui/money";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { StatementView, Workspace } from "../../_lib/reconciliation";
import { useTRPC } from "~/trpc/react";
import {
  missingAddressTenantIds,
  riseStyle,
  showPdf,
} from "../../_lib/reconciliation";

function total(values: (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

function Amount({
  cents,
  credit = false,
  className,
}: {
  cents: number | null;
  credit?: boolean;
  className?: string;
}) {
  if (cents === null) return <span className="text-fg-3">-</span>;
  return (
    <Money
      cents={cents}
      tone={credit && cents < 0 ? "green" : "default"}
      className={className}
    />
  );
}

export function Statements({ workspace }: { workspace: Workspace }) {
  const { statements } = workspace;
  const missingAddress = missingAddressTenantIds(workspace);

  if (statements.length === 0) {
    return (
      <p className="border-line-2 text-fg-2 rounded-[10px] border border-dashed py-12 text-center text-[12.5px]">
        No account paid a pool in {workspace.year}.
      </p>
    );
  }

  return (
    <div className="animate-rise" style={riseStyle(1)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">Months</TableHead>
            <TableHead className="text-right">True-up</TableHead>
            <TableHead className="text-right">Rent balance</TableHead>
            <TableHead className="text-right">Balance on account</TableHead>
            <TableHead className="text-right">New monthly rent</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((statement) => (
            <StatementRow
              key={statement.accountId}
              year={workspace.year}
              statement={statement}
              missingAddress={missingAddress.has(statement.tenantId)}
            />
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell />
            <TableCell className="text-right">
              <Amount
                cents={total(statements.map((s) => s.trueUpCents))}
                credit
              />
            </TableCell>
            <TableCell className="text-right">
              <Amount
                cents={total(statements.map((s) => s.priorBalanceCents))}
              />
            </TableCell>
            <TableCell className="text-right">
              <Amount
                cents={total(statements.map((s) => s.balanceOnAccountCents))}
              />
            </TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function StatementRow({
  year,
  statement,
  missingAddress,
}: {
  year: number;
  statement: StatementView;
  missingAddress: boolean;
}) {
  const trpc = useTRPC();
  const preview = useMutation(trpc.reconciliation.previewPdf.mutationOptions());
  const continuing = statement.continuing;

  const openPreview = () => {
    const tab = window.open("", "_blank");
    preview.mutate(
      { year, accountId: statement.accountId },
      {
        onSuccess: (result) => showPdf(tab, result.base64, result.fileName),
        onError: (err) => {
          tab?.close();
          toast.error(err.message);
        },
      },
    );
  };

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-1.5">
          <Link
            href={`/tenants/${statement.accountId}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {statement.businessName}
          </Link>
          <Chip>{statement.unitLabel}</Chip>
          {missingAddress ? (
            <span className="text-red text-[11.5px]">No mailing address</span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="text-fg-3 text-right font-mono">
        {statement.countedMonths.length}
      </TableCell>
      <TableCell className="text-right">
        <Amount cents={statement.trueUpCents} credit />
      </TableCell>
      <TableCell className="text-right">
        <Amount cents={statement.priorBalanceCents} />
      </TableCell>
      <TableCell className="text-right">
        <Amount
          cents={statement.balanceOnAccountCents}
          className="font-medium"
        />
      </TableCell>
      <TableCell className="text-right">
        {continuing ? (
          <Amount cents={continuing.newMonthlyRentCents} />
        ) : (
          <span className="text-fg-3">Not continuing</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!statement.canPreview || preview.isPending}
          title={
            statement.canPreview
              ? undefined
              : "A pool on this statement has no units"
          }
          onClick={openPreview}
        >
          <FileText />
          {preview.isPending ? "Preparing" : "Preview"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
