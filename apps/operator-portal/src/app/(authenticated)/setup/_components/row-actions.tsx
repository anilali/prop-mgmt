import { Button } from "@moonship/ui/button";

export const HOVER_ACTION =
  "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100";

export function InlineConfirm({
  question,
  confirmLabel,
  pending,
  onKeep,
  onConfirm,
}: {
  question: string;
  confirmLabel: string;
  pending: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      <span className="text-fg-3 text-[11.5px]">{question}</span>
      <Button type="button" variant="outline" size="sm" onClick={onKeep}>
        Keep
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </span>
  );
}
