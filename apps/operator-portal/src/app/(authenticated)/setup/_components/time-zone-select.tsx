"use client";

import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

export function TimeZoneSelect({
  id,
  value,
  onValueChange,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const zones = useMemo(() => {
    const supported = Intl.supportedValuesOf("timeZone");
    return supported.includes(value) ? supported : [value, ...supported];
  }, [value]);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {zones.map((zone) => (
          <SelectItem key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
