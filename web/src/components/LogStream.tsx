import { useEffect, useRef, useState } from 'react';
import { Empty } from './ui';
import { clock } from '../lib/format';
import type { LogEntry, LogLevel } from '../lib/types';

const LEVEL_STYLE: Record<LogLevel, { dot: string; text: string; label: string }> = {
  debug: { dot: 'bg-slate-700', text: 'text-slate-600', label: 'DEBUG' },
  info: { dot: 'bg-sky-500', text: 'text-slate-400', label: 'INFO' },
  success: { dot: 'bg-emerald-500', text: 'text-emerald-300', label: 'OK' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-300', label: 'WARN' },
  error: { dot: 'bg-rose-500', text: 'text-rose-300', label: 'FEHLER' },
  trade: { dot: 'bg-fuchsia-500', text: 'text-fuchsia-300', label: 'TRADE' },
};

export function LogStream({ logs }: { logs: LogEntry[] }) {
  const [filter, setFilter] = useState<'all' | 'trade' | 'problem'>('all');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const visible = logs.filter((entry) => {
    if (filter === 'trade') return entry.level === 'trade';
    if (filter === 'problem') return entry.level === 'warn' || entry.level === 'error';
    return entry.level !== 'debug';
  });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visible.length, autoScroll]);

  // Scrollt der Nutzer nach oben, wird das automatische Nachziehen pausiert.
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-5 py-2">
        {(
          [
            ['all', 'Alle'],
            ['trade', 'Trades'],
            ['problem', 'Probleme'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              filter === key ? 'bg-white/10 text-slate-200' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-700">{visible.length} Einträge</span>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-80 min-h-40 flex-1 overflow-y-auto px-5 py-2"
      >
        {visible.length === 0 ? (
          <Empty>Keine Einträge.</Empty>
        ) : (
          <div className="space-y-0.5">
            {visible.map((entry) => {
              const style = LEVEL_STYLE[entry.level];
              return (
                <div key={entry.id} className="slide-in flex items-start gap-2.5 py-0.5 text-[11px] leading-relaxed">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <span className="num shrink-0 text-slate-700">{clock(entry.ts)}</span>
                  <span className="w-16 shrink-0 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                    {entry.scope}
                  </span>
                  <span className={`min-w-0 flex-1 ${style.text}`}>{entry.message}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
