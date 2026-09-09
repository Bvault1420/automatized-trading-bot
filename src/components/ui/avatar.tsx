/* eslint-disable @next/next/no-img-element */
import { cn, gradientFor, initials } from "@/lib/utils";

export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, size / 2.6) };
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full object-cover bg-surface-2", className)}
        style={style}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
      style={{ ...style, background: gradientFor(name) }}
    >
      {initials(name)}
    </div>
  );
}
