"use client";

import type { RouterOutputs } from "@moonship/api-operator";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import { Checkbox } from "@moonship/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import { amountClass, formatAmount } from "../../_lib/transactions";
import { formatDate } from "../../../leases/_lib/format";

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
    <span className="font-mono text-xs break-all">
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
        <h2 className="text-lg font-medium">Preview</h2>
        <p className="text-muted-foreground text-sm">
          {result.format === "ofx"
            ? `${counts.rows} transactions in the file.`
            : `${counts.rows} rows below the header, ${counts.transactions} with a date and amount.`}{" "}
          Rows dated before {formatDate(result.trackingStartDate)} are skipped.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COUNT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd
              className={
                key === "errors" && counts.errors > 0
                  ? "text-destructive text-xl font-semibold tabular-nums"
                  : "text-xl font-semibold tabular-nums"
              }
            >
              {counts[key]}
            </dd>
          </div>
        ))}
      </dl>

      {result.errors.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-medium">Rows that could not be read</h3>
          <p className="text-muted-foreground text-sm">
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
                  <TableCell>{error.rowNumber}</TableCell>
                  <TableCell>
                    <Cells
                      cells={error.cells}
                      skipBlank={result.format === "ofx"}
                    />
                  </TableCell>
                  <TableCell className="text-destructive">
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
          <h3 className="font-medium">First rows</h3>
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
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.postedOn)}
                  </TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className={amountClass(row.amountCents)}>
                      {formatAmount(row.amountCents)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.status === "new" ? "secondary" : "outline"}
                    >
                      {STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {result.notTransactionRows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-medium">Not transaction rows</h3>
          <p className="text-muted-foreground text-sm">
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
                  <TableCell>{row.rowNumber}</TableCell>
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
          disabled={unskipped > 0 || counts.toInsert === 0 || importing}
          onClick={onImport}
        >
          Import {counts.toInsert}{" "}
          {counts.toInsert === 1 ? "transaction" : "transactions"}
        </Button>
        {unskipped > 0 ? (
          <p className="text-muted-foreground text-sm">
            {result.format === "ofx" ? "Skip" : "Skip or fix"} {unskipped}{" "}
            {unskipped === 1 ? "row" : "rows"} that could not be read.
          </p>
        ) : counts.toInsert === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing new to import.
          </p>
        ) : null}
      </div>
    </section>
  );
}
