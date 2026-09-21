import { failureReason } from "@/lib/types";

export function FailureReason({ status, errorMessage }: { status: string; errorMessage: string | null }) {
  if (status !== "failed") return null;

  return (
    <p className="mt-1 max-w-[220px] text-xs text-error break-words">
      {failureReason(errorMessage)}
    </p>
  );
}
