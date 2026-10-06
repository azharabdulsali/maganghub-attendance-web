"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Toast tersedia di seluruh aplikasi (login, dashboard, dll).
          `Toaster` (registry neobrutalism) merender provider + viewport
          sekaligus; `ToastProvider` saja tidak menampilkan apa pun. */}
      <Toaster>{children}</Toaster>
    </SessionProvider>
  );
}

