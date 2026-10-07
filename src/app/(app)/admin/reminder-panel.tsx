"use client";

// src/app/(app)/admin/reminder-panel.tsx: setelan pengingat "belum absen" (ADMIN).
//
// Admin menentukan JAM & MENIT kapan popup peringatan mulai muncul ke semua
// pengguna yang belum absen hari ini, serta saklar on/off-nya. Popup-nya sendiri
// dipasang di layout aplikasi (attendance-reminder.tsx); di sini hanya
// setelannya.
//
// Komponen ini TIDAK menyimpan apa pun secara lokal: nilai awal datang dari
// server (prop), dan tombol simpan menembak PUT /api/reminder (admin-only di
// server). Validasi ganda: klien memeriksa bentuk, server memutuskan.

import * as React from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { ReminderSettingView } from "@/lib/reminder-policy";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function ReminderPanel({
  initial,
}: Readonly<{ initial: ReminderSettingView }>) {
  const toast = useToast();
  const [enabled, setEnabled] = React.useState(initial.isEnabled);
  // Satu nilai waktu "HH:MM" (dari <input type="time">), sama seperti
  // automation-form.tsx. `hour`/`minute` diturunkan dari sini saat menghitung
  // dan saat mengirim, sehingga kontrak PUT /api/reminder (hour + minute) tak
  // berubah.
  const [time, setTime] = React.useState(
    `${pad(initial.hour)}:${pad(initial.minute)}`,
  );
  const [busy, setBusy] = React.useState(false);

  // Turunkan jam/menit dari "HH:MM". Bila nilai belum lengkap, hasilnya NaN
  // dan pemakai di bawah menanganinya sebagai "tidak sah".
  const hour = Number(time.split(":")[0] ?? "");
  const minute = Number(time.split(":")[1] ?? "");
  const waktuSah = Number.isInteger(hour) && Number.isInteger(minute);

  async function simpan() {
    if (!waktuSah) {
      toast.error("Jam tidak sah", "Pilih jam dan menit dulu.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reminder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: enabled, hour, minute }),
      });
      const data = (await res.json()) as
        | { ok: true; setting: ReminderSettingView }
        | { error?: string };
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "Permintaan gagal.";
        toast.error("Tidak bisa menyimpan", msg);
        return;
      }
      toast.success(
        "Setelan pengingat disimpan",
        enabled
          ? `Pengingat aktif mulai ${pad(hour)}:${pad(minute)} WIB.`
          : "Pengingat dimatikan.",
      );
    } catch {
      toast.error("Tidak bisa menyimpan", "Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader>
        <CardTitle>Pengingat absen harian</CardTitle>
        <CardDescription>
          Menampilkan popup peringatan di dalam aplikasi kepada pengguna yang{" "}
          <strong>belum absen</strong> pada hari kerja, mulai jam yang ditentukan
          di bawah (WIB). Popup hanya muncul selama halaman aplikasi terbuka —
          tidak dikirim lewat email atau WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="reminder-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="reminder-enabled" className="cursor-pointer">
            {enabled ? "Aktif" : "Nonaktif"}
          </Label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 sm:max-w-xs">
            <Label htmlFor="reminder-time">Jam pengingat (WIB)</Label>
            <Input
              id="reminder-time"
              type="time"
              step="60"
              value={time}
              disabled={!enabled}
              onChange={(e) => setTime(e.target.value)}
              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </div>

          <Button
            onClick={simpan}
            disabled={busy || !waktuSah}
            variant="success"
            title={waktuSah ? "Simpan" : "Jam tidak sah"}
          >
            {busy ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Menyimpan…
              </>
            ) : (
              <>
                <Save aria-hidden />
                Simpan
              </>
            )}
          </Button>
        </div>

        <p className="text-sm text-foreground/70">
          {!waktuSah ? (
            "Jam tidak sah."
          ) : (
            <>
              Ringkasan: pengingat{" "}
              <strong>{enabled ? "aktif" : "nonaktif"}</strong>
              {enabled ? (
                <>
                  , mulai <strong>{pad(hour)}:{pad(minute)} WIB</strong> sampai
                  tengah malam, hanya pada hari kerja.
                </>
              ) : (
                "."
              )}
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
