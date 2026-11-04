"use client";

// src/app/(app)/repos/repo-form.tsx: form pengaturan repo git (client component).
//
// Prinsip yang dipegang:
//   - Token hanya dikirim SAAT menyimpan, tidak pernah ditampilkan kembali oleh
//     server. Kolom input dikosongkan setelah simpan berhasil supaya token tidak
//     tertinggal di memori browser.
//   - Karena PUT mewajibkan token, menekan "Perbarui repo" berarti mengganti
//     token atau menempel ulang token yang sama. UI menyatakannya terang-terangan
//     agar tidak ada yang mengira token lama otomatis dipakai ulang.
//   - Tombol "Uji ambil commit" memanggil `/api/repos/preview`, supaya pengguna
//     tahu tokennya benar sebelum mengandalkan fitur ini untuk laporan.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Provider = "GITHUB" | "GITLAB";

interface RepoFormProps {
  featureEnabled: boolean;
  hasExisting: boolean;
  existingProvider: Provider | null;
  existingRepoPath: string | null;
  existingBranch: string | null;
  hasToken: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
}

interface CommitView {
  shortId: string;
  title: string;
  author: string;
  committedAt: string;
  url?: string;
}

interface PreviewState {
  loading: boolean;
  ok: boolean | null;
  message: string | null;
  date: string | null;
  commits: CommitView[];
  learningNeedsReview: boolean;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  GITHUB: "GitHub",
  GITLAB: "GitLab",
};

/**
 * Petunjuk membuat token, per penyedia.
 *
 * Diambil dari dokumentasi resmi GitHub/GitLab (diperiksa 2026-06). Tautan
 * `createUrl` sengaja membuka halaman pembuatan token LANGSUNG, bukan halaman
 * dokumentasi, karena pengguna yang sedang mengisi form butuh satu klik ke
 * tempat yang benar — bukan membaca tutorial dulu.
 *
 * Keduanya menyebut izin BACA saja: aplikasi ini tidak pernah menulis ke repo
 * siapa pun (AGENTS.md §2 batas (a)), jadi token yang lebih luas hanya menambah
 * risiko tanpa menambah manfaat.
 */
const TOKEN_HELP: Record<
  Provider,
  { steps: string[]; createUrl: string; createLabel: string; scopeNote: string }
> = {
  GITHUB: {
    steps: [
      "Buka tautan di bawah, lalu pilih Generate new token (fine-grained).",
      "Pada Repository access, pilih Only select repositories dan pilih repo yang ingin dipantau.",
      "Buka bagian Permissions → Repository permissions, cari Contents, lalu pilih Read-only.",
      "Klik Generate token, lalu salin token yang muncul (hanya ditampilkan sekali).",
    ],
    createUrl: "https://github.com/settings/personal-access-tokens/new",
    createLabel: "Buat token GitHub",
    scopeNote: "Izin yang cukup: Contents → Read-only.",
  },
  GITLAB: {
    steps: [
      "Buka tautan di bawah (avatar → Edit profile → Access → Personal access tokens).",
      "Isi Name dan Expiration date.",
      "Pilih Only specific groups or projects I have access to, lalu tambahkan repo Anda.",
      "Pada Add resource permissions, centang Projects → Commit → Read.",
      "Klik Generate token, lalu salin token yang muncul (hanya ditampilkan sekali).",
    ],
    createUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    createLabel: "Buat token GitLab",
    scopeNote:
      "Izin yang cukup: Commit → Read. Kalau yang muncul adalah token lama (Legacy token) dengan daftar Scopes, cukup centang read_api.",
  },
};

/**
 * Ambil `owner/repo` dari URL clone yang salah tempel.
 *
 * Pengguna hampir selalu menyalin URL dari tombol "Clone" GitLab/GitHub,
 * padahal kolom ini minta jalur polos. Dua bentuk yang paling sering:
 *   git@gitlab.com:azhar/jadwal-app.git
 *   https://gitlab.com/azhar/jadwal-app.git
 *
 * Mengembalikan `null` bila teks sudah berupa jalur polos (tidak perlu diubah),
 * supaya pemanggil bisa membedakan "bukan URL" dari "URL yang berhasil diurai".
 * Sisa `.git` dibuang karena bukan bagian dari nama repo di API.
 */
