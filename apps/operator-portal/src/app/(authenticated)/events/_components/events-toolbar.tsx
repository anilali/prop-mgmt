"use client";

import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@moonship/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

export function EventsToolbar() {
  const [groupBy, setGroupBy] = useState("date");

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button type="button" variant="outline" size="sm">
          <Plus className="size-4" />
          Add Filter
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Group by Date</SelectItem>
            <SelectItem value="type">Group by Type</SelectItem>
            <SelectItem value="property">Group by Property</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm">
          <RefreshCw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
