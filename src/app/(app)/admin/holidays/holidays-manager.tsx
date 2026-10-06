// src/app/(app)/admin/holidays/holidays-manager.tsx: kelola libur (KLIEN).
//
// Satu komponen menangani tiga aksi (tambah / ubah / hapus) supaya tabel,
// form, dan pesan kesalahan berada dalam satu tempat yang konsisten. Semua
// keputusan penting tetap di SERVER (lihat /api/admin/holidays): komponen ini
// hanya mengirim permintaan & menampilkan hasil. Validasi di sini murni untuk
// umpan balik cepat, bukan pengaman.
//
// Pola yang diikuti dari user-actions.tsx:
//   - hapus lewat <ConfirmDialog> (bukan window.confirm),
//   - Toast untuk hasil sukses/gagal,
//   - router.refresh() setelah perubahan agar daftar server ikut segar.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";
import {
  HOLIDAY_KINDS,
  isSeedHolidayId,
  type HolidayRow,
} from "@/lib/holiday-admin";
import { formatHolidayDate, weekdayLabelOf } from "./format";

type Props = {
  initialRows: HolidayRow[];
  /** Hari ini (WIB) sebagai `YYYY-MM-DD`, dari server — untuk menandai lewat. */
  today: string;
};

export function HolidaysManager({ initialRows, today }: Props) {
  const router = useRouter();
  const toast = useToast();

  // Daftar ditampilkan LANGSUNG dari `initialRows` (data server). Setelah
  // tambah/ubah/hapus kami memanggil `router.refresh()`; karena halaman memberi
  // `key` pada komponen ini dari data server, komponen dipasang ulang dengan
  // daftar terbaru. Jadi tidak ada state lokal yang perlu diselaraskan manual —
  // sumber tunggalnya tetap server.
  const rows = initialRows;
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [tanggal, setTanggal] = React.useState("");
  const [nama, setNama] = React.useState("");
  const [jenis, setJenis] = React.useState<string>(HOLIDAY_KINDS[0]);
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [hapus, setHapus] = React.useState<HolidayRow | null>(null);

  function reset() {
    setEditingId(null);
    setTanggal("");
    setNama("");
    setJenis(HOLIDAY_KINDS[0]);
    setError(null);
  }

  function mulaiUbah(row: HolidayRow) {
    setEditingId(row.id);
    setTanggal(row.date);
    setNama(row.name);
    setJenis(row.kind);
    setError(null);
  }

  async function simpan(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // <DatePicker> bukan kontrol form asli, jadi atribut `required` bawaan
    // peramban tak lagi berlaku. Kami ulangi pemeriksaan wajibnya di sini agar
    // umpan balik cepat tetap ada (server tetap memvalidasi ini sebagai pagar
    // sesungguhnya di /api/admin/holidays).
    const date = tanggal.trim();
    if (!date) {
      setError("Tanggal wajib dipilih.");
      return;
    }

    setWorking(true);

    const payload = { date, name: nama.trim(), kind: jenis };
    try {
      const res = await fetch("/api/admin/holidays", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; holiday?: HolidayRow }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Gagal menyimpan.");
        return;
      }
      toast.success(
        editingId ? "Libur diperbarui" : "Libur ditambahkan",
        `${payload.date} — ${payload.name}`,
      );
      reset();
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setWorking(false);
    }
  }

  async function jalankanHapus() {
    if (!hapus) return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/admin/holidays?id=${encodeURIComponent(hapus.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        toast.error("Gagal menghapus", data?.error ?? "Terjadi kesalahan.");
        return;
      }
      toast.success("Libur dihapus", `${hapus.date} — ${hapus.name}`);
      // Bila yang dihapus sedang diedit, bersihkan form.
      if (editingId === hapus.id) reset();
      router.refresh();
    } catch {
      toast.error("Gagal menghapus", "Tidak bisa menghubungi server.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? "Ubah libur" : "Tambah libur baru"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={simpan} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="holiday-date">Tanggal</Label>
                <DatePicker
                  id="holiday-date"
                  value={tanggal || null}
                  onChange={(v) => setTanggal(v ?? "")}
                  // Halaman ini justru MENGELOLA daftar libur, jadi pembatas
                  // "hari libur & tanggal lampau" dimatikan: admin harus bisa
                  // memilih Sabtu/Minggu atau tanggal mundur untuk didaftarkan.
                  unrestricted
                />
                <span className="text-xs text-foreground/60">
                  Pilih hari kerja (Sabtu/Minggu sudah otomatis libur).
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="holiday-name">Nama libur</Label>
                <Input
                  id="holiday-name"
                  type="text"
                  value={nama}
                  placeholder="mis. Cuti Bersama Natal"
                  onChange={(e) => setNama(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="holiday-kind">Jenis</Label>
                <NativeSelect
                  id="holiday-kind"
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value)}
                >
                  {HOLIDAY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              {/* Tombol aksi menyatu di baris field yang sama dan sejajar
                  dengan garis input (self-end) — jadi "+" tampak sejajar
                  Tanggal/Nama libur/Jenis, bukan menggantung di bawahnya. */}
              <div className="flex flex-row flex-wrap items-center gap-2 self-end sm:col-start-1">
                <Button
                  type="submit"
                  variant="success"
                  size="icon-sm"
                  disabled={working}
                  title={editingId ? "Simpan perubahan" : "Tambah libur"}
                  aria-label={editingId ? "Simpan perubahan" : "Tambah libur"}
                >
                  {editingId ? (
                    <Save aria-hidden />
                  ) : (
                    <Plus aria-hidden />
                  )}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="neutral"
                    size="icon-sm"
                    onClick={reset}
                    disabled={working}
                    title="Batal ubah"
                    aria-label="Batal ubah"
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>

            {error ? (
              <Message tone="bad" as="div">
                {error}
              </Message>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar libur ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.some((r) => isSeedHolidayId(r.id)) ? (
            <p className="mb-3 text-sm text-foreground/70">
              Daftar masih memakai <strong>libur nasional bawaan</strong>. Tambah
              satu tanggal di atas untuk mulai mengelola daftar sendiri — baris
              bawaan akan digantikan oleh data yang Anda kelola.
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="text-sm text-foreground/70">
              Belum ada tanggal libur yang didaftarkan. Sabtu &amp; Minggu tetap
              otomatis libur tanpa perlu didaftarkan di sini.
            </p>
          ) : (
            <div
              className="-mx-3 overflow-x-auto"
              role="region"
              aria-label="Tabel daftar libur (dapat digulir)"
              tabIndex={0}
            >
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="p-3 font-heading">Tanggal</th>
                    <th className="p-3 font-heading">Hari</th>
                    <th className="p-3 font-heading">Nama</th>
                    <th className="p-3 font-heading">Jenis</th>
                    <th className="p-3 font-heading">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const lewat = row.date < today;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/40 align-middle last:border-b-0"
                      >
                        <td className="p-3">
                          <span className="font-heading text-sm">
                            {formatHolidayDate(row.date)}
                          </span>
                          {lewat ? (
                            <span className="ml-2 text-xs text-foreground/50">
                              (sudah lewat)
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 text-sm text-foreground/70">
                          {weekdayLabelOf(row.date)}
                        </td>
                        <td className="p-3 text-sm">{row.name}</td>
                        <td className="p-3 text-sm text-foreground/70">
                          {row.kind}
                        </td>
                        <td className="p-3">
                          {isSeedHolidayId(row.id) ? (
                            <span className="text-xs text-foreground/60">
                              Bawaan sistem
                            </span>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="neutral"
                                size="icon-sm"
                                onClick={() => mulaiUbah(row)}
                                disabled={working}
                                title="Ubah"
                                aria-label="Ubah"
                              >
                                <Pencil aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                size="icon-sm"
                                onClick={() => setHapus(row)}
                                disabled={working}
                                title="Hapus"
                                aria-label="Hapus"
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={hapus !== null}
        onOpenChange={(buka) => !buka && setHapus(null)}
        title="Hapus tanggal libur ini?"
        description={
          hapus
            ? `${formatHolidayDate(hapus.date)} (${hapus.name}) akan dihapus. Otomasi akan kembali mencoba mengirim pada tanggal ini bila jatuh pada hari kerja.`
            : ""
        }
        confirmLabel="Ya, hapus"
        confirmVariant="danger"
        onConfirm={jalankanHapus}
      />
    </div>
  );
}
