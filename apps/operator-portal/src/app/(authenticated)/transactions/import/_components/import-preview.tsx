"use client";

import type { RouterOutputs } from "@moonship/api-operator";
import { Button } from "@moonship/ui/button";
import { Checkbox } from "@moonship/ui/checkbox";
import { StatusPill } from "@moonship/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import { Amount } from "../../_components/amount";
import { formatDate } from "../../../_lib/format";

export type PreviewResult = RouterOutputs["bankImport"]["preview"];
type Counts = NonNullable<PreviewResult["counts"]>;
type RowStatus = PreviewResult["parsedRows"][number]["status"];

const STATUS_LABELS: Record<RowStatus, string> = {
  new: "New",
  duplicate: "Already imported",
  beforeTrackingStart: "Before tracking start",
  zeroAmount: "Zero amount",
};

const COUNT_LABELS: { key: keyof Counts; label: string }[] = [
  { key: "toInsert", label: "To import" },
  { key: "duplicates", label: "Already imported" },
  { key: "beforeTrackingStart", label: "Before tracking start" },
  { key: "zeroAmount", label: "Zero amount" },
  { key: "notTransaction", label: "Not a transaction" },
  { key: "errors", label: "Errors" },
];

function Cells({
  cells,
  skipBlank = false,
}: {
  cells: readonly string[];
  skipBlank?: boolean;
}) {
  return (
    <span className="font-mono text-xs break-all whitespace-normal">
      {cells
        .map((cell) => cell.trim())
        .filter((cell) => !skipBlank || cell !== "")
        .join(" | ")}
    </span>
  );
}

export function ImportPreview({
  result,
  counts,
  skipRows,
  onToggleSkip,
  onImport,
  importing,
}: {
  result: PreviewResult;
  counts: Counts;
  skipRows: readonly number[];
  onToggleSkip: (rowNumber: number, skip: boolean) => void;
  onImport: () => void;
  importing: boolean;
}) {
  const unskipped = result.errors.filter(
    (error) => !skipRows.includes(error.rowNumber),
  ).length;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-[13px] font-semibold">Preview</h2>
        <p className="text-fg-2 text-[12.5px]">
          {result.format === "ofx"
            ? `${counts.rows} transactions in the file.`
            : `${counts.rows} rows below the header, ${counts.transactions} with a date and amount.`}{" "}
          Rows dated before {formatDate(result.trackingStartDate)} are skipped.
        </p>
      </div>

      <dl className="border-line bg-line grid grid-cols-2 gap-px overflow-hidden rounded-[9px] border sm:grid-cols-3 lg:grid-cols-6">
        {COUNT_LABELS.map(({ key, label }) => (
          <div key={key} className="bg-panel min-w-0 px-3.5 py-3">
            <dt className="label-caps mb-1 truncate">{label}</dt>
            <dd
              className={
                key === "errors" && counts.errors > 0
                  ? "text-red font-mono text-[18px] font-medium tracking-[-0.03em]"
                  : "font-mono text-[18px] font-medium tracking-[-0.03em]"
              }
            >
              {counts[key]}
            </dd>
          </div>
        ))}
      </dl>

      {result.errors.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold">
            Rows that could not be read
          </h3>
          <p className="text-fg-2 text-[12.5px]">
            {result.format === "ofx"
              ? "Tick Skip to leave a row out."
              : "Fix the column matching, or tick Skip to leave a row out."}{" "}
            Every row here must be skipped before importing.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Skip</TableHead>
                <TableHead className="w-16">Row</TableHead>
                <TableHead>Cells</TableHead>
                <TableHead>Problem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.errors.map((error) => (
                <TableRow key={error.rowNumber}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Skip row ${error.rowNumber}`}
                      checked={skipRows.includes(error.rowNumber)}
                      onCheckedChange={(checked) =>
                        onToggleSkip(error.rowNumber, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="text-fg-3 font-mono">
                    {error.rowNumber}
                  </TableCell>
                  <TableCell>
                    <Cells
                      cells={error.cells}
                      skipBlank={result.format === "ofx"}
                    />
                  </TableCell>
                  <TableCell className="text-red whitespace-normal">
                    {error.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {result.parsedRows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold">First rows</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Row</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.parsedRows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell className="text-fg-3 font-mono">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell className="text-fg-3 font-mono">
                    {formatDate(row.postedOn)}
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate">
                    {row.description}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount cents={row.amountCents} />
                  </TableCell>
                  <TableCell>
                    <StatusPill
                      variant={row.status === "new" ? "accent" : "plain"}
                    >
                      {STATUS_LABELS[row.status]}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {result.notTransactionRows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold">Not transaction rows</h3>
          <p className="text-fg-2 text-[12.5px]">
            These rows have no date and no amount, so they are left out.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Row</TableHead>
                <TableHead>Cells</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.notTransactionRows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell className="text-fg-3 font-mono">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell>
                    <Cells cells={row.cells} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={unskipped > 0 || counts.toInsert === 0 || importing}
          onClick={onImport}
        >
          Import {counts.toInsert}{" "}
          {counts.toInsert === 1 ? "transaction" : "transactions"}
        </Button>
        {unskipped > 0 ? (
          <p className="text-fg-3 text-[12px]">
            {result.format === "ofx" ? "Skip" : "Skip or fix"} {unskipped}{" "}
            {unskipped === 1 ? "row" : "rows"} that could not be read.
          </p>
        ) : counts.toInsert === 0 ? (
          <p className="text-fg-3 text-[12px]">Nothing new to import.</p>
        ) : null}
      </div>
    </section>
  );
}
