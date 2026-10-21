"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Info, Loader2, Plus, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatSchedule } from "@/lib/automation";
import { jakartaHour } from "@/lib/cron-dispatch";

// Pilihan jam 00–23. Menit sengaja TIDAK ada: dispatcher hanya mencocokkan jam.
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type Props = {
  hasExisting: boolean;
  initialEnabled: boolean;
  initialHour: number;
  initialWebhookKey: string | null;
};

export default function AutomationForm({
  hasExisting,
  initialEnabled,
  initialHour,
  initialWebhookKey,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  // Ref ke <form> asli: tombol Simpan tidak lagi `type="submit"` (ia membuka
  // dialog dulu). Setelah dikonfirmasi kita panggil `requestSubmit()` supaya
  // jalur submit tetap jalur bawaan form — sama seperti sign-out-button.tsx.
  const formRef = useRef<HTMLFormElement>(null);

  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  // Hanya JAM yang bisa disunting; menit selalu 00. Dispatch cron mencocokkan
  // jam saja (`isDueNow`), jadi menampilkan menit hanya membuat pengguna
  // mengira bisa menjadwalkan 08:40 padahal kiriman bisa terjadi kapan saja di
  // jam 08. Baris DB lama yang bermenit lain tampil/dipertahankan sebagai jamnya.
  const [hour, setHour] = useState(initialHour);
  const [webhookKey, setWebhookKey] = useState<string | null>(
    initialWebhookKey,
  );
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  // Dua dialog konfirmasi: satu untuk menyimpan pengaturan, satu untuk
  // mengganti "kunci tautan otomatis" (aksi destruktif). Dipisah agar pesannya
  // bisa spesifik — konfirmasi yang generik membuat orang menekan "Ya" tanpa baca.
  const [konfirmasiSimpan, setKonfirmasiSimpan] = useState(false);
  const [konfirmasiRotasi, setKonfirmasiRotasi] = useState(false);

  // Pratinjau jadwal berikutnya. Memakai JENDELA JAM (jam:00–jam:59), bukan
  // "tepat menit", karena dispatcher mencocokkan jam: selama jam sekarang masih
  // sama dengan jam jadwal, kiriman masih bisa terjadi hari ini.
  const nextRun = useMemo(() => {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    const hari = hour >= jakartaHour(new Date()) ? "hari ini" : "besok";
    return `${formatSchedule(hour, 0)}–${formatSchedule(hour, 59)} WIB ${hari}`;
  }, [hour]);

  // URL lengkap cara lama (`?key=`): DIPERTAHANKAN sementara untuk penjadwal yang
  // sudah terpasang, tetapi ditandai deprecated di UI (dihapus 1 Jan 2026).
  const webhookUrl = webhookKey
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/cron/submit?key=${webhookKey}`
    : null;

  // URL dasar cara DIANJURKAN: tanpa rahasia di query; kunci dikirim lewat
  // header `Authorization: Bearer`.
  const webhookBaseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/cron/submit`
      : null;

  // Contoh perintah siap tempel untuk penjadwal di server sendiri (header = aman).
  const curlSnippet =
    webhookBaseUrl && webhookKey
      ? `curl -sS -o /dev/null -H "Authorization: Bearer ${webhookKey}" "${webhookBaseUrl}"`
      : null;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);
    // Pemilih jam selalu berisi nilai sah, tetapi jaga-jaga: jangan pernah
    // mengirim jam di luar 0–23 (server akan menolak).
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      setError("Jam kirim wajib dipilih.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled,
          hour,
          // Menit dipaku 00: server juga memaksa 0 (dispatch hanya cek jam).
          minute: 0,
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
      toast.success("Tautan tersalin", "Tempel ke layanan penjadwal Anda.");
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
      toast.success(`${label} tersalin`, "Tempel ke layanan penjadwal Anda.");
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
    // Mengganti kunci langsung mematikan penjadwal yang sudah terpasang sampai
    // tautan baru dipasang. Ini tindakan destruktif, jadi wajib konfirmasi sadar.
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
          hour,
          minute: 0,
          action: "rotate-key",
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        webhookKey?: string;
        error?: string;
      };

      if (!res.ok || !data.webhookKey) {
        const pesan = data.error ?? "Gagal mengganti kunci tautan otomatis.";
        setError(pesan);
        toast.error("Gagal mengganti kunci", pesan);
        return;
      }

      setWebhookKey(data.webhookKey);
      setSukses(
        "Kunci tautan otomatis diganti. Salin tautan baru ke layanan penjadwal Anda.",
      );
      toast.success(
        "Kunci tautan otomatis diganti",
        "Salin tautan baru ke layanan penjadwal Anda sekarang.",
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
            Absensi diproses pada jam yang Anda pilih setiap hari. Anda hanya
            mengatur <strong>jam</strong>, bukan menit: pengiriman massal
            mencocokkan jam, jadi menit tidak berpengaruh.
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
                ? "Otomasi aktif: penjadwal akan mengirim absensi sesuai jadwal di bawah."
                : "Otomasi nonaktif: tidak ada pengiriman otomatis, walau penjadwal tetap memanggil tautan."}
            </p>

            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="hour-picker">Jam kirim (WIB)</Label>
              <Select
                value={hour}
                onValueChange={(next) => {
                  if (typeof next === "number") setHour(next);
                }}
              >
                <SelectTrigger id="hour-picker" aria-describedby="jadwal-berikutnya">
                  <SelectValue>
                    {(value) => formatSchedule(Number(value ?? hour), 0)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {formatSchedule(h, 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id="jadwal-berikutnya"
                className="text-sm text-foreground/70"
              >
                {nextRun ? `Berikutnya: ${nextRun}` : "Jam tidak sah."}
              </p>
            </div>

            {/* PENTING: yang dipilih hanya JAM. Dispatch (GitHub Actions /
                cron-job.org) mencocokkan jam saja, jadi kiriman bisa terjadi
                kapan saja antara menit ke-00 dan ke-59 — bukan tepat di menit
                ke-00 seperti yang mungkin dibayangkan pengguna. Disebut di UI
                (bukan disembunyikan) supaya pengguna tidak mengira otomasi
                gagal hanya karena jamnya "telat". */}
            <div className="flex gap-2 rounded-base border-2 border-border bg-secondary-background p-3 text-xs text-foreground/70">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <strong>Yang diatur hanya jam.</strong> Absensi diproses pada
                jam itu, misalnya pilih <strong>08:00</strong> berarti bisa
                terkirim antara <strong>08:00–08:59 WIB</strong>, bukan tepat
                menit ke-00. Selama masih di jam itu, otomasi{" "}
                <strong>berjalan normal</strong> (cek status di{" "}
                <strong>dasbor</strong>).
              </p>
            </div>

            {/* Tombol ini TIDAK type="submit": ia membuka dialog dulu. Setelah
                dikonfirmasi, dialog memanggil formRef.requestSubmit() sehingga
                jalur submit tetap jalur bawaan form (bukan fetch manual). */}
            <div className="flex flex-row items-center justify-end gap-3">
              <Button
                type="button"
                variant="success"
                onClick={() => setKonfirmasiSimpan(true)}
                disabled={loading}
                title={
                  loading
                    ? "Menyimpan…"
                    : hasExisting
                      ? "Simpan perubahan"
                      : "Aktifkan"
                }
                aria-label={
                  loading
                    ? "Menyimpan"
                    : hasExisting
                      ? "Simpan perubahan"
                      : "Aktifkan"
                }
              >
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                {loading
                  ? "Menyimpan..."
                  : hasExisting
                    ? "Simpan perubahan"
                    : "Aktifkan"}
              </Button>
            </div>

            {error && <Message tone="bad">{error}</Message>}
            {sukses && <Message tone="good">{sukses}</Message>}
          </form>
        </CardContent>
      </Card>

      {webhookUrl && (
        /* Kartu ini default TERTUTUP di balik "Pengaturan lanjutan (opsional)".
           Alasannya: bila admin sudah menyalakan pengiriman massal (GitHub
           Actions memanggil /api/cron/run-all rutin), user TIDAK perlu memasang
           tautan apa pun sendiri. Menampilkannya terbuka membuat user awam
           merasa wajib mengurus sesuatu yang sebenarnya opsional.
           Pola <details>/<summary> native dipakai supaya bisa dibuka-tutup
           tanpa JS dan tetap bisa diakses keyboard (sama seperti FAQ di "/"). */
        <details className="group rounded-base border-2 border-border bg-background font-base text-foreground shadow-shadow">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-base p-6 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <div className="grid gap-1.5">
              <span className="font-heading leading-none">
                Pengaturan lanjutan (opsional)
              </span>
              <span className="text-sm font-base">
                Hanya perlu bila Anda memasang penjadwal sendiri. Bila admin
                sudah mengaktifkan pengiriman massal, bagian ini tidak usah
                diurus.
              </span>
            </div>
            <Plus
              aria-hidden="true"
              className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <div className="space-y-4 px-6 pb-6">
            <div className="grid gap-1.5">
              <span className="font-heading leading-none">Tautan otomatis</span>
              <span className="text-sm font-base">
                Sambungkan layanan penjadwal Anda (mis. cron-job.org) ke tautan
                ini, jadwalkan sekali sehari. <strong>Cara dianjurkan:</strong>{" "}
                kirim kunci lewat bagian pengaturan khusus, bukan ditempel di
                tautan. Jangan bagikan kunci ini, siapa pun yang tahu bisa
                memicu pengiriman.
              </span>
            </div>
            {/* Cara DIANJURKAN: kunci lewat header, URL bersih tanpa rahasia. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Cara dianjurkan (kunci lewat pengaturan khusus)
              </p>
              <p className="text-xs text-foreground/60">Alamat tautan:</p>
              <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                {webhookBaseUrl}
              </code>
              <p className="text-xs text-foreground/60">
                Isi pengaturan kunci:
              </p>
              <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                Authorization: Bearer {webhookKey}
              </code>
              {curlSnippet && (
                <>
                  <p className="text-xs text-foreground/60">
                    Contoh untuk penjadwal di server sendiri:
                  </p>
                  <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                    {curlSnippet}
                  </code>
                  <Button
                    variant="neutral"
                    size="sm"
                    type="button"
                    onClick={() => salinTeks(curlSnippet, "Perintah")}
                    title="Salin perintah"
                    aria-label="Salin perintah"
                  >
                    <Copy aria-hidden />
                    Salin perintah
                  </Button>
                </>
              )}
            </div>

            {/* Cara LAMA: dipertahankan sementara, ditandai deprecated. */}
            <div className="space-y-2 rounded-base border-2 border-dashed border-border p-3">
              <p className="text-sm font-medium">Cara lama (akan dihapus)</p>
              <p className="text-xs text-foreground/60">
                Menempel kunci di tautan masih berfungsi sampai{" "}
                <strong>1 Januari 2026</strong>, lalu dihapus. Hindari untuk
                pemasangan baru.
              </p>
              <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
                {webhookUrl}
              </code>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={tersalin ? "success" : "neutral"}
                  size="sm"
                  onClick={salinUrl}
                  title={tersalin ? "Tersalin" : "Salin tautan lama"}
                  aria-label={tersalin ? "Tersalin" : "Salin tautan lama"}
                >
                  {tersalin ? (
                    <>
                      <Check aria-hidden />
                      Tersalin!
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden />
                      Salin tautan lama
                    </>
                  )}
                </Button>
                <Button
                  variant="neutral"
                  size="sm"
                  type="button"
                  onClick={rotasiKunci}
                  disabled={loading}
                  title={loading ? "Memproses…" : "Ganti kunci"}
                  aria-label={loading ? "Memproses" : "Ganti kunci"}
                >
                  {loading ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                  {loading ? "Memproses..." : "Ganti kunci"}
                </Button>
              </div>
            </div>

            <p className="text-xs text-foreground/60">
              Jadwal: {formatSchedule(hour, 0)}{" "}
              WIB setiap hari. Mengganti kunci akan mematikan tautan/perintah
              lama, pasang ulang di penjadwal Anda setelah itu.
            </p>
          </div>
        </details>
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
                Otomasi akan <strong>aktif</strong> dan absensi diproses pada
                jam{" "}
                <strong>
                  {formatSchedule(hour, 0)}–{formatSchedule(hour, 59)} WIB
                </strong>{" "}
                setiap hari. Bisa terkirim kapan saja di jam itu, bukan tepat
                menit ke-00.
              </>
            ) : (
              <>
                Otomasi akan <strong>nonaktif</strong>. Tidak ada absensi yang
                dikirim otomatis, walau penjadwal tetap memanggil tautan.
              </>
            )}
          </>
        }
        confirmLabel="Ya, simpan"
        cancelLabel="Batal"
        confirmVariant="neutral"
        onConfirm={() => formRef.current?.requestSubmit()}
      />

      {/* Konfirmasi ganti kunci tautan otomatis. Ini aksi DESTRUKTIF: penjadwal
          yang sudah terpasang langsung berhenti sampai tautan baru dipasang. */}
      <ConfirmDialog
        open={konfirmasiRotasi}
        onOpenChange={setKonfirmasiRotasi}
        title="Ganti kunci?"
        description={
          <>
            Tautan/pengaturan penjadwal lama akan{" "}
            <strong>LANGSUNG berhenti bekerja</strong>. Anda harus menyalin
            kunci baru ke layanan penjadwal Anda setelah ini, kalau tidak
            absensi otomatis tidak akan terkirim.
          </>
        }
        confirmLabel="Ya, ganti kunci"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={() => void eksekusiRotasiKunci()}
      />
    </div>
  );
}
