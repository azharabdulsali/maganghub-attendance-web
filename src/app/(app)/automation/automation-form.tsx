"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeNextRun, formatSchedule } from "@/lib/automation";

type Props = {
  hasExisting: boolean;
  initialEnabled: boolean;
  initialHour: number;
  initialMinute: number;
  initialWebhookKey: string | null;
};

export default function AutomationForm({
  hasExisting,
  initialEnabled,
  initialHour,
  initialMinute,
  initialWebhookKey,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  // Ref ke <form> asli: tombol Simpan tidak lagi `type="submit"` (ia membuka
  // dialog dulu). Setelah dikonfirmasi kita panggil `requestSubmit()` supaya
  // jalur submit tetap jalur bawaan form — sama seperti sign-out-button.tsx.
  const formRef = useRef<HTMLFormElement>(null);

  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(String(initialHour));
  const [minute, setMinute] = useState(String(initialMinute));
  const [webhookKey, setWebhookKey] = useState<string | null>(initialWebhookKey);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  // Dua dialog konfirmasi: satu untuk menyimpan pengaturan, satu untuk
  // mengganti kunci webhook (aksi destruktif). Dipisah agar pesannya bisa
  // spesifik — konfirmasi yang generik membuat orang menekan "Ya" tanpa baca.
  const [konfirmasiSimpan, setKonfirmasiSimpan] = useState(false);
  const [konfirmasiRotasi, setKonfirmasiRotasi] = useState(false);

  // Pratinjau "jadwal berikutnya" dihitung klien memakai helper murni yang
  // sama dengan server, hanya untuk tampilan, bukan logika penentu.
  const nextRun = useMemo(() => {
    const h = Number(hour);
    const m = Number(minute);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    return describeNextRun(new Date(), h, m);
  }, [hour, minute]);

  // URL lengkap cara lama (`?key=`): DIPERTAHANKAN sementara untuk cron yang
  // sudah terpasang, tetapi ditandai deprecated di UI (dihapus 1 Jan 2026).
  const webhookUrl = webhookKey
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/cron/submit?key=${webhookKey}`
    : null;

  // URL dasar cara DIANJURKAN: tanpa rahasia di query; kunci dikirim lewat
  // header `Authorization: Bearer`.
  const webhookBaseUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/cron/submit` : null;

  // Contoh perintah siap tempel untuk crontab/server sendiri (header = aman).
  const curlSnippet =
    webhookBaseUrl && webhookKey
      ? `curl -sS -o /dev/null -H "Authorization: Bearer ${webhookKey}" "${webhookBaseUrl}"`
      : null;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled,
          hour: Number(hour),
          minute: Number(minute),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        webhookKey?: string;
        error?: string;
      };

      if (!res.ok) {
        const pesan = data.error ?? "Gagal menyimpan pengaturan.";
        setError(pesan);
        toast.error("Gagal menyimpan otomasi", pesan);
        return;
      }

      if (data.webhookKey) setWebhookKey(data.webhookKey);
      setSukses("Pengaturan otomasi tersimpan.");
      toast.success(
        "Otomasi tersimpan",
        isEnabled
          ? "Absensi otomatis akan dikirim sesuai jadwal."
          : "Sementara dimatikan, tidak ada pengiriman otomatis.",
      );
      router.refresh();
    } catch {
      const pesan = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(pesan);
      toast.error("Gagal menyimpan otomasi", pesan);
    } finally {
      setLoading(false);
    }
  }

  async function salinUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setTersalin(true);
      toast.success("URL webhook tersalin", "Tempel ke layanan cron Anda.");
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      const pesan = "Tidak bisa menyalin otomatis. Salin tautan secara manual.";
      setError(pesan);
      toast.error("Gagal menyalin URL", pesan);
    }
  }

  /** Salin teks apa pun (URL dasar / perintah curl) ke papan klip. */
  async function salinTeks(teks: string | null, label: string) {
    if (!teks) return;
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(`${label} tersalin`, "Tempel ke layanan cron Anda.");
    } catch {
      const pesan = "Tidak bisa menyalin otomatis. Salin secara manual.";
      setError(pesan);
      toast.error("Gagal menyalin", pesan);
    }
  }

  /**
   * Buka konfirmasi rotasi kunci. Dulu di sini ada `window.confirm`, yang
   * dilarang SPEC.md §466 (memblokir tab, tak bisa memuat konteks). Sekarang
   * informasinya dibawa <ConfirmDialog> di bawah, dan kerja sebenarnya ada di
   * `eksekusiRotasiKunci`.
   */
  function rotasiKunci() {
    // Mengganti kunci langsung mematikan cron yang sudah terpasang sampai URL
    // baru dipasang. Ini tindakan destruktif, jadi wajib konfirmasi sadar.
    setKonfirmasiRotasi(true);
  }

  async function eksekusiRotasiKunci() {
    setError(null);
    setSukses(null);
    setLoading(true);
    try {
      const res = await fetch("/api/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled,
          hour: Number(hour),
          minute: Number(minute),
          action: "rotate-key",
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        webhookKey?: string;
        error?: string;
      };

      if (!res.ok || !data.webhookKey) {
        const pesan = data.error ?? "Gagal mengganti kunci webhook.";
        setError(pesan);
        toast.error("Gagal mengganti kunci", pesan);
        return;
      }

      setWebhookKey(data.webhookKey);
      setSukses("Kunci webhook diganti. Salin URL baru ke layanan cron Anda.");
      toast.success(
        "Kunci webhook diganti",
        "Salin URL baru ke layanan cron Anda sekarang.",
      );
      router.refresh();
    } catch {
      const pesan = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(pesan);
      toast.error("Gagal mengganti kunci", pesan);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jadwal harian</CardTitle>
          <CardDescription>
            Layanan cron akan menembak webhook pada jam ini setiap hari.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={simpan} className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Switch
                id="isEnabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
                aria-describedby="isEnabled-hint"
              />
              <Label htmlFor="isEnabled" className="cursor-pointer">
                Aktifkan otomasi
              </Label>
            </div>
            <p id="isEnabled-hint" className="text-xs text-foreground/60">
              {isEnabled
                ? "Otomasi aktif: cron akan mengirim absensi sesuai jadwal di bawah."
                : "Otomasi nonaktif: tidak ada pengiriman otomatis, walau cron tetap menembak webhook."}
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="hour">Jam (0–23)</Label>
                <Input
                  id="hour"
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => setHour(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minute">Menit (0–59)</Label>
                <Input
                  id="minute"
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  className="w-24"
                />
              </div>
              <p className="text-sm text-foreground/70">
                {nextRun ? `Berikutnya: ${nextRun}` : "Jam/menit tidak sah."}
              </p>
            </div>

            {/* Tombol ini TIDAK type="submit": ia membuka dialog dulu. Setelah
                dikonfirmasi, dialog memanggil formRef.requestSubmit() sehingga
                jalur submit tetap jalur bawaan form (bukan fetch manual). */}
            <Button
              type="button"
              onClick={() => setKonfirmasiSimpan(true)}
              disabled={loading}
            >
              {loading ? "Menyimpan..." : hasExisting ? "Simpan perubahan" : "Aktifkan"}
            </Button>

            {error && <Message tone="bad">{error}</Message>}
            {sukses && <Message tone="good">{sukses}</Message>}
          </form>
        </CardContent>
      </Card>

      {webhookUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook untuk cron</CardTitle>
            <CardDescription>
              Sambungkan layanan cron Anda (mis. cron-job.org) ke endpoint ini,
              jadwalkan sekali sehari. <strong>Cara dianjurkan:</strong> kirim
              kunci lewat header, bukan di URL. Jangan bagikan kunci, siapa pun
              yang tahu bisa memicu pengiriman.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cara DIANJURKAN: kunci lewat header, URL bersih tanpa rahasia. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Cara dianjurkan (kunci lewat header)
              </p>
              <p className="text-xs text-foreground/60">
                Endpoint:
              </p>
              <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                {webhookBaseUrl}
              </code>
              <p className="text-xs text-foreground/60">Header:</p>
              <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                Authorization: Bearer {webhookKey}
              </code>
              {curlSnippet && (
                <>
                  <p className="text-xs text-foreground/60">
                    Contoh perintah (crontab/server sendiri):
                  </p>
                  <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                    {curlSnippet}
                  </code>
                  <Button
                    variant="neutral"
                    size="sm"
                    type="button"
                    onClick={() => salinTeks(curlSnippet, "Perintah")}
                  >
                    Salin perintah
                  </Button>
                </>
              )}
            </div>

            {/* Cara LAMA: dipertahankan sementara, ditandai deprecated. */}
            <div className="space-y-2 rounded-base border-2 border-dashed border-border p-3">
              <p className="text-sm font-medium">
                Cara lama (akan dihapus)
              </p>
              <p className="text-xs text-foreground/60">
                Menempel kunci di URL masih berfungsi sampai{" "}
                <strong>1 Januari 2026</strong>, lalu dihapus. Hindari untuk
                pemasangan baru.
              </p>
              <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                {webhookUrl}
              </code>
              <div className="flex flex-wrap gap-3">
                <Button variant="neutral" size="sm" onClick={salinUrl}>
                  {tersalin ? "Tersalin!" : "Salin URL lama"}
                </Button>
                <Button
                  variant="neutral"
                  size="sm"
                  type="button"
                  onClick={rotasiKunci}
                  disabled={loading}
                >
                  {loading ? "Memproses..." : "Ganti kunci webhook"}
                </Button>
              </div>
            </div>

            <p className="text-xs text-foreground/60">
              Jadwal: {formatSchedule(Number(hour) || 0, Number(minute) || 0)} WIB
              setiap hari. Mengganti kunci akan mematikan URL/perintah lama,
              pasang ulang di cron Anda setelah itu.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Konfirmasi sebelum menyimpan pengaturan otomasi.
          CATATAN: SPEC.md §466 menyarankan konfirmasi hanya untuk aksi yang
          tidak bisa dibatalkan, sedangkan simpan di sini idempoten. Ini
          permintaan pemilik proyek secara sadar. Karena itu teksnya dibuat
          menjelaskan DAMPAK yang sedang disimpan (aktif/tidak, jam berapa),
          bukan sekadar "Anda yakin?" — supaya dialog ini menambah informasi,
          bukan cuma satu klik ekstra. */}
      <ConfirmDialog
        open={konfirmasiSimpan}
        onOpenChange={setKonfirmasiSimpan}
        title={hasExisting ? "Simpan perubahan otomasi?" : "Aktifkan otomasi?"}
        description={
          <>
            {isEnabled ? (
              <>
                Otomasi akan <strong>aktif</strong> dan cron mengirim absensi
                tiap hari pukul{" "}
                <strong>
                  {formatSchedule(Number(hour) || 0, Number(minute) || 0)} WIB
                </strong>
                .
              </>
            ) : (
              <>
                Otomasi akan <strong>nonaktif</strong>. Tidak ada absensi yang
                dikirim otomatis, walau cron tetap menembak webhook.
              </>
            )}
          </>
        }
        confirmLabel="Ya, simpan"
        cancelLabel="Batal"
        confirmVariant="neutral"
        onConfirm={() => formRef.current?.requestSubmit()}
      />

      {/* Konfirmasi ganti kunci webhook. Ini aksi DESTRUKTIF: cron yang sudah
          terpasang langsung berhenti sampai URL baru dipasang. */}
      <ConfirmDialog
        open={konfirmasiRotasi}
        onOpenChange={setKonfirmasiRotasi}
        title="Ganti kunci webhook?"
        description={
          <>
            URL/header cron lama akan <strong>LANGSUNG berhenti bekerja</strong>.
            Anda harus menyalin kunci baru ke layanan cron Anda setelah ini,
            kalau tidak absensi otomatis tidak akan terkirim.
          </>
        }
        confirmLabel="Ya, ganti kunci"
        cancelLabel="Batal"
        onConfirm={() => void eksekusiRotasiKunci()}
      />
    </div>
  );
}

