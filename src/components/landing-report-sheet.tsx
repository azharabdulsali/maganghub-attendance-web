"use client";

import * as React from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
  type Variants,
} from "motion/react";
import { Stamp } from "@/components/ui/stamp";
import { Tilt } from "@/components/ui/tilt";
import {
  INTERVAL_OTOMATIS_MS,
  bolehJalanOtomatis,
} from "@/lib/landing-sheet-autoplay";
import { arahGantiLembar, type ArahLembar } from "@/lib/landing-sheet-gesture";
import { cn } from "@/lib/utils";

/**
 * Lembar laporan contoh di hero landing, lengkap dengan tumpukan dan sudut
 * terlipat. Mengetuk ATAU menggeser lembar memutar isinya ke lembar
 * berikutnya, seperti menaruh lembar depan ke belakang tumpukan.
 *
 * Kenapa komponen KLIEN: isi lembar berubah, jadi statusnya harus hidup di
 * peramban. Teksnya sendiri tetap dikirim sebagai data dari server
 * (`src/app/page.tsx`), bukan ditulis ulang di sini.
 *
 * Kenapa memakai `motion` (keputusan pemilik 2026-11, DESIGN.md poin 6):
 * geser-dengan-jari menuntut pelacakan pointer, ambang lepas, dan pegas
 * pemulihan yang tidak sepadan ditulis tangan. Harganya nyata dan SUDAH DIUKUR,
 * bukan perkiraan: JS rute `/` naik 219,3 → 267,2 KB gzip (+47,9 KB, +22%) dan
 * **nol** pada rute lain, karena komponen ini hanya dipakai di landing. Jangan
 * menambah pemakaian `motion` di halaman lain tanpa keputusan pemilik yang baru.
 *
 * Batas yang mengikat (DESIGN.md, pengecualian hero):
 * - **Lembar berganti sendiri tiap 6 detik, tetapi hanya sampai pengguna
 *   menyentuhnya.** Ini satu-satunya gerak di aplikasi yang berjalan tanpa
 *   dipicu pengguna, dan hanya boleh tetap begitu bila SEMUA pagar di
 *   `src/lib/landing-sheet-autoplay.ts` dipenuhi: lebih dari satu lembar,
 *   `prefers-reduced-motion` tidak aktif, belum disentuh, tidak dijeda, tidak
 *   sedang digeser, dan tab sedang terlihat. Aturannya MURNI & teruji; jangan
 *   menulis ulang syaratnya di sini.
 * - **Sentuhan atau fokus menghentikannya, dan ia tidak menyalakan sendiri
 *   lagi.** Fokus ikut menghentikan bukan karena kehati-hatian berlebihan:
 *   `AnimatePresence` memasang ulang lembar setiap indeks berganti, jadi
 *   pengguna keyboard akan kehilangan posisi fokusnya tiap 6 detik bila
 *   auto-rotate tetap berjalan.
 * - **Tidak pernah ada dua lembar berteks sekaligus.** `AnimatePresence
 *   mode="wait"` menahan lembar baru sampai lembar lama benar-benar selesai
 *   pergi. Jangan diganti `mode="popLayout"`/`"sync"`: keduanya memudarkan dua
 *   teks bersamaan dan hasilnya kabur — cacat itu sudah pernah terlihat.
 * - `prefers-reduced-motion` dihormati: durasi animasi nol, geser dimatikan,
 *   DAN auto-rotate tidak pernah menyala.
 */

/** Satu lembar contoh: tanggal yang sudah diformat + tiga kolom laporan. */
export type LembarContoh = {
  tanggal: string;
  kolom: { label: string; isi: string }[];
};

/** Satu fakta di kaki lembar (mis. "3" / "Kolom laporan"). */
export type FaktaLembar = { nilai: string; label: string };

/** Nilai yang dititipkan ke varian `keluar`: seberapa jauh lembar dilempar. */
type KustomLembar = { lempar: number };

