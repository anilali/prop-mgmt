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
import { ImportPreview } from "./import-preview";
import { MappingForm } from "./mapping-form";

const MAX_BYTES = 2 * 1024 * 1024;

interface LoadedFile {
  name: string;
  text: string;
}

function RawRows({ result }: { result: PreviewResult }) {
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
        csvText: loaded.text,
        mapping: options.mapping,
        headerRow: options.headerRow,
      },
      {
        onSuccess: (next) => {
          setResult(next);
          setHeaderRowText(
            next.headerRow === null ? "" : String(next.headerRow),
          );
          setSkipRows((current) =>
            current.filter((row) =>
              next.errors.some((error) => error.rowNumber === row),
            ),
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
      text: await selected.text(),
    };
    setFile(loaded);
    runPreview(loaded, { keepEditing: false });
  };

  const counts = result?.counts ?? null;
  const activeMapping =
    result?.mapping && result.mappingError === null ? result.mapping : null;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="csv-file">Bank CSV file</Label>
        <Input
          key={inputKey}
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="max-w-md"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">Up to 2 MB.</p>
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

      {file && result ? (
        <>
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-medium">Header row</h2>
              <p className="text-muted-foreground text-sm">
                {result.headerRow === null
                  ? "No row with column names was found. Enter the row number that has them."
                  : `Row ${result.headerRow} has the column names. Rows above it are ignored.`}
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
            <RawRows result={result} />
          </div>

          {result.mappingError ? (
            <p className="text-destructive text-sm">
              The saved column matching doesn&apos;t fit this file:{" "}
              {result.mappingError}. Match the columns again.
            </p>
          ) : null}

          {result.headerRow !== null && editingMapping ? (
            <MappingForm
              key={`${result.headerRow}-${result.headers.join("\u001f")}`}
              headers={result.headers}
              initial={result.mapping ?? savedMapping}
              savedIdColumn={savedMapping?.idColumn ?? null}
              hasSavedMapping={savedMapping !== null}
              pending={preview.isPending}
              onPreview={(mapping) =>
                runPreview(file, {
                  mapping,
                  headerRow: result.headerRow ?? undefined,
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
              result={result}
              counts={counts}
              skipRows={skipRows}
              onToggleSkip={(rowNumber, skip) =>
                setSkipRows((current) =>
                  skip
                    ? [...current.filter((row) => row !== rowNumber), rowNumber]
                    : current.filter((row) => row !== rowNumber),
                )
              }
              importing={commit.isPending}
              onImport={() =>
                commit.mutate({
                  csvText: file.text,
                  fileName: file.name,
                  mapping: activeMapping,
                  headerRow: result.headerRow ?? undefined,
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
