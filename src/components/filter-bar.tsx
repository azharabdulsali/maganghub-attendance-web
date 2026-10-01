"use client";

import { useRef } from "react";

import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Sekumpulan filter dropdown yang dikirim sebagai SATU form GET.
//
// Kenapa satu form, bukan satu form per dropdown? Karena kalau tiap dropdown
// punya form sendiri, memilih "Rentang waktu" akan MENGIRIM HANYA rentang dan
// menghapus filter status yang sedang aktif (dan sebaliknya). Satu form
// memastikan semua filter ikut terkirim bersama, sesuai yang dilihat pengguna.
//
// Kenapa <form method="get"> dan bukan router.push? Karena form GET adalah
// jalur submit paling sederhana: browser menyusun query string sendiri, tanpa
// kita merakit URL manual.
//
// ⚠️ SENGAJA TANPA tombol "Terapkan" (`onChange` langsung mengirim form).
// Alasannya: dengan auto-submit, tombol itu tak pernah perlu diklik, jadi ia
// cuma jadi kontrol mati yang membingungkan. MENGHAPUSNYA PUNYA KONSEKUENSI:
// filter kini BERGANTUNG pada JavaScript. Bila JS gagal dimuat, mengubah
// dropdown tidak mengirim apa pun. Trade-off ini diterima karena seluruh
// halaman admin/dashboard/riwayat sudah bergantung pada JS di banyak tempat
// (dialog, toast, dsb.), dan satu tombol tambahan yang selalu terlewat justru
// lebih membingungkan daripada kehilangan jalur no-JS. Bila suatu saat jalur
// no-JS dibutuhkan lagi, kembalikan tombol submit di sini.
export type FilterOption = { value: string; label: string };
export type FilterFieldDef = {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
};

export default function FilterBar({ fields }: { fields: FilterFieldDef[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      className="flex flex-wrap items-end gap-3"
    >
      {fields.map((field) => {
        const id = `filter-${field.name}`;
        return (
          <div key={field.name} className="flex flex-col gap-1">
            <Label
              htmlFor={id}
              className="text-xs font-heading text-foreground/50"
            >
              {field.label}
            </Label>
            <Select
              id={id}
              name={field.name}
              defaultValue={field.value}
              className="min-w-[8.5rem]"
              // Ganti nilai = langsung kirim seluruh form.
              onChange={() => formRef.current?.requestSubmit()}
            >
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
    </form>
  );
}
