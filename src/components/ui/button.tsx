import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[opacity,transform,background-color,color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:pointer-events-none disabled:opacity-40 active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        primary: "bg-forest text-forest-fg hover:bg-forest-2",
        secondary: "bg-paper-2 text-ink shadow-[var(--shadow-border)] hover:bg-paper-3",
        ghost: "bg-transparent text-ink-soft hover:bg-paper-2 hover:text-ink",
        danger: "bg-exception text-paper hover:opacity-90",
      },
      size: {
        sm: "h-11 rounded-sm px-3 text-sm",
        md: "h-11 rounded-md px-4 text-sm",
        lg: "h-12 rounded-md px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
