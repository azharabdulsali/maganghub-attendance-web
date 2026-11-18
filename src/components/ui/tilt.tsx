"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Memiringkan isinya mengikuti kursor dengan perspektif 3D.
 *
 * Kenapa ada, padahal DESIGN.md memilih MOTION 1: lembar laporan di landing
 * adalah satu-satunya "benda" di aplikasi ini, dan kemiringan beberapa derajat
 * membuatnya terbaca sebagai kertas yang dipegang, bukan kotak di layar.
 * Batasnya sengaja ketat supaya tidak berubah menjadi tontonan:
 *
 * - **Hanya penunjuk presisi.** `pointerType !== "mouse"` ditolak, jadi jari
 *   yang menyentuh sambil menggulir tidak memutar kartu.
 * - **Mati saat pengguna memilih "kurangi gerakan".** Diperiksa pada setiap
 *   gerakan, bukan sekali saat dipasang, supaya perubahan pengaturan sistem
 *   langsung berlaku tanpa memuat ulang halaman.
 * - **Kemiringan kecil.** `MAX_TILT_DEG` 6 derajat, cukup untuk memberi
 *   kedalaman tetapi tidak sampai membuat teks laporan sulit dibaca.
 *
 * Transform ditulis LANGSUNG ke node, bukan lewat state React. `pointermove`
 * terpicu puluhan kali per detik; setiap `setState` akan merender ulang seluruh
 * isi kartu hanya untuk memindahkan satu properti CSS.
 */
const MAX_TILT_DEG = 6;

/** Gerakan hanya untuk pengguna yang tidak memintanya dikurangi. */
function bolehMemiringkan(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // Layar sentuh melaporkan `hover: none`, jadi jari yang menyeret tidak sampai
  // ke sini meski peramban menyebut jenis penunjuknya "pen".
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function Tilt({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    if (event.pointerType !== "mouse") return;
    if (!bolehMemiringkan()) return;

    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // -0.5..0.5 dari titik tengah, jadi kursor di tengah tidak memiringkan apa pun.
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    node.style.transform = `rotateX(${(-y * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(
      x * MAX_TILT_DEG
    ).toFixed(2)}deg)`;
  }

  function handlePointerLeave() {
    const node = ref.current;
    if (!node) return;
    // Dikosongkan (bukan diisi `none`) agar transisi kembali memakai nilai awal
    // dari CSS, bukan nilai yang dipaksakan lewat atribut style.
    node.style.transform = "";
  }

  return (
    /* `perspective` dipasang di pembungkus, bukan di elemen yang berputar:
       tanpa itu `rotateX`/`rotateY` hanya terlihat seperti gepeng, bukan
       seperti kertas yang dimiringkan. */
    <div className={cn("[perspective:1200px]", className)}>
      <div
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        className="relative transition-transform duration-200 ease-out motion-reduce:transition-none"
      >
        {children}
      </div>
    </div>
  );
}
