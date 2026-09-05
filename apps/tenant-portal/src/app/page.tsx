import { getEnrichedSession } from "~/auth/server";
import { SignInButton } from "./_components/sign-in-button";
import { SignOutButton } from "./_components/sign-out-button";

export default async function HomePage() {
  const session = await getEnrichedSession();

  if (!session) {
    return (
      <main className="container flex h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Tenant portal
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in to view your home.
        </p>
        <SignInButton />
      </main>
    );
  }

  return (
    <main className="container flex h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Tenant portal</h1>
      <p className="text-lg">Signed in as {session.user.name}</p>
      <p className="text-muted-foreground text-sm">
        Resident features coming soon.
      </p>
      <SignOutButton />
    </main>
  );
}