export function repoPathFromCloneUrl(teks: string): string | null {
  const t = teks.trim();
  if (!t) return null;

  // Bentuk SSH: `git@host:owner/repo.git`
  const ssh = /^[\w.-]+@[^:/\s]+:(.+)$/.exec(t);
  let jalur: string | null = ssh ? ssh[1] : null;

  // Bentuk URL: `https://host/owner/repo.git` (host apa pun, agar GitLab
  // self-hosted tetap terbaca).
  if (!jalur && /^https?:\/\//i.test(t)) {
    try {
      const url = new URL(t);
      jalur = decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  }

  if (!jalur) return null;

  const bersih = jalur
    .replace(/^\/+/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  return bersih.includes("/") ? bersih : null;
}

/** Format waktu ke tanggal-jam WIB yang mudah dibaca. */
function formatWib(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const PREVIEW_KOSONG: PreviewState = {
  loading: false,
  ok: null,
  message: null,
  date: null,
  commits: [],
  learningNeedsReview: false,
};

export default function RepoForm({
  featureEnabled,
  hasExisting,
  existingProvider,
  existingRepoPath,
  existingBranch,
  hasToken,
  lastFetchedAt,
  lastError,
}: RepoFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [provider, setProvider] = useState<Provider>(
    existingProvider ?? "GITHUB",
  );
  const [repoPath, setRepoPath] = useState(existingRepoPath ?? "");
  const [branch, setBranch] = useState(existingBranch ?? "main");
  const [token, setToken] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmHapus, setConfirmHapus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewState>(PREVIEW_KOSONG);

  // Token wajib diisi baik saat pertama kali maupun saat memperbarui, karena
  // server memang tidak bisa memakai token lama tanpa dikirim ulang oleh
  // pengguna. Ini disengaja: token tidak pernah dibaca balik ke browser.
  const bisaSimpan = repoPath.trim().length > 0 && token.trim().length > 0;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!bisaSimpan || saving) return;

    setSaving(true);
    setError(null);
    setSukses(null);

    try {
      const res = await fetch("/api/repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          repoPath: repoPath.trim(),
          branch: branch.trim() || "main",
          token: token.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan repo.");
        return;
      }

      setToken("");
      setSukses("Repo tersimpan.");
      toast.success("Repo git tersimpan.");
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  async function hapus() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/repos", { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Gagal menghapus repo.");
        return;
      }
      setConfirmHapus(false);
      setToken("");
      setRepoPath("");
      setPreview(PREVIEW_KOSONG);
      toast.success("Repo git dihapus beserta tokennya.");
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setDeleting(false);
    }
  }

  async function ujiAmbil() {
    setPreview((p) => ({ ...p, loading: true, message: null }));
    try {
      const res = await fetch("/api/repos/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        message?: string;
        date?: string;
        commits?: CommitView[];
        draft?: { learningNeedsReview?: boolean } | null;
      };

      if (!res.ok) {
        setPreview({
          ...PREVIEW_KOSONG,
          ok: false,
          message: data.error ?? "Gagal mengambil commit.",
        });
        return;
      }

      setPreview({
        loading: false,
        ok: Boolean(data.ok),
        message:
          data.message ??
          (data.commits?.length
            ? `${data.commits.length} commit ditemukan.`
            : "Tidak ada commit pada hari itu."),
        date: data.date ?? null,
        commits: data.commits ?? [],
        learningNeedsReview: Boolean(data.draft?.learningNeedsReview),
      });
      router.refresh();
    } catch {
      setPreview({
        ...PREVIEW_KOSONG,
        ok: false,
        message:
          "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
      });
    }
  }

  if (!featureEnabled) {
    return (
      <Message tone="neutral">
        Fitur commit git sedang dinonaktifkan oleh pengelola aplikasi. Isi
        laporan secara manual atau lewat{" "}
        <Link href="/report-templates" className="underline">
          template laporan
        </Link>{" "}
        sampai fitur ini diaktifkan kembali.
      </Message>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={simpan} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="provider">Penyedia</Label>
          <select
            id="provider"
            className="w-full rounded-base border-2 border-border bg-background px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
          >
            <option value="GITHUB">GitHub</option>
            <option value="GITLAB">GitLab</option>
          </select>
          <p className="text-xs text-foreground/60">{TOKEN_HELP[provider].scopeNote}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="repoPath">Repo</Label>
          <Input
            id="repoPath"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onBlur={() => {
              // Rapikan otomatis HANYA saat fokus berpindah, bukan setiap
              // ketikan — kalau dirapikan sambil mengetik, pengguna yang
              // mengetik manual akan melihat teksnya berubah di tengah jalan.
              const rapi = repoPathFromCloneUrl(repoPath);
              if (rapi) setRepoPath(rapi);
            }}
            placeholder="budi/proyek-magang"
            autoComplete="off"
            required
          />
          <p className="text-xs text-foreground/60">
            Format <code>owner/nama-repo</code>. Untuk GitLab boleh bertingkat,
            mis. <code>grup/sub/proyek</code>. Tempel URL clone juga boleh —
            akan dirapikan otomatis.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <Input
            id="branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="token">Token akses</Label>
          <Input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              hasToken ? "•••••••• (token lama tidak ditampilkan)" : "ghp_…"
            }
            autoComplete="off"
            required
          />
          <p className="text-xs text-foreground/60">
            Token disimpan terenkripsi dan tidak pernah ditampilkan lagi, bahkan
            kepada Anda. Hanya dipakai untuk membaca commit. Untuk memperbarui
            pengaturan, tempel ulang token yang sama atau token baru.
          </p>

          {/*
            Petunjuk pembuatan token ditaruh DI DALAM kolom token, bukan di atas
            form: pengguna baru menyadari butuh token saat sampai di sini.
            Detail dibungkus <details> supaya pengguna lama yang sudah punya
            token tidak terganggu, tapi tetap bisa dibuka tanpa pindah halaman.
          */}
          <details className="rounded-base border-2 border-border p-3">
            <summary className="cursor-pointer text-sm font-base">
              Belum punya token {PROVIDER_LABEL[provider]}?
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-foreground/70">
              {TOKEN_HELP[provider].steps.map((langkah) => (
                <li key={langkah}>{langkah}</li>
              ))}
            </ol>
            <a
              href={TOKEN_HELP[provider].createUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm underline underline-offset-4"
            >
              {TOKEN_HELP[provider].createLabel} (buka tab baru)
            </a>
            <p className="mt-2 text-xs text-foreground/60">
              Memberi izin lebih luas dari yang disebutkan tidak membuat fitur
              ini bekerja lebih baik, dan hanya menambah risiko bila token
              bocor. Token Anda hanya untuk repo ini — jangan pakai token kerja
              yang punya akses ke banyak repo.
            </p>
            <p className="mt-1 text-xs text-foreground/60">
              Di GitLab, token hanya bisa membaca repo tempat Anda sendiri
              punya akses. Kalau muncul pesan repo tidak ditemukan, pastikan Anda
              sudah menjadi anggota repo tersebut (minimal peran Reporter), bukan
              hanya mengubah izin token.
            </p>
          </details>
        </div>

        {error && <Message tone="bad">{error}</Message>}
        {sukses && <Message tone="good">{sukses}</Message>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!bisaSimpan || saving}>
            {saving
              ? "Menyimpan…"
              : hasExisting
                ? "Perbarui repo"
                : "Simpan repo"}
          </Button>

          {hasExisting && (
            <>
              <Button
                type="button"
                variant="neutral"
                onClick={ujiAmbil}
                disabled={preview.loading}
              >
                {preview.loading ? "Mengambil…" : "Uji ambil commit"}
              </Button>
              <Button
                type="button"
                variant="neutral"
                onClick={() => setConfirmHapus(true)}
                disabled={deleting}
              >
                Hapus repo
              </Button>
            </>
          )}
        </div>
      </form>

      <aside className="space-y-4 text-sm">
        <div className="rounded-base border-2 border-border p-4">
          <h2 className="font-heading text-base">Status</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-foreground/60">Terhubung</dt>
              <dd>
                {hasExisting
                  ? `${PROVIDER_LABEL[existingProvider ?? provider]} · ${existingRepoPath ?? "—"}`
                  : "Belum"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-foreground/60">Token</dt>
              <dd>
                <Badge tone={hasToken ? "good" : "neutral"}>
                  {hasToken ? "Tersimpan" : "Belum ada"}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-foreground/60">Terakhir diambil</dt>
              <dd>{formatWib(lastFetchedAt)}</dd>
            </div>
          </dl>

          {lastError && (
            <div className="mt-3">
              <Message tone="bad">{lastError}</Message>
            </div>
          )}
        </div>

        {preview.ok !== null && (
          <div className="rounded-base border-2 border-border p-4">
            <h2 className="font-heading text-base">
              Commit {preview.date ? `(${preview.date})` : ""}
            </h2>

            {preview.message && (
              <div className="mt-2">
                <Message tone={preview.ok ? "neutral" : "bad"}>
                  {preview.message}
                </Message>
              </div>
            )}

            {preview.commits.length > 0 && (
              <ul className="mt-3 space-y-2">
                {preview.commits.map((c) => (
                  <li key={c.shortId} className="text-xs">
                    <code className="text-foreground/60">{c.shortId}</code>{" "}
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                  </li>
                ))}
              </ul>
            )}

            {preview.learningNeedsReview && (
              <p className="mt-3 text-xs text-foreground/60">
                Commit hanya menjadi bahan kolom <strong>aktivitas</strong>.
                Kolom <strong>Pembelajaran yang Diperoleh</strong> tetap perlu
                Anda tulis sendiri di halaman laporan.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-foreground/60">
          Fitur ini hanya membaca commit. Aplikasi tidak pernah membuat commit
          atau push ke repo Anda.
        </p>
      </aside>

      <ConfirmDialog
        open={confirmHapus}
        onOpenChange={setConfirmHapus}
        title="Hapus repo git?"
        description="Token yang tersimpan ikut dihapus permanen. Fitur draf dari commit berhenti sampai Anda menghubungkan repo lagi."
        confirmLabel={deleting ? "Menghapus…" : "Hapus"}
        confirmVariant="danger"
        onConfirm={hapus}
      />
    </div>
  );
}
