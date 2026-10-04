import { redirect } from "next/navigation";

import { getRequestAccess } from "~/request-access";
import { SignOutButton } from "../_components/sign-out-button";

export default async function NoAccessPage() {
  const access = await getRequestAccess();
  if (!access) {
    redirect("/");
  }

  return (
    <main className="container flex h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-extrabold tracking-tight">No access</h1>
      <p className="text-lg">Signed in as {access.operator.name}</p>
      <p className="text-muted-foreground text-center text-sm">
        This Google account does not have access to any property. Ask a property
        admin to grant access, then sign out and sign in again.
      </p>
      <SignOutButton />
    </main>
  );
}
