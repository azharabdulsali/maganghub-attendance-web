"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/admin";

/**
 * Notifikasi singkat di sudut layar untuk mengumumkan hasil sebuah aksi
 * ("Template tersimpan", "Template dihapus", "Gagal menghapus").
 *
 * Kenapa perlu: banyak form berisi tombol di bagian bawah, sementara pesan
 * suksesnya muncul di atas, pengguna yang sudah menggulir ke bawah tidak
 * melihatnya. Toast selalu muncul di tempat yang sama, jadi hasil aksi tidak
 * pernah "hilang".
 *
 * Toast TIDAK menggantikan `<Message>` inline: pesan yang perlu dibaca sambil
 * memperbaiki isian (mis. "nama minimal 3 karakter") tetap inline. Toast untuk
 * hasil akhir yang tidak perlu ditindaklanjuti.
 *
 * Semua nada memakai kunci `Tone` yang sama dengan `<Badge>`/`<Message>`.
 */

const TONE_CLASS: Record<Tone, string> = {
  good: "bg-main text-main-foreground",
  bad: "bg-background text-foreground border-destructive",
  neutral: "bg-background text-foreground",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          className="pb-safe pr-safe fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return (
    <>
      {toasts.map((toast) => {
        const tone = (toast.data as { tone?: Tone } | undefined)?.tone ?? "neutral";
        return (
          <ToastPrimitive.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "rounded-base border-2 border-border px-4 py-3 text-sm shadow-shadow",
              // Badge/Message memakai peta yang sama; kelasnya sengaja identik
              // supaya warna toast tidak pernah berbeda dari kotak pesan.
              TONE_CLASS[tone],
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <ToastPrimitive.Title className="font-heading">
                  {toast.title}
                </ToastPrimitive.Title>
                {toast.description ? (
                  <ToastPrimitive.Description className="mt-0.5 text-foreground/80">
                    {toast.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Tutup notifikasi"
                className="shrink-0 font-heading underline underline-offset-2"
              >
                Tutup
              </ToastPrimitive.Close>
            </div>
          </ToastPrimitive.Root>
        );
      })}
    </>
  );
}

/**
 * Pintasan untuk memunculkan toast dari komponen mana pun di dalam provider.
 *
 *   const toast = useToast();
 *   toast.success("Template tersimpan");
 *   toast.error("Gagal menghapus", "Coba lagi sebentar.");
 */
export function useToast() {
  const manager = ToastPrimitive.useToastManager();
  return React.useMemo(
    () => ({
      show: (
        tone: Tone,
        title: string,
        description?: string,
      ) =>
        manager.add({
          title,
          description,
          data: { tone },
        }),
      success: (title: string, description?: string) =>
        manager.add({ title, description, data: { tone: "good" satisfies Tone } }),
      error: (title: string, description?: string) =>
        manager.add({ title, description, data: { tone: "bad" satisfies Tone } }),
      info: (title: string, description?: string) =>
        manager.add({ title, description, data: { tone: "neutral" satisfies Tone } }),
    }),
    [manager],
  );
}

export { TONE_CLASS as TOAST_TONE_CLASS };
