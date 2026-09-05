import Link from "next/link";

import { Button } from "@moonship/ui/button";

import { getEnrichedSession } from "~/auth/server";
import { SignInButton } from "./_components/sign-in-button";
import { SignOutButton } from "./_components/sign-out-button";

export default async function HomePage() {
  const session = await getEnrichedSession();

  if (!session) {
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

  const isActiveStaff =
    !!session.staff && session.staff.status !== "deactivated";

  return (
    <main className="container flex h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Operator portal</h1>
      <p className="text-lg">Signed in as {session.user.name}</p>
      {isActiveStaff ? (
        <p className="text-muted-foreground text-sm">
          Role: {session.staff!.role} · {session.staff!.status}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Bootstrap the property to become admin, or wait for staff provisioning.
        </p>
      )}
      <Button asChild>
        <Link href="/property">Open dashboard</Link>
      </Button>
      <SignOutButton />
    </main>
  );
}
