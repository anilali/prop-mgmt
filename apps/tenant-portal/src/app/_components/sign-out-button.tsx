"use client";

import { Button } from "@moonship/ui/button";

import { authClient } from "~/auth/client";

export function SignOutButton() {
  return (
    <Button
      size="lg"
      variant="outline"
      onClick={() => {
        void authClient.signOut();
      }}
    >
      Sign out
    </Button>
  );
}
