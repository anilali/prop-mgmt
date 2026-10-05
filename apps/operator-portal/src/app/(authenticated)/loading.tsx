import { LoaderCircle } from "lucide-react";

export default function AuthenticatedLoading() {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 p-6 text-sm">
      <LoaderCircle className="size-4 animate-spin" />
      Loading
    </div>
  );
}
