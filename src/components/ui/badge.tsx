import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      tone: {
        mute: "bg-paper-2 text-ink-soft",
        forest: "bg-forest text-forest-fg",
        exception: "bg-exception-soft text-exception",
        review: "bg-review-soft text-review",
        pass: "bg-pass-soft text-pass",
      },
    },
    defaultVariants: { tone: "mute" },
  },
);

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: Props) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
