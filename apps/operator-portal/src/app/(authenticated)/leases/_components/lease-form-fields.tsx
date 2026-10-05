"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@moonship/ui/button";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

import type {
  IncreaseMode,
  LeaseFormState,
  PoolEstimate,
  PoolOption,
  StepRow,
} from "../_lib/lease-form";
import { formatDate } from "../_lib/format";
import { addIncrease, newRowKey, withStartDate } from "../_lib/lease-form";

export function LeaseFormFields({
  value,
  onChange,
  pools,
  showMoveOut,
}: {
  value: LeaseFormState;
  onChange: Dispatch<SetStateAction<LeaseFormState>>;
  pools: readonly PoolOption[];
  showMoveOut: boolean;
}) {
  const [increaseDate, setIncreaseDate] = useState("");
  const [increaseMode, setIncreaseMode] = useState<IncreaseMode>("percent");
  const [increaseValue, setIncreaseValue] = useState("");

  const otherPoolIds = Object.keys(value.estimates).filter(
    (poolId) => !pools.some((pool) => pool.id === poolId),
  );
  const poolRows = [
    ...pools,
    ...otherPoolIds.map((id) => ({
      id,
      name: "A pool this unit is no longer in",
    })),
  ];

  const setRentStep = (key: string, patch: Partial<StepRow>) =>
    onChange((prev) => ({
      ...prev,
      rentSteps: prev.rentSteps.map((step) =>
        step.key === key ? { ...step, ...patch } : step,
      ),
    }));

  const setEstimate = (
    poolId: string,
    update: (estimate: PoolEstimate) => PoolEstimate,
  ) =>
    onChange((prev) => ({
      ...prev,
      estimates: {
        ...prev.estimates,
        [poolId]: update(prev.estimates[poolId] ?? { pays: false, steps: [] }),
      },
    }));

  const applyIncrease = () => {
    try {
      const rentSteps = addIncrease(
        value,
        increaseDate,
        increaseMode,
        increaseValue,
      );
      onChange((prev) => ({ ...prev, rentSteps }));
      setIncreaseDate("");
      setIncreaseValue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add increase");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Start date</Label>
          <Input
            type="date"
            value={value.startDate}
            onChange={(e) =>
              onChange((prev) => withStartDate(prev, e.target.value))
            }
            required
          />
        </div>
        <div className="space-y-1">
          <Label>End date</Label>
          <Input
            type="date"
            value={value.endDate}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, endDate: e.target.value }))
            }
            required
          />
        </div>
        {showMoveOut ? (
          <div className="space-y-1">
            <Label>Move-out date</Label>
            <Input
              type="date"
              value={value.moveOutDate}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, moveOutDate: e.target.value }))
              }
            />
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Base rent</h3>
        <div className="space-y-2">
          {value.rentSteps.map((step, index) => (
            <div
              key={step.key}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
            >
              {index === 0 ? (
                <div className="text-muted-foreground text-sm">
                  From the start
                  {value.startDate ? ` (${formatDate(value.startDate)})` : ""}
                </div>
              ) : (
                <Input
                  type="date"
                  aria-label="Starts on"
                  value={step.startsOn}
                  onChange={(e) =>
                    setRentStep(step.key, { startsOn: e.target.value })
                  }
                  required
                />
              )}
              <Input
                inputMode="decimal"
                aria-label="Monthly rent"
                placeholder="Monthly rent"
                value={step.amount}
                onChange={(e) =>
                  setRentStep(step.key, { amount: e.target.value })
                }
                required
              />
              {index === 0 ? (
                <div className="size-9" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove rent step"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      rentSteps: prev.rentSteps.filter(
                        (s) => s.key !== step.key,
                      ),
                    }))
                  }
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="bg-muted/40 grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label>Increase starts</Label>
            <Input
              type="date"
              value={increaseDate}
              onChange={(e) => setIncreaseDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>By</Label>
            <Select
              value={increaseMode}
              onValueChange={(mode) =>
                setIncreaseMode(mode === "amount" ? "amount" : "percent")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage</SelectItem>
                <SelectItem value="amount">New amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{increaseMode === "percent" ? "Percent" : "New rent"}</Label>
            <Input
              inputMode="decimal"
              placeholder={increaseMode === "percent" ? "3" : "0.00"}
              value={increaseValue}
              onChange={(e) => setIncreaseValue(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={applyIncrease}>
            Add increase
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Estimates</h3>
        {poolRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This unit is not in any pool.
          </p>
        ) : null}
        {poolRows.map((pool) => {
          const estimate = value.estimates[pool.id] ?? {
            pays: false,
            steps: [],
          };
          return (
            <div key={pool.id} className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={estimate.pays}
                  onChange={(e) => {
                    const pays = e.target.checked;
                    setEstimate(pool.id, (current) => ({
                      pays,
                      steps:
                        pays && current.steps.length === 0
                          ? [
                              {
                                key: newRowKey(),
                                startsOn: value.startDate,
                                amount: "",
                              },
                            ]
                          : current.steps,
                    }));
                  }}
                />
                Pays {pool.name}
              </label>
              {estimate.pays ? (
                <div className="space-y-2">
                  {estimate.steps.map((step) => (
                    <div
                      key={step.key}
                      className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                    >
                      <Input
                        type="date"
                        aria-label="Starts on"
                        value={step.startsOn}
                        onChange={(e) =>
                          setEstimate(pool.id, (current) => ({
                            ...current,
                            steps: current.steps.map((s) =>
                              s.key === step.key
                                ? { ...s, startsOn: e.target.value }
                                : s,
                            ),
                          }))
                        }
                        required
                      />
                      <Input
                        inputMode="decimal"
                        aria-label="Monthly estimate"
                        placeholder="Monthly estimate"
                        value={step.amount}
                        onChange={(e) =>
                          setEstimate(pool.id, (current) => ({
                            ...current,
                            steps: current.steps.map((s) =>
                              s.key === step.key
                                ? { ...s, amount: e.target.value }
                                : s,
                            ),
                          }))
                        }
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove estimate step"
                        onClick={() =>
                          setEstimate(pool.id, (current) => ({
                            ...current,
                            steps: current.steps.filter(
                              (s) => s.key !== step.key,
                            ),
                          }))
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEstimate(pool.id, (current) => ({
                        ...current,
                        steps: [
                          ...current.steps,
                          { key: newRowKey(), startsOn: "", amount: "" },
                        ],
                      }))
                    }
                  >
                    Add estimate step
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={value.hasLateFee}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, hasLateFee: e.target.checked }))
            }
          />
          Late fee
        </label>
        {value.hasLateFee ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={value.lateFeeAmount}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    lateFeeAmount: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Applies after day</Label>
              <Input
                type="number"
                min={1}
                max={27}
                value={value.lateFeeDay}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, lateFeeDay: e.target.value }))
                }
                required
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="space-y-1 sm:max-w-xs">
        <Label>Insurance certificate expires</Label>
        <Input
          type="date"
          value={value.insuranceExpiresOn}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              insuranceExpiresOn: e.target.value,
            }))
          }
        />
      </div>
    </div>
  );
}
