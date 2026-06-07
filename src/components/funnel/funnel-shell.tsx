import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

type FunnelShellProps = {
  children: ReactNode;
  className?: string;
  showBrand?: boolean;
  topSlot?: ReactNode;
};

export function FunnelShell({ children, className, showBrand = true, topSlot }: FunnelShellProps) {
  return (
    <main className={["funnel-shell", className].filter(Boolean).join(" ")} dir="rtl">
      <div className="funnel-shell__inner">
        {topSlot ?? (showBrand ? (
          <Link className="funnel-brand-link" href="/" aria-label="LOVLOV.ME">
            <Wordmark size={24} />
          </Link>
        ) : null)}
        {children}
      </div>
    </main>
  );
}

type FunnelCardProps = ComponentPropsWithoutRef<"section"> & {
  children: ReactNode;
  tone?: "default" | "soft";
};

export function FunnelCard({ children, className, tone = "default", ...props }: FunnelCardProps) {
  return (
    <section className={["funnel-card", tone === "soft" ? "funnel-card--soft" : "", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </section>
  );
}

type FunnelButtonProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
  variant?: "primary" | "secondary";
};

export function FunnelButton({ href, className, variant = "primary", children, ...props }: FunnelButtonProps) {
  return (
    <Link
      className={[
        "funnel-button",
        variant === "secondary" ? "funnel-button--secondary" : "funnel-button--primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      href={href}
      {...props}
    >
      {children}
    </Link>
  );
}
