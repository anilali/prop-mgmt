"use client";

import { useRouter } from "next/navigation";

import { Button } from "@moonship/ui/button";

import { authClient } from "~/auth/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      size="lg"
      variant="outline"
      onClick={() => {
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
    </Button>
  );
}
