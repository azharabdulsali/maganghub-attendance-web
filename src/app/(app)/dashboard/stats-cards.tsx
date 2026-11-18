import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/admin";

// Ringkasan angka dashboard.
//
// Disajikan sebagai daftar "label — angka" di dalam satu bingkai, seperti baris
// neraca pada buku besar, BUKAN sebagai deretan angka besar dengan label kecil
// di bawahnya. Pola "angka raksasa + label" bisa dipakai halaman apa pun dan
// membuat keempat angka saling bersaing; di sini label dibaca lebih dulu,
// angkanya menjawab. Angka memakai `tabular-nums` supaya lebarnya tidak
// bergeser saat nilainya berubah.

export type Stat = {
  label: string;
  value: string;
  hint?: string;
  /** "good" menghijaukan angka, "bad" memerahkan, kosong = netral. */
  tone?: Tone;
};

const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  bad: "text-destructive",
  neutral: "text-foreground",
};

export default function StatsCards({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mb-6 grid border-2 border-border bg-card sm:grid-cols-2">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "flex items-baseline justify-between gap-4 px-4 py-3",
            index > 0 && "border-t-2 border-border",
            index % 2 === 1 && "sm:border-l-2",
            index < 2 && "sm:border-t-0",
          )}
        >
          <dt className="min-w-0 text-xs text-muted-foreground">
            {stat.label}
            {stat.hint && (
              <span className="mt-0.5 block text-[0.6875rem]">
                {stat.hint}
              </span>
            )}
          </dt>
          <dd
            className={cn(
              "shrink-0 font-heading text-xl leading-none tabular-nums",
              TONE_CLASS[stat.tone ?? "neutral"],
            )}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