export function LandingReportSheet({
  lembar,
  fakta,
}: {
  lembar: LembarContoh[];
  fakta: FaktaLembar[];
}) {
  const [indeks, setIndeks] = React.useState(0);
  // Seberapa jauh lembar dilempar saat dilepas. `0` berarti pergantian datang
  // dari ketukan, bukan geseran; varian `keluar` membedakan keduanya.
  const [lempar, setLempar] = React.useState(0);
  // `true` bila sentuhan yang sedang berjalan sudah berubah menjadi geseran.
  // Dibuka di `pointerdown` (paling awal) dan dipasang di `onDragStart`, jadi
  // `pointerup` bisa membedakan ketukan dari geseran TANPA bergantung pada
  // urutan `click`/`onDragEnd` — urutan itu sudah terbukti tidak bisa dipegang
  // (lihat komentar di `onPointerUp`).
  const sedangGeser = React.useRef(false);
  // Pengguna sudah menyentuh/memfokuskan lembar. Auto-rotate berhenti dan
  // TIDAK menyalakan sendiri lagi: tidak ada tombol untuk melanjutkannya,
  // karena kendali sudah diambil alih pengguna (keputusan pemilik 2026-11).
  const [sudahDisentuh, setSudahDisentuh] = React.useState(false);

  const kurangi = useReducedMotion() ?? false;

  const jumlah = lembar.length;
  const bisaGanti = jumlah > 1;
  const aktif = lembar[indeks];

  const ganti = React.useCallback(
    (arah: ArahLembar, lemparPx = 0) => {
      if (!bisaGanti || arah === 0) return;
      // Ketukan saat animasi masih berjalan tidak perlu ditahan lagi: `indeks`
      // memakai pola fungsional, dan `AnimatePresence` menahan lembar baru
      // sampai yang lama selesai. Ketukan beruntun hanya mempercepat putaran.
      setLempar(lemparPx);
      setIndeks((n) => (n + arah + jumlah) % jumlah);
    },
    // `useCallback` bukan hiasan: `ganti` dipakai sebagai dependency efek timer
    // di bawah. Tanpa ini, fungsi baru dibuat tiap render, efek dipasang ulang
    // terus, dan timer 6 detik TIDAK PERNAH sempat menyala.
    [bisaGanti, jumlah],
  );

  // `sedangGeser` dan `tabTersembunyi` sengaja TIDAK ikut di sini: keduanya
  // berubah tanpa memicu render (ref / API peramban), jadi diperiksa di dalam
  // tick timer. Memasukkannya ke sini akan membuat timer dipasang ulang di
  // tengah geseran.
  const otomatisAktif = bolehJalanOtomatis({
    jumlahLembar: jumlah,
    kurangiGerak: kurangi,
    sudahDisentuh,
    sedangGeser: false,
    tabTersembunyi: false,
  });

  React.useEffect(() => {
    if (!otomatisAktif) return;
    const id = window.setInterval(() => {
      // Jangan memotong geseran yang sedang berjalan: lembar akan berganti di
      // bawah jari pengguna.
      if (sedangGeser.current) return;
      // Tab tersembunyi: peramban sudah menahan timer, tetapi pemeriksaan ini
      // memastikan lembar tidak "melompat" beberapa kali begitu tab dibuka.
      if (document.visibilityState === "hidden") return;
      ganti(1);
    }, INTERVAL_OTOMATIS_MS);
    return () => window.clearInterval(id);
  }, [otomatisAktif, ganti]);

  function selesaiGeser(_event: unknown, info: PanInfo) {
    const arah = arahGantiLembar(info.offset.x, info.velocity.x);
    if (arah !== 0) ganti(arah, info.offset.x);
  }

  const varian: Variants = {
    masuk: { opacity: 0, x: 16, rotate: 1 },
    diam: {
      opacity: 1,
      x: 0,
      rotate: 0,
      // Pegas, bukan durasi: lembar terasa punya berat dan mengendap, dan
      // pegas otomatis melanjutkan dari posisi jari saat dilepas.
      transition: kurangi
        ? { duration: 0 }
        : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
    },
    keluar: (kustom: KustomLembar) => ({
      opacity: 0,
      // Dua cara pergi. Dari ketukan: menyelinap ke bawah-kanan, ke tempat
      // tumpukan. Dari geseran: melanjutkan arah lemparan jari, jadi terasa
      // seperti dilempar, bukan ditarik kembali.
      x: kustom.lempar === 0 ? 16 : kustom.lempar * 2.2,
      rotate: kustom.lempar === 0 ? 1 : kustom.lempar / 28,
      scale: kustom.lempar === 0 ? 1 : 0.96,
      // Berdurasi tetap, BUKAN pegas: `mode="wait"` menahan lembar baru selama
      // ini berjalan, jadi pegas 400ms akan terasa seperti jeda kosong.
      transition: { duration: kurangi ? 0 : 0.16, ease: "easeIn" },
    }),
  };

  return (
    <Tilt className="mr-2 mb-2">
      {/* Dua lembar kosong di belakang: kedalaman dibangun dari tumpukan,
          bukan bayangan. Sengaja TANPA teks — lembar yang bergeser 6–12px
          akan memperlihatkan potongan tepinya, dan teks di situ akan
          terpotong di tengah kata. */}
      <div
        aria-hidden
        className="absolute inset-0 translate-x-3 translate-y-3 rotate-1 border-2 border-border bg-card motion-safe:animate-sheet"
        style={{ animationDelay: "120ms" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-[0.5deg] border-2 border-border bg-card motion-safe:animate-sheet"
        style={{ animationDelay: "60ms" }}
      />
      {/* `animate-sheet` (gerak saat halaman dimuat) dipasang di PEMBUNGKUS,
          bukan di lembar itu sendiri. Animasi itu mengunci `transform` DAN
          `opacity` dengan `fill-mode: both`, jadi apa pun yang ditulis
          `motion` ke elemen yang sama tidak akan pernah terlihat. Dengan
          pemisahan ini keduanya berjalan berdampingan. */}
      <div className="motion-safe:animate-sheet">
        <AnimatePresence mode="wait" initial={false} custom={{ lempar }}>
          <motion.figure
            key={indeks}
            custom={{ lempar }}
            variants={varian}
            initial="masuk"
            animate="diam"
            exit="keluar"
            drag={bisaGanti && !kurangi ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            // Tanpa ini, lembar yang dilepas melanjutkan momentum jari lalu
            // terpental balik — terlihat seperti memantul, bukan mengendap.
            dragMomentum={false}
            dragTransition={{ bounceStiffness: 520, bounceDamping: 34 }}
            onDragStart={() => {
              sedangGeser.current = true;
            }}
            onDragEnd={selesaiGeser}
            // Ketukan dideteksi dari `pointerup`, BUKAN `onClick` dan BUKAN
            // `onTap`. Dua-duanya sudah dicoba dan gagal, terukur di peramban:
            // (a) `click` terpicu SEBELUM `onDragEnd`, jadi penanda "sudah
            //     digeser" selalu terlambat → satu geseran = dua pergantian;
            // (b) `onTap` milik `motion` TIDAK dibatalkan oleh drag → geseran
            //     juga menghasilkan satu pergantian tambahan.
            // `pointerup` di sini aman karena `sedangGeser` dipasang di
            // `onDragStart` (saat gerakan melewati ambang drag), bukan di
            // `onDragEnd`, sehingga urutan pemanggilan tidak lagi menentukan.
            onPointerDownCapture={() => {
              sedangGeser.current = false;
              // Menyentuh lembar = mengambil alih kendali. Auto-rotate berhenti
              // dan tidak menyalakan sendiri lagi (DESIGN.md §6).
              setSudahDisentuh(true);
            }}
            onPointerUp={(event) => {
              // Hanya tombol utama. Klik kanan/tengah tidak boleh memutar
              // lembar; tanpa pagar ini menu konteks terasa "mengganti halaman".
              if (event.button !== 0) return;
              if (!sedangGeser.current) ganti(1);
            }}
            onPointerCancel={() => {
              // Jari yang mulai menggulir halaman memicu `pointercancel`, bukan
              // `pointerup`. Tandai sebagai geseran supaya sentuhan itu tidak
              // dihitung sebagai ketukan.
              sedangGeser.current = true;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSudahDisentuh(true);
                ganti(1);
              }
            }}
            // Fokus keyboard juga menghentikan auto-rotate. Bukan kehati-hatian
            // berlebihan: `AnimatePresence` memasang ulang lembar setiap indeks
            // berganti, jadi tanpa ini pengguna keyboard kehilangan posisi
            // fokusnya tiap 6 detik.
            onFocus={() => setSudahDisentuh(true)}
            role={bisaGanti ? "button" : undefined}
            tabIndex={bisaGanti ? 0 : undefined}
            aria-label={
              bisaGanti
                ? `Contoh laporan ${indeks + 1} dari ${jumlah}. Geser atau ketuk untuk melihat contoh berikutnya.`
                : undefined
            }
            className={cn(
              "relative touch-pan-y border-2 border-border bg-card",
              bisaGanti && "cursor-grab select-none active:cursor-grabbing",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-border px-4 py-3">
              <span className="font-heading text-sm">Lembar laporan harian</span>
              {/* Cap tidak perlu `key` sendiri: `AnimatePresence` sudah memasang
                  ulang SELURUH lembar setiap `indeks` berganti, jadi
                  `animate-stamp` otomatis diputar dari awal. Jeda 420ms hanya
                  untuk pemutaran PERTAMA, supaya cap menyusul lembar yang
                  sedang "diletakkan" saat halaman dimuat; sesudahnya cukup
                  menunggu lembar baru mendarat. */}
              <span
                className="inline-flex motion-safe:animate-stamp"
                style={{ animationDelay: indeks === 0 ? "420ms" : "170ms" }}
              >
                <Stamp tone="good">Terkirim</Stamp>
              </span>
            </div>
            <p className="border-b-2 border-border px-4 py-2 text-xs text-muted-foreground">
              {aktif.tanggal}
            </p>
            <div className="space-y-4 p-4">
              {aktif.kolom.map((kolom) => (
                <div key={kolom.label}>
                  <p className="font-heading text-xs text-muted-foreground">
                    {kolom.label}
                  </p>
                  <p className="mt-1 text-sm leading-snug">{kolom.isi}</p>
                </div>
              ))}
            </div>
            {/* Ketentuan portal ditaruh di kaki lembar, bukan sebagai strip
                angka terpisah di bawah hero. Dengan begitu empat fakta ini
                menempel pada benda yang memang dikirim. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t-2 border-border px-4 py-3">
              {fakta.map((item) => (
                <div key={item.label}>
                  <dt className="text-[0.6875rem] text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="font-heading text-sm tabular-nums">{item.nilai}</dd>
                </div>
              ))}
            </dl>
            {/* Sudut terlipat (dog-ear): satu SVG 28×28 di pojok kanan-bawah.
                (a) segitiga `fill-background` = pojok yang terlipat, jadi yang
                    terlihat adalah halaman di belakangnya; sekaligus memutus
                    garis tepi lembar di situ;
                (b) segitiga `fill-card` = muka lipatan, sewarna kertas;
                (c) dua garis pada sisi potongannya + satu garis lipatan.
                Ketiganya yang membuat bentuk ini terbaca sebagai lipatan, bukan
                sekadar sudut terpotong. Tetap tanpa gradien dan tanpa blur. */}
            <svg
              aria-hidden
              viewBox="0 0 28 28"
              className="pointer-events-none absolute -right-0.5 -bottom-0.5 size-7"
            >
              <polygon points="0,28 28,0 28,28" className="fill-background" />
              <polygon points="0,0 28,0 0,28" className="fill-card" />
              <line
                x1="1"
                y1="1"
                x2="27"
                y2="1"
                strokeWidth="2"
                className="stroke-border"
              />
              <line
                x1="1"
                y1="1"
                x2="1"
                y2="27"
                strokeWidth="2"
                className="stroke-border"
              />
              <line
                x1="0"
                y1="28"
                x2="28"
                y2="0"
                strokeWidth="2"
                className="stroke-border"
              />
            </svg>
          </motion.figure>
        </AnimatePresence>
      </div>
    </Tilt>
  );
}
