import { redirect } from "next/navigation";

import { getRequestAccess } from "~/request-access";
import { SignInButton } from "./_components/sign-in-button";

export default async function HomePage() {
  const access = await getRequestAccess();

  if (!access) {
    return (
      <main className="bg-ground bg-dot-grid grid min-h-dvh place-items-center px-4 py-10">
        <div className="bg-panel border-line animate-rise w-full max-w-[360px] rounded-[10px] border p-6">
          <h1 className="text-[15px] font-semibold">Operator portal</h1>
          <p className="text-fg-2 mt-1 text-[12.5px]">
            Sign in with the Google account your property admin added.
          </p>
          <div className="mt-5 [&>button]:w-full">
            <SignInButton />
          </div>
        </div>
      </main>
    );
  }

  if (access.context.mode === "property") {
    redirect("/home");
  }
  if (access.context.mode === "platform") {
    redirect("/platform/properties");
  }
  redirect("/no-access");
}
