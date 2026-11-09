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
//   - **Urutan: tanggal TERBARU dulu** (keputusan pemilik). Yang dicari pengguna
//     hampir selalu template kemarin/hari ini, bukan yang paling lama. Bahan draf
//     commit memakai urutan sebaliknya (kronologis naik) karena itu menyusun
//     narasi satu hari — dua kebutuhan berbeda, dua urutan berbeda.
//   - **Teks panjang dipangkas + tombol "Selengkapnya".** Sebelumnya sel memakai
//     `line-clamp-3` yang memotong teks TANPA cara membukanya, sehingga isi
//     template tidak bisa diperiksa dari tabel ini sama sekali.
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

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteDatedButton } from "./delete-dated-button";
import { OpenDatedButton } from "./open-dated-button";
import { toPlainDate } from "@/lib/submit-service";
import { isHoliday, isAfter, LAST_ACTIVE_DATE } from "@/lib/report-policy";
import { Message } from "@/components/ui/message";
import Pagination from "@/components/pagination";
import type { Pagination as PaginationInfo } from "@/lib/audit-log";
import { trimToChars } from "@/lib/text-trim";

/**
 * Panjang teks yang ditampilkan saat sel TERTUTUP (karakter).
 *
 * Dipilih supaya teks yang sudah ringkas (100-200 karakter, hasil draf commit)
 * tampil utuh tanpa tombol, sementara template lama yang panjang tetap ringkas.
 */
const CELL_PREVIEW_CHARS = 120;

/** Tanggal yang sedang dibuka "Selengkapnya"-nya (satu per tabel). */
export type ExpandedDate = string | null;

/**
 * Teks isi template dalam sel tabel.
 *
 * Tiga keadaan, sengaja dibedakan:
 *   - kosong -> ditampilkan sebagai "," agar tidak ada sel yang tampak rusak;
 *   - pendek  -> tampil utuh, tanpa tombol (tombol untuk teks yang sudah
 *     kelihatan seluruhnya hanya menambah bising);
 *   - panjang -> dipangkas di batas kata + tautan "Selengkapnya" yang membuka
 *     teks utuh.
 *
 * `expanded` membuka SEMUA kolom pada baris itu sekaligus, bukan per kolom:
 * pengguna biasanya ingin memeriksa satu tanggal, bukan satu sel.
 */
function Cell({
  text,
  date,
  expanded,
  buildExpandHref,
}: {
  text: string;
  date: string;
  expanded: boolean;
  buildExpandHref: (date: string | null) => string;
}) {
  if (!text) return <span className="text-foreground/40">,</span>;

  const terpotong = text.length > CELL_PREVIEW_CHARS;

  if (expanded || !terpotong) {
    return <span className="block whitespace-pre-line">{text}</span>;
  }

  return (
    <span className="block">
      {trimToChars(text, CELL_PREVIEW_CHARS)}{" "}
      <Link
        href={buildExpandHref(date)}
        // `scroll: false` tidak dipakai: halaman ini punya form di atas, dan
        // tanpa menggulir pengguna tidak melihat bahwa barisnya berubah.
        className="whitespace-nowrap font-heading text-foreground underline underline-offset-2"
        aria-label={`Tampilkan teks lengkap template tanggal ${date}`}
      >
        Selengkapnya
      </Link>
    </span>
  );
}

/** Satu baris label+nilai pada kartu mobile. */
function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-heading text-foreground/50">{label}</dt>
      <dd className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">
        {value || <span className="text-foreground/40">,</span>}
      </dd>
    </div>
  );
}

