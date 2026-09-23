"use client";

import type { ReactNode } from "react";
import { BiIcon } from "components/BiIcon";

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  compact?: boolean;
}

/**
 * Reusable empty-state block: an illustration/icon, a clear title, an optional
 * supporting message and an optional call-to-action. Used whenever a search
 * returns no results or a creator gallery / collection is empty.
 */
export function EmptyState({ icon = "bi-inbox", title, subtitle, action, compact }: EmptyStateProps) {
  return (
    <div
      className="text-center w-full"
      style={{
        padding: compact ? "2.5rem 1rem" : "3.5rem 1rem",
        background: "var(--ap-card)",
        border: "1px solid var(--ap-border)",
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.06)",
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-circle mb-3"
        style={{
          width: 72,
          height: 72,
          background: "rgba(245,158,11,0.12)",
          border: "1px solid rgba(245,158,11,0.35)",
        }}
      >
        <BiIcon name={icon} style={{ fontSize: "1.9rem", color: "var(--ap-gold)" }} />
      </span>
      <h5 className="font-display font-bold mb-1" style={{ fontSize: compact ? "1.05rem" : "1.25rem", color: "var(--ap-card-foreground)" }}>
        {title}
      </h5>
      {subtitle && <p className="mb-3 mx-auto" style={{ maxWidth: 460, fontSize: "0.9rem", color: "var(--ap-muted)" }}>{subtitle}</p>}
      {action && <div className="flex justify-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}