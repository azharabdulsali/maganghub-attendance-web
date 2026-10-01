// src/app/(app)/report-templates/dated-templates-table.tsx
//
// Server component: daftar template yang BERLAKU PER TANGGAL, ditaruh di bawah
// form. Menggantikan kutipan "Riwayat Laporan Terakhir" yang lama: yang
// ditampilkan bukan lagi percobaan kirim, melainkan tanggal-tanggal yang punya
// template khusus (tabel `DatedReportTemplate`).
//
// Kenapa begini:
//   - Hanya tanggal ber-template khusus yang muncul. Tanggal tanpa template
//     khusus tidak perlu didaftar, ia memakai template default dan tidak ada
//     yang perlu ditinjau.
//   - Kolom isi = ISI TEMPLATE yang berlaku di tanggal itu, bukan laporan yang
//     terkirim. Ini daftar template, bukan riwayat.
//   - Aksi "Buka" memuat tanggal itu ke form di atas (`?date=YYYY-MM-DD`).
//     Sejak perbaikan, ini pulau klien `OpenDatedButton`, bukan `<Link>`: `<Link>`
//     ke rute yang sama dengan query baru tidak memasang ulang form, sehingga
//     form tetap menampilkan tanggal lama (tampak "tidak terjadi apa-apa").
//     Tombol ini `router.push` lalu menggulir form; `page.tsx` memberi form
//     `key={params.date}` agar tanggal baru mengganti state form dengan segar.
//     Bila belum ada template khususnya, form terisi isi default sebagai titik
//     awal, lalu Simpan akan MEMBUAT template khusus tanggal itu.
//   - Aksi "Hapus" membuang penimpa tanggal itu (DELETE
//     `/api/report-templates/dated?date=...`), sehingga tanggal itu kembali
//     memakai template default. Tombolnya klien kecil (`DeleteDatedButton`)
//     dengan <ConfirmDialog>, bukan `window.confirm`; setelah sukses tabel
//     di-`router.refresh()` agar barisnya hilang.
//
// Batas tanggung jawab: hanya membaca & menyusun tabel. Status tanggal
// (libur/di luar program) memakai lib/report-policy.ts yang sama dengan form,
// supaya penandanya konsisten.

import { prisma } from "@/lib/prisma";
import { DeleteDatedButton } from "./delete-dated-button";
import { OpenDatedButton } from "./open-dated-button";
import { toPlainDate } from "@/lib/submit-service";
import { isHoliday, isAfter, LAST_ACTIVE_DATE } from "@/lib/report-policy";
import { Message } from "@/components/ui/message";

/**
 * Teks isi template dalam sel tabel. Dipangkas agar tabel tidak melebar liar;
 * teks utuh tetap tersedia lewat atribut `title` (tooltip). Nilai kosong
 * ditampilkan sebagai "," supaya tidak ada sel yang tampak rusak/kosong.
 */
function Cell({ text }: { text: string }) {
  if (!text) return <span className="text-foreground/40">,</span>;
  return (
    <span className="line-clamp-3 block" title={text}>
      {text}
    </span>
  );
}

/** Satu baris label+nilai pada kartu mobile. */
function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-heading text-foreground/50">{label}</dt>
      <dd className="text-xs leading-relaxed text-foreground/80">
        {value || <span className="text-foreground/40">,</span>}
      </dd>
    </div>
  );
}

/** Ringkasan status tanggal, sama logikanya dengan form. */
function statusOf(date: string, today: string): string {
  if (isAfter(date, LAST_ACTIVE_DATE)) return "Di luar masa program";
  if (isHoliday(date)) return "Libur, otomasi tidak mengirim";
  if (isAfter(today, date)) return "Sudah lewat";
  return "Siap dipakai";
}

