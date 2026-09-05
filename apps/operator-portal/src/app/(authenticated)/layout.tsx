import { redirect } from "next/navigation";

import { getEnrichedSession } from "~/auth/server";
import { Sidebar } from "~/app/_components/sidebar";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getEnrichedSession();
  if (!session) {
    redirect("/");
  }

  const isActiveStaff =
    !!session.staff && session.staff.status !== "deactivated";

  return (
    <div className="bg-muted flex h-screen overflow-hidden">
      <Sidebar userName={session.user.name} isActiveStaff={isActiveStaff} />
      <div className="flex flex-1 flex-col gap-2 p-2">
        <div className="bg-background flex flex-1 flex-col overflow-auto rounded-xl border shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
