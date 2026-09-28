"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="neutral"
      size="sm"
      onClick={async () => {
        setLoading(true);
        await signOut({ callbackUrl: "/login" });
      }}
      disabled={loading}
    >
      {loading ? "Keluar..." : "Keluar"}
    </Button>
  );
}