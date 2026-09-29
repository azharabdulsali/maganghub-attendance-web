"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Toast tersedia di seluruh aplikasi (login, dashboard, dll). */}
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
