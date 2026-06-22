import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-95 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  ghost:
    "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
};

const baseClasses =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50";

type SharedButtonProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

type ButtonProps = SharedButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type LinkButtonProps = SharedButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export function Button(props: ButtonProps | LinkButtonProps) {
  const { children, className, variant = "primary", ...rest } = props;
  const classes = clsx(baseClasses, buttonClasses[variant], className);

  if ("href" in props && props.href) {
    return (
      <Link className={classes} href={props.href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
