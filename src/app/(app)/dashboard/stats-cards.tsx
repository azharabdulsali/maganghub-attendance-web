import { Card, CardContent } from "@/components/ui/card";
import type { Tone } from "@/lib/admin";

// Kartu statistik dashboard — komponen tampilan murni (tanpa state/fetch),
// menerima angka yang sudah dihitung di server. Lihat SPEC.md §5.6.
//
// Semua ikon digambar dengan CSS/SVG inline alih-alih lucide-react supaya
// berkas ini tidak perlu menambah impor apa pun.

export type Stat = {
  label: string;
  value: string;
  hint?: string;
  /** "good" menghijaukan angka, "bad" memerahkan, kosong = netral. */
  tone?: Tone;
};

const TONE_CLASS: Record<Tone, string> = {
  good: "text-emerald-600",
  bad: "text-destructive",
  neutral: "text-foreground",
};

export default function StatsCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-foreground/60">{stat.label}</span>
            <span
              className={`font-heading text-2xl ${TONE_CLASS[stat.tone ?? "neutral"]}`}
            >
              {stat.value}
            </span>
            {stat.hint && (
              <span className="text-xs text-foreground/50">{stat.hint}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
