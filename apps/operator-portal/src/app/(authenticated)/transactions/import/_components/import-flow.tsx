"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import type { CsvMapping } from "@moonship/billing";
import { fileCharset } from "@moonship/billing";
import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { PreviewResult } from "./import-preview";
import { useTRPC } from "~/trpc/react";
import { useTransactionsChanged } from "../../_components/use-transactions-changed";
import { formatAmount } from "../../_lib/transactions";
import { formatDate } from "../../../leases/_lib/format";
import { ImportPreview } from "./import-preview";
import { MappingForm } from "./mapping-form";

const MAX_BYTES = 2 * 1024 * 1024;

interface LoadedFile {
  name: string;
  text: string;
}

type CsvPreview = Extract<PreviewResult, { format: "csv" }>;
type OfxPreview = Extract<PreviewResult, { format: "ofx" }>;

async function readBankFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 1024));
  return new TextDecoder(fileCharset(head)).decode(bytes);
}

function OfxAccount({ result }: { result: OfxPreview }) {
  const { last4, startOn, endOn, ledgerBalance, warning } = result.account;
  return (
    <div className="space-y-2 rounded-lg border p-4 text-sm">
      <p>
        QuickBooks file
        {last4 ? ` for the account ending ${last4}` : ""}
        {startOn && endOn
          ? `, ${formatDate(startOn)} to ${formatDate(endOn)}`
          : ""}
        .
        {ledgerBalance
          ? ` Bank balance ${formatAmount(ledgerBalance.amountCents)}${ledgerBalance.asOf ? ` on ${formatDate(ledgerBalance.asOf)}` : ""}.`
          : null}
      </p>
      <p className="text-muted-foreground">
        No column matching is needed. The bank&apos;s transaction id is used to
        leave out rows already imported.
      </p>
      {warning ? <p className="text-destructive">{warning}</p> : null}
    </div>
  );
}