/** Ringkasan status tanggal, sama logikanya dengan form. */
function statusOf(
  date: string,
  today: string,
  holidays?: ReadonlySet<string>,
): string {
  if (isAfter(date, LAST_ACTIVE_DATE)) return "Di luar masa program";
  if (isHoliday(date, holidays)) return "Libur, otomasi tidak mengirim";
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
function StatusChip({
  date,
  today,
  holidays,
}: {
  date: string;
  today: string;
  holidays?: ReadonlySet<string>;
}) {
  const status = statusOf(date, today, holidays);
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
  holidays,
  pageInfo,
  buildHref,
  buildExpandHref,
  expandedDate,
}: {
  userId: string;
  /** Tanggal hari ini WIB (dihitung server) untuk label status. */
  today: string;
  /** Libur dari tabel admin untuk label status (opsional; fallback statis). */
  holidays?: ReadonlySet<string>;
  /** Halaman yang sedang tampil & batas irisan baris (dihitung di page.tsx). */
  pageInfo: PaginationInfo;
  /** Susun URL untuk nomor halaman tertentu (mempertahankan `?date=` aktif). */
  buildHref: (page: number) => string;
  /** Susun URL yang membuka/menutup teks panjang (`?expand=YYYY-MM-DD`). */
  buildExpandHref: (date: string | null) => string;
  /** Tanggal yang teksnya sedang dibuka penuh, atau `null`. */
  expandedDate: ExpandedDate;
}) {
  // Hanya SATU halaman diambil dari database. Sebelumnya seluruh tabel ditarik
  // tanpa `take` lalu dipotong di memori, dan `page.tsx` menarik daftar yang
  // SAMA sekali lagi — dua query untuk data yang identik, dan pengguna dengan
  // ratusan template mengangkut semuanya setiap kali halaman dibuka.
  //
  // `take` dihitung dari `end - start`. Saat tabel KOSONG hasilnya 0, dan
  // Prisma memperlakukan `take: 0` sebagai "tanpa batas" — bukan nol baris.
  // Hari ini itu tidak berbahaya (tidak ada baris untuk diambil), tapi arti
  // diam-diamnya terlalu mudah berbalik jadi bug bila suatu saat `count` dan
  // `findMany` tidak sinkron. `Math.max(0, ...)` menjaga maksudnya eksplisit.
  const take = Math.max(0, pageInfo.end - pageInfo.start);
  const rows =
    take === 0
      ? []
      : await prisma.datedReportTemplate.findMany({
          where: { userId },
          // Terbaru dulu: yang dicari hampir selalu template hari ini/kemarin.
          orderBy: { date: "desc" },
          skip: pageInfo.start,
          take,
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
          {/* Penanda baris yang sedang terbuka. Tanpa ini, pengguna yang membuka
              satu baris lalu menggulir tidak tahu baris mana yang berubah. */}
          {expandedDate ? (
            <p className="mt-3 text-xs text-foreground/60">
              Menampilkan teks lengkap tanggal{" "}
              <span className="font-mono font-bold">{expandedDate}</span>.{" "}
              <Link
                href={buildExpandHref(null)}
                className="font-heading underline underline-offset-2"
              >
                Ringkas kembali
              </Link>
            </p>
          ) : null}

          {/* Mobile: kartu bertumpuk. */}
          <ul className="mt-4 space-y-2.5 sm:hidden">
            {items.map((t) => {
              const terbuka = expandedDate === t.date;
              return (
                <li
                  key={t.date}
                  className="space-y-2 border-2 border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold tabular-nums">
                      {t.date}
                    </span>
                    <StatusChip date={t.date} today={today} holidays={holidays} />
                  </div>

                  <dl className="space-y-1.5 border-t border-border/40 pt-2">
                    <MobileField label="Uraian Aktivitas" value={t.activity} />
                    <MobileField
                      label="Pembelajaran yang Diperoleh"
                      value={t.learning}
                    />
                    <MobileField label="Kendala yang Dialami" value={t.obstacles} />
                  </dl>

                  {/* Di kartu mobile teksnya sudah tampil penuh (tidak ada
                      batas tinggi), jadi hanya tombol tutup yang berguna.
                      Tombol buka tetap disediakan agar perilakunya sama
                      dengan tabel desktop. */}
                  {terbuka ? (
                    <Link
                      href={buildExpandHref(null)}
                      className="inline-block font-heading text-xs underline underline-offset-2"
                    >
                      Ringkas kembali
                    </Link>
                  ) : (
                    <Link
                      href={buildExpandHref(t.date)}
                      className="inline-block font-heading text-xs underline underline-offset-2"
                      aria-label={`Tampilkan teks lengkap template tanggal ${t.date}`}
                    >
                      Selengkapnya
                    </Link>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <OpenDatedButton date={t.date} />
                    <DeleteDatedButton date={t.date} />
                  </div>
                </li>
              );
            })}
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
                {items.map((t) => {
                  const terbuka = expandedDate === t.date;
                  return (
                    <tr
                      key={t.date}
                      className="border-b border-border/40 align-top last:border-b-0"
                    >
                      <td className="whitespace-nowrap p-3">
                        <span className="block font-mono text-xs font-bold tabular-nums">
                          {t.date}
                        </span>
                        <span className="mt-1 block">
                          <StatusChip date={t.date} today={today} holidays={holidays} />
                        </span>
                      </td>
                      <td className="max-w-xs p-3 text-xs text-foreground/80">
                        <Cell
                          text={t.activity}
                          date={t.date}
                          expanded={terbuka}
                          buildExpandHref={buildExpandHref}
                        />
                      </td>
                      <td className="max-w-xs p-3 text-xs text-foreground/80">
                        <Cell
                          text={t.learning}
                          date={t.date}
                          expanded={terbuka}
                          buildExpandHref={buildExpandHref}
                        />
                      </td>
                      <td className="max-w-xs p-3 text-xs text-foreground/80">
                        <Cell
                          text={t.obstacles}
                          date={t.date}
                          expanded={terbuka}
                          buildExpandHref={buildExpandHref}
                        />
                      </td>
                      <td className="whitespace-nowrap p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <OpenDatedButton date={t.date} />
                          <DeleteDatedButton date={t.date} />
                        </div>
                        {terbuka ? (
                          <Link
                            href={buildExpandHref(null)}
                            className="mt-2 inline-block font-heading text-xs underline underline-offset-2"
                          >
                            Ringkas kembali
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Navigasi halaman: hanya tampil bila lebih dari satu halaman (komponen
          ini merender null saat `pageCount <= 1`). */}
      <Pagination
        page={pageInfo.page}
        pageCount={pageInfo.pageCount}
        label="Navigasi halaman template khusus tanggal"
        buildHref={buildHref}
      />
    </section>
  );
}
