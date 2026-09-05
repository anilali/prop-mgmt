"use client";

import { Button } from "@moonship/ui/button";

import { authClient } from "~/auth/client";

export function SignInButton() {
  return (
    <Button
      size="lg"
      onClick={() => {
        void authClient.signIn.social({ provider: "google" });
      }}
    >
      Sign in with Google
    </Button>
  );
}
