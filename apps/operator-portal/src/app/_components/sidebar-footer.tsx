"use client";

import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@moonship/ui/dropdown-menu";
import { ThemeToggle } from "@moonship/ui/theme";

import { authClient } from "~/auth/client";

const ROLE_LABELS = { admin: "Admin", staff: "Staff" } as const;

export function SidebarFooter({
  userName,
  role,
}: {
  userName: string;
  role?: "admin" | "staff";
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 px-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-hover flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors"
          >
            <span className="bg-accent-soft text-primary border-accent-line grid size-[22px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold">
              {userName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[12.5px] font-medium">
                {userName}
              </b>
              {role ? (
                <span className="text-fg-3 block text-[11px]">
                  {ROLE_LABELS[role]}
                </span>
              ) : null}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-52">
          <DropdownMenuItem
            onSelect={() => {
              void authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                    router.refresh();
                  },
                },
              });
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeToggle variant="ghost" side="top" />
    </div>
  );
}
