import { cn } from "@moonship/ui";

export const inputClassName = cn(
  "border-line-2 bg-sunk text-foreground placeholder:text-fg-3 selection:bg-accent-soft h-[30px] w-full min-w-0 rounded-md border px-[9px] text-[13px] transition-[border-color,box-shadow] duration-150 outline-none",
  "file:text-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[12.5px] file:font-medium",
  "hover:border-line-3 focus-visible:border-accent-line focus-visible:ring-accent-soft focus-visible:ring-[3px]",
  "aria-invalid:border-red aria-invalid:ring-red-soft disabled:cursor-not-allowed disabled:opacity-50",
);

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputClassName, className)}
      {...props}
    />
  );
}
