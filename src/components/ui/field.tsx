import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-fg">
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, "appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ className, label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
      <input
        type="checkbox"
        className={cn("mt-0.5 h-4.5 w-4.5 shrink-0 rounded border-border bg-surface accent-accent", className)}
        {...props}
      />
      <span className="leading-snug text-muted">{label}</span>
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-300">
      {children}
    </p>
  );
}

export function FieldSuccess({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="mt-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-green-300">
      {children}
    </p>
  );
}
