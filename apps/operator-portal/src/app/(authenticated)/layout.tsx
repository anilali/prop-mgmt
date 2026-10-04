import { redirect } from "next/navigation";

import { Sidebar } from "~/app/_components/sidebar";
import { getRequestAccess } from "~/request-access";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getRequestAccess();
  if (!access) {
    redirect("/");
  }
  if (access.context.mode === "no-access") {
    redirect("/no-access");
  }

  return (
    <div className="bg-muted flex h-screen overflow-hidden">
      <Sidebar
        context={access.context}
        operableProperties={access.operableProperties}
        isPlatformAdmin={access.isPlatformAdmin}
        userName={access.operator.name}
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="bg-background flex flex-1 flex-col overflow-auto rounded-2xl border shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
