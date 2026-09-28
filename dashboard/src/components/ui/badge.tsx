import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        muted: "border-transparent bg-muted text-muted-foreground",
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/10 text-warning",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const RISK_VARIANT: Record<string, BadgeProps["variant"]> = { low: "success", medium: "warning", high: "destructive" };
export function RiskBadge({ tier }: { tier: string }) {
  return <Badge variant={RISK_VARIANT[tier] ?? "muted"} className="capitalize">{tier}</Badge>;
}

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  pending: "muted",
  calling: "default",
  completed: "success",
  escalated: "warning",
  failed: "destructive",
  refused: "destructive",
  declined: "destructive",
  pending_review: "warning",
  in_review: "default",
  approved: "success",
  rejected: "destructive",
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "muted"} className="capitalize">{status.replace(/_/g, " ")}</Badge>;
}
