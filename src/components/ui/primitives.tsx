import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import Link from 'next/link';

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

// ---- Surfaces -------------------------------------------------------------

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Tag
      className={cx(
        'rounded-[var(--radius-card)] border bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 p-5 pb-0', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
        {children}
      </h2>
      {hint ? <span className="text-xs text-[var(--text-subtle)]">{hint}</span> : null}
    </div>
  );
}

// ---- Buttons --------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] border-transparent shadow-[var(--shadow-sm)]',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--bg-hover)] border-[var(--border-strong)]',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] border-transparent',
  danger: 'bg-transparent text-[var(--bad)] hover:bg-[var(--bad-soft)] border-[var(--border)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cx(
    'inline-flex items-center justify-center rounded-lg border font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

// ---- Form fields ----------------------------------------------------------

export const inputClass =
  'w-full rounded-lg border bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] ' +
  'placeholder:text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] ' +
  'focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]';

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium">
        {label}
        {optional ? (
          <span className="text-xs font-normal text-[var(--text-subtle)]">{optional}</span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
      {error ? <p className="text-xs text-[var(--bad)]">{error}</p> : null}
    </div>
  );
}

// ---- Feedback -------------------------------------------------------------

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'bg-[var(--bg-sunken)] text-[var(--text-muted)] border-[var(--border)]',
    warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
    danger: 'bg-[var(--bad-soft)] text-[var(--bad)] border-transparent',
    success: 'bg-[var(--ok-soft)] text-[var(--ok)] border-transparent',
  } as const;
  return (
    <div className={cx('rounded-lg border px-3.5 py-2.5 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed px-6 py-14 text-center">
      {icon ? <div className="mb-4 text-[var(--text-subtle)]">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {body ? (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--text-muted)]">{body}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'risk' | 'bad';
  className?: string;
  title?: string;
}) {
  const tones = {
    neutral: 'bg-[var(--bg-sunken)] text-[var(--text-muted)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent-text)]',
    ok: 'bg-[var(--ok-soft)] text-[var(--ok)]',
    warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
    risk: 'bg-[var(--risk-soft)] text-[var(--risk)]',
    bad: 'bg-[var(--bad-soft)] text-[var(--bad)]',
  } as const;
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'ok' | 'warn' | 'risk' | 'bad';
}) {
  const colors = {
    ok: 'text-[var(--ok)]',
    warn: 'text-[var(--warn)]',
    risk: 'text-[var(--risk)]',
    bad: 'text-[var(--bad)]',
  } as const;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
        {label}
      </div>
      <div className={cx('tabular mt-1 text-2xl font-semibold', tone && colors[tone])}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-[var(--text-muted)]">{sub}</div> : null}
    </div>
  );
}
