import { Money } from "@moonship/ui/money";

export function Amount({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  return (
    <Money
      cents={cents}
      sign
      tone={cents > 0 ? "green" : "default"}
      className={className}
    />
  );
}
