import type { ReactNode } from 'react';

export function Card({
  title,
  icon,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card flex flex-col overflow-hidden ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-2.5 sm:px-5">
          <h2 className="card-title">
            {icon}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={`flex-1 ${bodyClassName || 'p-4 sm:p-5'}`}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'accent';
  icon?: ReactNode;
}) {
  const toneMap = {
    neutral: 'text-zinc-100',
    good: 'text-positive',
    bad: 'text-negative',
    accent: 'text-accent',
  } as const;

  return (
    <div className="card px-3.5 py-3 sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-500">{label}</span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <div className={`num mt-1 text-lg font-semibold tracking-tight sm:text-xl ${toneMap[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] leading-snug text-zinc-500">{sub}</div>}
    </div>
  );
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'positive' | 'amber' }) {
  const toneMap = {
    accent: 'bg-accent',
    positive: 'bg-positive',
    amber: 'bg-amber-500',
  } as const;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className={`h-full rounded-full transition-all duration-500 ${toneMap[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function SignalBar({ score }: { score: number }) {
  const clamped = Math.max(-1, Math.min(1, score));
  const width = Math.abs(clamped) * 50;
  const positive = clamped >= 0;
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
      <div
        className={`absolute top-0 h-full transition-all duration-500 ${positive ? 'bg-positive' : 'bg-negative'}`}
        style={{ left: positive ? '50%' : `${50 - width}%`, width: `${width}%` }}
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1 py-8 text-center">
      <p className="text-xs text-zinc-500">{children}</p>
    </div>
  );
}

export function Chip({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'positive' | 'negative' | 'amber' | 'accent';
}) {
  const toneMap = {
    slate: 'border-border bg-surface-2 text-zinc-400',
    positive: 'border-positive/30 bg-positive/10 text-positive',
    negative: 'border-negative/30 bg-negative/10 text-negative',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    accent: 'border-accent/30 bg-accent/10 text-accent',
  } as const;
  return <span className={`chip ${toneMap[tone]}`}>{children}</span>;
}
