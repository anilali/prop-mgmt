import { redirect } from "next/navigation";

import { getRequestAccess } from "~/request-access";
import { SignInButton } from "./_components/sign-in-button";

export default async function HomePage() {
  const access = await getRequestAccess();

  if (!access) {
    return (
      <main className="container flex h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Operator portal
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in to manage your property.
        </p>
        <SignInButton />
      </main>
    );
  }

  if (access.context.mode === "property") {
    redirect("/property");
  }
  if (access.context.mode === "platform") {
    redirect("/platform/properties");
  }
  redirect("/no-access");
}
