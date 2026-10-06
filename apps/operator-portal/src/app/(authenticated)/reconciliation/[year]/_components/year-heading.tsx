import { StatusPill } from "@moonship/ui/status-pill";

import type { Workspace } from "../../_lib/reconciliation";
import {
  YEAR_STATUS_LABELS,
  YEAR_STATUS_VARIANTS,
} from "../../_lib/reconciliation";

export function YearHeading({ workspace }: { workspace: Workspace }) {
  return (
    <div className="animate-rise flex flex-wrap items-center gap-2">
      <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.015em]">
        {workspace.year} reconciliation
      </h1>
      <StatusPill variant={YEAR_STATUS_VARIANTS[workspace.status]}>
        {YEAR_STATUS_LABELS[workspace.status]}
      </StatusPill>
      {workspace.status === "draft" && workspace.isDryRun ? (
        <StatusPill variant="plain">Dry run</StatusPill>
      ) : null}
    </div>
  );
}
