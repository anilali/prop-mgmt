"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterOutputs } from "@moonship/api-operator";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

import { useTRPC } from "~/trpc/react";

type UnitView = RouterOutputs["unit"]["list"][number];
type UtilityType = "electric" | "gas" | "water" | "sewer" | "trash";

const UTILITY_TYPES: UtilityType[] = [
  "electric",
  "gas",
  "water",
  "sewer",
  "trash",
];

type UtilityRow =
  | { type: UtilityType; kind: "individual" }
  | { type: UtilityType; kind: "shares"; withUnitId: string };

export function UnitDialog({
  open,
  onOpenChange,
  mode,
  unit,
  units,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  unit?: UnitView;
  units: UnitView[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [sqft, setSqft] = useState("800");
  const [override, setOverride] = useState(false);
  const [street1, setStreet1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [utilities, setUtilities] = useState<UtilityRow[]>(
    UTILITY_TYPES.map((type) => ({ type, kind: "individual" as const })),
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && unit) {
      setLabel(unit.label);
      setSqft(String(unit.sqft));
      setOverride(!!unit.addressOverride);
      setStreet1(unit.addressOverride?.street1 ?? "");
      setCity(unit.addressOverride?.city ?? "");
      setState(unit.addressOverride?.state ?? "");
      setPostalCode(unit.addressOverride?.postalCode ?? "");
      setCountry(unit.addressOverride?.country ?? "US");
      const byType = new Map(unit.utilities.map((u) => [u.type, u]));
      setUtilities(
        UTILITY_TYPES.map((type) => {
          const existing = byType.get(type);
          if (existing?.kind === "shares") {
            return {
              type,
              kind: "shares" as const,
              withUnitId: existing.withUnitId,
            };
          }
          return { type, kind: "individual" as const };
        }),
      );
    } else {
      setLabel("");
      setSqft("800");
      setOverride(false);
      setUtilities(
        UTILITY_TYPES.map((type) => ({ type, kind: "individual" as const })),
      );
    }
  }, [open, mode, unit]);

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.unit.list.queryFilter());
  };

  const create = useMutation(
    trpc.unit.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Unit created");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const update = useMutation(
    trpc.unit.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Unit updated");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const otherUnits = units.filter((u) => u.id !== unit?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add unit" : "Edit unit"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const payload = {
              label,
              sqft: Number(sqft),
              addressOverride: override
                ? { street1, city, state, postalCode, country }
                : null,
              utilities,
            };
            if (mode === "create") {
              create.mutate(payload);
            } else if (unit) {
              update.mutate({ id: unit.id, ...payload });
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Sqft</Label>
              <Input
                type="number"
                min={1}
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Override property address
          </label>
          {override ? (
            <div className="grid gap-2">
              <Input
                placeholder="Street"
                value={street1}
                onChange={(e) => setStreet1(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
                <Input
                  placeholder="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Postal"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  required
                />
                <Input
                  placeholder="Country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Utilities</Label>
            {utilities.map((row, idx) => (
              <div key={row.type} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                <div className="flex items-center text-sm capitalize">
                  {row.type}
                </div>
                <Select
                  value={row.kind}
                  onValueChange={(value) => {
                    setUtilities((prev) =>
                      prev.map((u, i) =>
                        i === idx
                          ? value === "individual"
                            ? { type: u.type, kind: "individual" }
                            : {
                                type: u.type,
                                kind: "shares",
                                withUnitId: otherUnits[0]?.id ?? "",
                              }
                          : u,
                      ),
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Own meter</SelectItem>
                    <SelectItem value="shares">Shares with unit</SelectItem>
                  </SelectContent>
                </Select>
                {row.kind === "shares" ? (
                  <Select
                    value={row.withUnitId}
                    onValueChange={(value) => {
                      setUtilities((prev) =>
                        prev.map((u, i) =>
                          i === idx && u.kind === "shares"
                            ? { ...u, withUnitId: value }
                            : u,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherUnits.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
