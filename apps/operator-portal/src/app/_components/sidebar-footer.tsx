"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@moonship/ui/dropdown-menu";

import { authClient } from "~/auth/client";

export function SidebarFooter({ userName }: { userName: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left"
        >
          <span className="bg-background text-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {userName}
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
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
  );
}