function RawRows({ result }: { result: CsvPreview }) {
  const width = Math.max(
    result.headers.length,
    ...result.rawRows.map((row) => row.cells.length),
  );
  const columns = Array.from({ length: width }, (_, index) => index);
  if (width === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        {result.headerRow === null ? null : (
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{result.headerRow}</TableHead>
              {columns.map((index) => (
                <TableHead key={index}>{result.headers[index] ?? ""}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {result.rawRows.map((row) => (
            <TableRow key={row.rowNumber}>
              <TableCell className="text-muted-foreground">
                {row.rowNumber}
              </TableCell>
              {columns.map((index) => (
                <TableCell key={index} className="whitespace-nowrap">
                  {row.cells[index] ?? ""}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ImportFlow() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const transactionsChanged = useTransactionsChanged();
  const { data: savedMapping } = useSuspenseQuery(
    trpc.bankImport.getMapping.queryOptions(),
  );
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [headerRowText, setHeaderRowText] = useState("");
  const [editingMapping, setEditingMapping] = useState(false);
  const [skipRows, setSkipRows] = useState<number[]>([]);
  const [imported, setImported] = useState<number | null>(null);

  const preview = useMutation(
    trpc.bankImport.preview.mutationOptions({
      onError: (err) => toast.error(err.message),
    }),
  );

  const runPreview = (
    loaded: LoadedFile,
    options: { mapping?: CsvMapping; headerRow?: number; keepEditing: boolean },
  ) => {
    preview.mutate(
      {
        fileText: loaded.text,
        mapping: options.mapping,
        headerRow: options.headerRow,
      },
      {
        onSuccess: (next) => {
          setResult(next);
          setSkipRows((current) =>
            current.filter((row) =>
              next.errors.some((error) => error.rowNumber === row),
            ),
          );
          if (next.format === "ofx") {
            setHeaderRowText("");
            setEditingMapping(false);
            return;
          }
          setHeaderRowText(
            next.headerRow === null ? "" : String(next.headerRow),
          );
          setEditingMapping(
            next.mapping === null ||
              next.mappingError !== null ||
              options.keepEditing,
          );
        },
      },
    );
  };

  const commit = useMutation(
    trpc.bankImport.commit.mutationOptions({
      onSuccess: async (batch) => {
        await Promise.all([
          transactionsChanged(),
          queryClient.invalidateQueries(
            trpc.bankImport.getMapping.queryFilter(),
          ),
        ]);
        toast.success(
          `Imported ${batch.insertedCount} ${batch.insertedCount === 1 ? "transaction" : "transactions"}`,
        );
        setImported(batch.insertedCount);
        setFile(null);
        setResult(null);
        setSkipRows([]);
        setEditingMapping(false);
        setInputKey((key) => key + 1);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const onFile = async (selected: File | undefined) => {
    setImported(null);
    setResult(null);
    setSkipRows([]);
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_BYTES) {
      toast.error("The file is larger than 2 MB");
      setFile(null);
      setInputKey((key) => key + 1);
      return;
    }
    const loaded = {
      name: selected.name.slice(0, 255),
      text: await readBankFile(selected),
    };
    setFile(loaded);
    runPreview(loaded, { keepEditing: false });
  };

  const csvResult = result?.format === "csv" ? result : null;
  const ofxResult = result?.format === "ofx" ? result : null;
  const counts = result?.counts ?? null;
  const activeMapping =
    csvResult?.mapping && csvResult.mappingError === null
      ? csvResult.mapping
      : null;

  const onToggleSkip = (rowNumber: number, skip: boolean) =>
    setSkipRows((current) =>
      skip
        ? [...current.filter((row) => row !== rowNumber), rowNumber]
        : current.filter((row) => row !== rowNumber),
    );

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="bank-file">Bank file</Label>
        <Input
          key={inputKey}
          id="bank-file"
          type="file"
          accept=".csv,.qbo,.ofx,.qfx,text/csv"
          className="max-w-md"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">
          CSV or QuickBooks (.qbo, .ofx, .qfx), up to 2 MB.
        </p>
        {imported !== null ? (
          <p className="text-sm">
            Imported {imported}{" "}
            {imported === 1 ? "transaction" : "transactions"}.{" "}
            <Link className="underline underline-offset-4" href="/transactions">
              Sort them
            </Link>
          </p>
        ) : null}
      </div>

      {file && preview.isPending && !result ? (
        <p className="text-muted-foreground text-sm">Reading {file.name}...</p>
      ) : null}

      {file && ofxResult ? (
        <>
          <OfxAccount result={ofxResult} />
          <ImportPreview
            result={ofxResult}
            counts={ofxResult.counts}
            skipRows={skipRows}
            onToggleSkip={onToggleSkip}
            importing={commit.isPending}
            onImport={() =>
              commit.mutate({
                fileText: file.text,
                fileName: file.name,
                format: "ofx",
                skipRows,
              })
            }
          />
        </>
      ) : null}

      {file && csvResult ? (
        <>
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-medium">Header row</h2>
              <p className="text-muted-foreground text-sm">
                {csvResult.headerRow === null
                  ? "No row with column names was found. Enter the row number that has them."
                  : `Row ${csvResult.headerRow} has the column names. Rows above it are ignored.`}
              </p>
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const row = Number(headerRowText);
                if (!Number.isInteger(row) || row < 1) {
                  toast.error("Enter a row number of 1 or more");
                  return;
                }
                runPreview(file, {
                  mapping: activeMapping ?? undefined,
                  headerRow: row,
                  keepEditing: editingMapping,
                });
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="header-row">Row number</Label>
                <Input
                  id="header-row"
                  className="w-28"
                  inputMode="numeric"
                  value={headerRowText}
                  onChange={(e) => setHeaderRowText(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={preview.isPending}
              >
                Use this row
              </Button>
            </form>
            <RawRows result={csvResult} />
          </div>

          {csvResult.mappingError ? (
            <p className="text-destructive text-sm">
              The saved column matching doesn&apos;t fit this file:{" "}
              {csvResult.mappingError}. Match the columns again.
            </p>
          ) : null}

          {csvResult.headerRow !== null && editingMapping ? (
            <MappingForm
              key={`${csvResult.headerRow}-${csvResult.headers.join("\u001f")}`}
              headers={csvResult.headers}
              initial={csvResult.mapping ?? savedMapping}
              savedIdColumn={savedMapping?.idColumn ?? null}
              hasSavedMapping={savedMapping !== null}
              pending={preview.isPending}
              onPreview={(mapping) =>
                runPreview(file, {
                  mapping,
                  headerRow: csvResult.headerRow ?? undefined,
                  keepEditing: false,
                })
              }
              onCancel={activeMapping ? () => setEditingMapping(false) : null}
            />
          ) : activeMapping ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <p className="text-sm">
                Date: {activeMapping.dateColumn} ({activeMapping.dateFormat}).
                Description: {activeMapping.descriptionColumn}. Amount:{" "}
                {activeMapping.amount.mode === "signed"
                  ? `${activeMapping.amount.column}${activeMapping.amount.flipSign ? ", sign flipped" : ""}`
                  : `${activeMapping.amount.creditColumn} in, ${activeMapping.amount.debitColumn} out`}
                .
                {activeMapping.idColumn
                  ? ` Id: ${activeMapping.idColumn}.`
                  : null}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingMapping(true)}
              >
                Edit mapping
              </Button>
            </div>
          ) : null}

          {counts && activeMapping && !editingMapping ? (
            <ImportPreview
              result={csvResult}
              counts={counts}
              skipRows={skipRows}
              onToggleSkip={onToggleSkip}
              importing={commit.isPending}
              onImport={() =>
                commit.mutate({
                  fileText: file.text,
                  fileName: file.name,
                  mapping: activeMapping,
                  headerRow: csvResult.headerRow ?? undefined,
                  skipRows,
                })
              }
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
