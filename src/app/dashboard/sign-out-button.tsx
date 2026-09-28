"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      onClick={async () => {
        setLoading(true);
        await signOut({ callbackUrl: "/login" });
      }}
      disabled={loading}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
    >
      {loading ? "Keluar..." : "Keluar"}
    </button>
  );
}
