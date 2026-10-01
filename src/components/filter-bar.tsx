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
// Kenapa <form method="get"> dan bukan router.push? Inilah yang membuat filter
// tetap berfungsi TANPA JavaScript: browser mengirimkan query string sendiri.
// JavaScript hanya "percepatan" — begitu nilai berubah, form langsung dikirim.
// Tombol "Terapkan" selalu ada sebagai jalur jelas untuk keyboard/screen reader
// dan jaring pengaman bila JS gagal dimuat.
export type FilterOption = { value: string; label: string };
export type FilterFieldDef = {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
};

export default function FilterBar({
  fields,
  submitLabel = "Terapkan",
}: {
  fields: FilterFieldDef[];
  submitLabel?: string;
}) {
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
              // Ganti nilai = langsung kirim seluruh form. Tanpa baris ini
              // filter tetap jalan, hanya perlu menekan "Terapkan".
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

      <button
        type="submit"
        className="h-10 shrink-0 rounded-base border-2 border-border bg-secondary-background px-3 text-xs font-heading text-foreground transition-colors hover:bg-background"
      >
        {submitLabel}
      </button>
    </form>
  );
}