/**
 * Chip status tanggal. Sebelumnya semua keadaan memakai chip abu-abu yang
 * sama sehingga "Libur", "Di luar masa program", dan "Sudah lewat" (tanggal
 * yang template-nya tidak akan pernah terkirim) tenggelam. Kini hue mengikuti
 * nada `Message`: "Siap dipakai" hijau, sisanya merah agar menandai baris yang
 * perlu ditinjau/dihapus.
 */
function StatusChip({ date, today }: { date: string; today: string }) {
  const status = statusOf(date, today);
  return (
    <Message
      tone={status === "Siap dipakai" ? "good" : "bad"}
      className="inline-block px-2 py-0.5 text-[0.7rem]"
    >
      {status}
    </Message>
  );
}

export default async function DatedTemplatesTable({
  userId,
  today,
}: {
  userId: string;
  /** Tanggal hari ini WIB (dihitung server) untuk label status. */
  today: string;
}) {
  const rows = await prisma.datedReportTemplate.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    select: {
      date: true,
      activity: true,
      learning: true,
      obstacles: true,
    },
  });

  const items = rows.map((r) => ({
    date: toPlainDate(r.date),
    activity: r.activity,
    learning: r.learning,
    obstacles: r.obstacles,
  }));

  return (
    <section className="mt-10 border-2 border-border bg-secondary-background p-4 shadow-shadow sm:p-6">
      <div>
        <h2 className="font-heading text-lg">Template Khusus Tanggal Tertentu</h2>
        <p className="mt-0.5 text-xs text-foreground/60">
          Tanggal yang punya template sendiri, terpisah dari template default.
          Tekan <b>Buka</b> untuk menyuntingnya di form di atas. Tanggal yang
          tidak ada di sini memakai template default.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/60">
          Belum ada template khusus tanggal. Isi kolom tanggal di form di atas
          untuk membuatnya.
        </p>
      ) : (
        <>
          {/* Mobile: kartu bertumpuk. */}
          <ul className="mt-4 space-y-2.5 sm:hidden">
            {items.map((t) => (
              <li
                key={t.date}
                className="space-y-2 border-2 border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold tabular-nums">
                    {t.date}
                  </span>
                  <StatusChip date={t.date} today={today} />
                </div>

                <dl className="space-y-1.5 border-t border-border/40 pt-2">
                  <MobileField label="Uraian Aktivitas" value={t.activity} />
                  <MobileField
                    label="Pembelajaran yang Diperoleh"
                    value={t.learning}
                  />
                  <MobileField label="Kendala yang Dialami" value={t.obstacles} />
                </dl>

                <div className="flex flex-wrap gap-2">
                  <OpenDatedButton date={t.date} />
                  <DeleteDatedButton date={t.date} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabel. */}
          <div
            className="mt-4 hidden overflow-x-auto sm:block"
            role="region"
            aria-label="Tabel template khusus tanggal (dapat digulir)"
            tabIndex={0}
          >
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-xs text-foreground/60">
                  <th className="p-3 font-heading">Tanggal</th>
                  <th className="p-3 font-heading">Uraian Aktivitas</th>
                  <th className="p-3 font-heading">Pembelajaran yang Diperoleh</th>
                  <th className="p-3 font-heading">Kendala yang Dialami</th>
                  <th className="p-3 text-right font-heading">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr
                    key={t.date}
                    className="border-b border-border/40 align-top last:border-b-0"
                  >
                    <td className="whitespace-nowrap p-3">
                      <span className="block font-mono text-xs font-bold tabular-nums">
                        {t.date}
                      </span>
                      <span className="mt-1 block">
                        <StatusChip date={t.date} today={today} />
                      </span>
                    </td>
                    <td className="max-w-xs p-3 text-xs text-foreground/80">
                      <Cell text={t.activity} />
                    </td>
                    <td className="max-w-xs p-3 text-xs text-foreground/80">
                      <Cell text={t.learning} />
                    </td>
                    <td className="max-w-xs p-3 text-xs text-foreground/80">
                      <Cell text={t.obstacles} />
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <OpenDatedButton date={t.date} />
                        <DeleteDatedButton date={t.date} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
