"use client";

import { useState } from "react";

import type { CsvMapping } from "@moonship/billing";
import { CSV_DATE_FORMATS } from "@moonship/billing";
import { Button } from "@moonship/ui/button";
import { Checkbox } from "@moonship/ui/checkbox";
import { Label } from "@moonship/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

type AmountMode = CsvMapping["amount"]["mode"];

const NO_ID = "__none";

function isDateFormat(value: string): value is CsvMapping["dateFormat"] {
  return CSV_DATE_FORMATS.some((format) => format === value);
}

function ColumnSelect({
  id,
  value,
  columns,
  onChange,
  noneLabel,
}: {
  id: string;
  value: string;
  columns: readonly string[];
  onChange: (value: string) => void;
  noneLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Pick a column" />
      </SelectTrigger>
      <SelectContent>
        {noneLabel ? <SelectItem value={NO_ID}>{noneLabel}</SelectItem> : null}
        {columns.map((column) => (
          <SelectItem key={column} value={column}>
            {column}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MappingForm({
  headers,
  initial,
  savedIdColumn,
  hasSavedMapping,
  pending,
  onPreview,
  onCancel,
}: {
  headers: readonly string[];
  initial: CsvMapping | null;
  savedIdColumn: string | null;
  hasSavedMapping: boolean;
  pending: boolean;
  onPreview: (mapping: CsvMapping) => void;
  onCancel: (() => void) | null;
}) {
  const columns = [
    ...new Set(headers.map((h) => h.trim()).filter((h) => h !== "")),
  ];
  const known = (column: string | null | undefined) =>
    column && columns.includes(column) ? column : "";

  const [dateColumn, setDateColumn] = useState(known(initial?.dateColumn));
  const [dateFormat, setDateFormat] = useState<CsvMapping["dateFormat"]>(
    initial?.dateFormat ?? "MM/DD/YYYY",
  );
  const [descriptionColumn, setDescriptionColumn] = useState(
    known(initial?.descriptionColumn),
  );
  const [mode, setMode] = useState<AmountMode>(
    initial?.amount.mode ?? "signed",
  );
  const [amountColumn, setAmountColumn] = useState(
    known(initial?.amount.mode === "signed" ? initial.amount.column : null),
  );
  const [flipSign, setFlipSign] = useState(
    initial?.amount.mode === "signed" ? initial.amount.flipSign : false,
  );
  const [debitColumn, setDebitColumn] = useState(
    known(
      initial?.amount.mode === "debitCredit"
        ? initial.amount.debitColumn
        : null,
    ),
  );
  const [creditColumn, setCreditColumn] = useState(
    known(
      initial?.amount.mode === "debitCredit"
        ? initial.amount.creditColumn
        : null,
    ),
  );
  const [idColumn, setIdColumn] = useState(known(initial?.idColumn) || NO_ID);

  const chosenId = idColumn === NO_ID ? null : idColumn;
  const idChanged = hasSavedMapping && chosenId !== savedIdColumn;
  const amountReady =
    mode === "signed"
      ? amountColumn !== ""
      : debitColumn !== "" && creditColumn !== "";
  const ready = dateColumn !== "" && descriptionColumn !== "" && amountReady;

  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onPreview({
          dateColumn,
          dateFormat,
          descriptionColumn,
          amount:
            mode === "signed"
              ? { mode, column: amountColumn, flipSign }
              : { mode, debitColumn, creditColumn },
          idColumn: chosenId,
        });
      }}
    >
      <div className="space-y-1">
        <h3 className="font-medium">Match the columns</h3>
        <p className="text-muted-foreground text-sm">
          Pick which column holds each value. The app remembers this for the
          next import.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="map-date">Date column</Label>
          <ColumnSelect
            id="map-date"
            value={dateColumn}
            columns={columns}
            onChange={setDateColumn}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="map-date-format">Date format</Label>
          <Select
            value={dateFormat}
            onValueChange={(value) => {
              if (isDateFormat(value)) setDateFormat(value);
            }}
          >
            <SelectTrigger id="map-date-format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CSV_DATE_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="map-description">Description column</Label>
          <ColumnSelect
            id="map-description"
            value={descriptionColumn}
            columns={columns}
            onChange={setDescriptionColumn}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="map-mode">Amount</Label>
          <Select
            value={mode}
            onValueChange={(value) => {
              if (value === "signed" || value === "debitCredit") setMode(value);
            }}
          >
            <SelectTrigger id="map-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="signed">One column, with a sign</SelectItem>
              <SelectItem value="debitCredit">
                Separate debit and credit columns
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === "signed" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="map-amount">Amount column</Label>
              <ColumnSelect
                id="map-amount"
                value={amountColumn}
                columns={columns}
                onChange={setAmountColumn}
              />
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <Checkbox
                id="map-flip"
                checked={flipSign}
                onCheckedChange={(checked) => setFlipSign(checked === true)}
              />
              <Label htmlFor="map-flip" className="font-normal">
                Flip the sign (the bank shows deposits as negative)
              </Label>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="map-debit">Debit column (money out)</Label>
              <ColumnSelect
                id="map-debit"
                value={debitColumn}
                columns={columns}
                onChange={setDebitColumn}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="map-credit">Credit column (money in)</Label>
              <ColumnSelect
                id="map-credit"
                value={creditColumn}
                columns={columns}
                onChange={setCreditColumn}
              />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="map-id">Transaction id column (optional)</Label>
          <ColumnSelect
            id="map-id"
            value={idColumn}
            columns={columns}
            onChange={setIdColumn}
            noneLabel="None"
          />
        </div>
      </div>
      {idChanged ? (
        <p className="text-destructive text-sm">
          The transaction id column is different from the one used before.
          Changing it can let duplicates in when this file overlaps earlier
          imports.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!ready || pending}>
          Preview
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
