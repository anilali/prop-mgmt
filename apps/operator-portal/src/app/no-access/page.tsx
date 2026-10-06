import { redirect } from "next/navigation";

import { getRequestAccess } from "~/request-access";
import { SignOutButton } from "../_components/sign-out-button";

export default async function NoAccessPage() {
  const access = await getRequestAccess();
  if (!access) {
    redirect("/");
  }

  return (
    <main className="bg-ground bg-dot-grid grid min-h-dvh place-items-center px-4 py-10">
      <div className="bg-panel border-line animate-rise w-full max-w-[360px] rounded-[10px] border p-6">
        <h1 className="text-[15px] font-semibold">No access</h1>
        <p className="text-fg-2 mt-1 text-[12.5px]">
          Signed in as{" "}
          <span className="text-foreground font-medium">
            {access.operator.name}
          </span>
          . This Google account isn&apos;t on any property. Ask a property admin
          to add it, then sign in again.
        </p>
        <div className="mt-5 [&>button]:w-full">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
