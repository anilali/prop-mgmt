import { redirect } from "next/navigation";

import { MobileSidebar, Sidebar } from "~/app/_components/sidebar";
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

  const sidebarProps = {
    context: access.context,
    operableProperties: access.operableProperties,
    isPlatformAdmin: access.isPlatformAdmin,
    userName: access.operator.name,
  };

  return (
    <div className="bg-muted flex h-screen overflow-hidden">
      <Sidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col p-2 md:p-4">
        <MobileSidebar {...sidebarProps} />
        <div className="bg-background flex min-h-0 flex-1 flex-col overflow-auto rounded-2xl border shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
