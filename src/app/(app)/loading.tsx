import { Spinner } from "@/components/ui/button";

export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center text-muted">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
