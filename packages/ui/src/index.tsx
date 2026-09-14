import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function StatusPill({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "neutral" | "success" | "warning" | "danger" }>) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export function ActionButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`action-button ${className}`} {...props}>
      {children}
    </button>
  );
}

export function WorldLinkBrand({
  subtitle,
  className = "",
}: {
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`worldlink-brand ${className}`.trim()}>
      <img src="/worldlink-bank-logo.jpeg" alt="" aria-hidden="true" />
      <div>
        <strong>WorldLink Bank</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  );
}
