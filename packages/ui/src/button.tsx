import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";

import { cn } from "@moonship/ui";

export const buttonVariants = cva(
  "focus-visible:border-accent-line focus-visible:ring-accent-soft aria-invalid:border-red aria-invalid:ring-red-soft inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium whitespace-nowrap transition-[border-color,background-color,color,filter,transform] duration-150 outline-none focus-visible:ring-[3px] active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-transparent hover:brightness-110 disabled:hover:brightness-100",
        primary:
          "bg-primary text-primary-foreground border-transparent hover:brightness-110 disabled:hover:brightness-100",
        outline:
          "border-line-2 bg-raised text-foreground hover:border-line-3 disabled:hover:border-line-2",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent",
        ghost:
          "text-fg-2 hover:bg-hover hover:text-foreground border-transparent bg-transparent",
        destructive:
          "border-line-2 bg-raised text-red hover:border-red/40 hover:bg-red-soft disabled:hover:border-line-2",
        link: "text-primary border-transparent underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        default: "h-7 px-2.5",
        sm: "h-6 gap-1 px-2 text-[12px]",
        lg: "h-8 px-3.5 text-[13px]",
        icon: "size-7 px-0",
        "icon-sm": "size-6 px-0",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
