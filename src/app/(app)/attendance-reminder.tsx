"use client";

// src/app/(app)/attendance-reminder.tsx: popup pengingat "belum absen hari ini".
//
// Perilaku (sesuai kesepakatan dengan pemilik produk):
//   - Muncul HANYA di dalam aplikasi, saat halaman sedang terbuka.
//   - Klien mengecek status ke GET /api/reminder secara berkala (default ~45s).
//   - Bila user belum absen & sudah lewat jam yang diset admin & hari ini hari
//     kerja, popup tampil. Semua keputusan itu dihitung SERVER; komponen ini
//     hanya menampilkan `show` yang diterima — aturan tidak diduplikasi di sini.
//   - Bisa ditutup (dismiss) TAPI hanya sementara: setelah ~10 menit, jika
//     kondisinya masih "belum absen", popup muncul lagi. Ini memang disengaja
//     ("lebih nagging") agar user terdorong menyelesaikan absen.
//   - HANYA dirender setelah mount (cek pertama lewat efek) supaya tidak ada
//     mismatch hidrasi antara HTML server dan kondisi klien.
//
// Komponen ini TIDAK menyimpan apa pun ke server: "sedang ditutup" hanya state
// lokal + localStorage, jadi tidak perlu tabel tambahan.

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Interval cek status (ms). Cukup sering agar terasa "hidup", tak mengganggu. */
const CEK_INTERVAL_MS = 45_000;

/**
 * Lama popup "diam" setelah ditutup (ms). Setelah ini, bila user MASIH belum
 * absen, popup muncul lagi. Sesuai permintaan: dismiss hanya sementara.
 */
const DIAM_SETELAH_DITUTUP_MS = 10 * 60_000;

/** Kunci localStorage: menyimpan kapan terakhir user menutup popup (ms). */
const KUNCI_DITUTUP_SAMPAI = "reminder-belum-absen-ditutup-sampai";

/** Bentuk respons GET /api/reminder. */
interface StatusPengingat {
  show: boolean;
  scheduleLabel: string | null;
}

function AttendanceReminder() {
  const [perluTampil, setPerluTampil] = useState(false);
  const [labelJam, setLabelJam] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;

    /** Baca kapan terakhir popup ditutup dari localStorage. Aman bila gagal. */
    function bacaDiamSampai(): number {
      try {
        const tersimpan = window.localStorage.getItem(KUNCI_DITUTUP_SAMPAI);
        if (tersimpan) {
          const nilai = Number(tersimpan);
          if (Number.isFinite(nilai)) return nilai;
        }
      } catch {
        // Mode privat / storage diblokir: abaikan, popup tetap berfungsi.
      }
      return 0;
    }

    async function cek() {
      try {
        const res = await fetch("/api/reminder", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StatusPengingat;
        if (batal) return;
        const diam = bacaDiamSampai();
        setLabelJam(data.scheduleLabel);
        // Server bilang "tampilkan", tetapi bila user baru saja menutupnya
        // (< 10 menit), kita tahan dulu di sisi klien.
        setPerluTampil(data.show && Date.now() >= diam);
      } catch {
        // Jaringan gagal: jangan munculkan popup (lebih baik diam).
      }
    }

    cek();
    const id = window.setInterval(cek, CEK_INTERVAL_MS);
    return () => {
      batal = true;
      window.clearInterval(id);
    };
    // Efek hanya dijalankan sekali: pembacaan localStorage dilakukan di dalam
    // `cek` setiap siklus, jadi tidak perlu dependensi lain.
  }, []);

  const tutup = useCallback(() => {
    const sampai = Date.now() + DIAM_SETELAH_DITUTUP_MS;
    setPerluTampil(false);
    try {
      window.localStorage.setItem(KUNCI_DITUTUP_SAMPAI, String(sampai));
    } catch {
      // Gagal menyimpan: popup tetap tertutup untuk sesi ini (state lokal).
    }
  }, []);

  if (!perluTampil) return null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && tutup()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia aria-hidden="true">
            <BellRing />
          </AlertDialogMedia>
          <AlertDialogTitle>Kamu belum absen hari ini</AlertDialogTitle>
          <AlertDialogDescription>
            Absensi harianmu belum terkirim
            {labelJam ? ` padahal sudah lewat ${labelJam}` : ""}. Segera isi
            laporan harianmu dari halaman Beranda agar tidak terlewat.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction type="button" onClick={tutup}>
            Mengerti
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { AttendanceReminder };
