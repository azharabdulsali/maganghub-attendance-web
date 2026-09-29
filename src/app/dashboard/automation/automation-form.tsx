"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeNextRun, formatSchedule } from "@/lib/automation";

type Props = {
  hasExisting: boolean;
  initialEnabled: boolean;
  initialHour: number;
  initialMinute: number;
  initialWebhookKey: string | null;
};

export default function AutomationForm({
  hasExisting,
  initialEnabled,
  initialHour,
  initialMinute,
  initialWebhookKey,
}: Props) {
  const router = useRouter();

  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(String(initialHour));
  const [minute, setMinute] = useState(String(initialMinute));
  const [webhookKey, setWebhookKey] = useState<string | null>(initialWebhookKey);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tersalin, setTersalin] = useState(false);

  // Pratinjau "jadwal berikutnya" dihitung klien memakai helper murni yang
  // sama dengan server — hanya untuk tampilan, bukan logika penentu.
  const nextRun = useMemo(() => {
    const h = Number(hour);
    const m = Number(minute);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    return describeNextRun(new Date(), h, m);
  }, [hour, minute]);

  const webhookUrl = webhookKey
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/cron/submit?key=${webhookKey}`
    : null;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled,
          hour: Number(hour),
          minute: Number(minute),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        webhookKey?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan pengaturan.");
        return;
      }

      if (data.webhookKey) setWebhookKey(data.webhookKey);
      setSukses("Pengaturan otomasi tersimpan.");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  async function salinUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setError("Tidak bisa menyalin otomatis. Salin tautan secara manual.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jadwal harian</CardTitle>
          <CardDescription>
            Layanan cron akan menembak webhook pada jam ini setiap hari.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={simpan} className="space-y-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Aktifkan otomasi
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="hour">Jam (0–23)</Label>
                <Input
                  id="hour"
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => setHour(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minute">Menit (0–59)</Label>
                <Input
                  id="minute"
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  className="w-24"
                />
              </div>
              <p className="text-sm text-foreground/70">
                {nextRun ? `Berikutnya: ${nextRun}` : "Jam/menit tidak sah."}
              </p>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : hasExisting ? "Simpan perubahan" : "Aktifkan"}
            </Button>

            {error && (
              <p className="rounded-base border-2 border-border px-3 py-2 text-sm text-foreground">
                {error}
              </p>
            )}
            {sukses && (
              <p className="rounded-base border-2 border-border bg-main px-3 py-2 text-sm text-main-foreground">
                {sukses}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {webhookUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook untuk cron</CardTitle>
            <CardDescription>
              Tempel URL ini ke layanan cron Anda (mis. cron-job.org), jadwalkan
              sekali sehari. Jangan bagikan — siapa pun yang tahu URL ini bisa
              memicu pengiriman.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block break-all rounded-base border-2 border-border px-3 py-2 text-xs">
              {webhookUrl}
            </code>
            <div className="flex flex-wrap gap-3">
              <Button variant="neutral" onClick={salinUrl}>
                {tersalin ? "Tersalin!" : "Salin URL"}
              </Button>
            </div>
            <p className="text-xs text-foreground/60">
              Jadwal: {formatSchedule(Number(hour) || 0, Number(minute) || 0)} WIB
              setiap hari.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

