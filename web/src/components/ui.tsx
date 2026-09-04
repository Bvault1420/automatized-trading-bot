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
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="card-title">
            {icon}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={`flex-1 ${bodyClassName || 'p-5'}`}>{children}</div>
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
    neutral: 'text-slate-100',
    good: 'text-emerald-400',
    bad: 'text-rose-400',
    accent: 'text-indigo-300',
  } as const;

  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        {icon && <span className="text-slate-600">{icon}</span>}
      </div>
      <div className={`num mt-1.5 text-2xl font-bold tracking-tight ${toneMap[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Bar({ value, tone = 'emerald' }: { value: number; tone?: 'emerald' | 'indigo' | 'amber' }) {
  const toneMap = {
    emerald: 'bg-emerald-500',
    indigo: 'bg-indigo-500',
    amber: 'bg-amber-500',
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${toneMap[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

/** Zweiseitiger Balken fuer Werte von -1 bis +1 (Signalstaerke). */
export function SignalBar({ score }: { score: number }) {
  const clamped = Math.max(-1, Math.min(1, score));
  const width = Math.abs(clamped) * 50;
  const positive = clamped >= 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
      <div
        className={`absolute top-0 h-full transition-all duration-500 ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={{ left: positive ? '50%' : `${50 - width}%`, width: `${width}%` }}
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 py-10 text-center">
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}

export function Chip({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'emerald' | 'rose' | 'amber' | 'indigo';
}) {
  const toneMap = {
    slate: 'border-white/10 bg-white/[0.04] text-slate-400',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    rose: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    indigo: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-300',
  } as const;
  return <span className={`chip ${toneMap[tone]}`}>{children}</span>;
}
