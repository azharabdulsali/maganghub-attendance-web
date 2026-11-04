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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { repoPathFromCloneUrl } from "./repo-path";

// Diekspor ulang agar berkas tes lama (`repo-path-from-clone-url.test.ts`)
// tetap bisa mengimpor dari sini; implementasinya kini di `repo-path.ts`.
export { repoPathFromCloneUrl };


type Provider = "GITHUB" | "GITLAB";

interface RepoFormProps {
  featureEnabled: boolean;
  hasExisting: boolean;
  existingProvider: Provider | null;
  existingRepoPath: string | null;
  existingBranch: string | null;
  hasToken: boolean;
  initialEnabled: boolean;
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
  /**
   * Asal saran kolom "Pembelajaran": `DERIVED` bila diturunkan dari bukti
   * jenis pekerjaan di commit, `EMPTY` bila tidak ada bukti sehingga kolom
   * harus ditulis sendiri. `null` saat belum ada draf.
   */
  learningSource: "DERIVED" | "EMPTY" | null;
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
  learningSource: null,
};

export default function RepoForm({
  featureEnabled,
  hasExisting,
  existingProvider,
  existingRepoPath,
  existingBranch,
  hasToken,
  initialEnabled,
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
  // Sakelar pemakaian commit. Default-nya mengikuti nilai tersimpan; untuk
  // pengguna yang belum punya repo nilainya false dan sakelarnya tidak
  // ditampilkan (tidak ada yang bisa diaktifkan).
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggling, setToggling] = useState(false);
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
        draft?: {
          learningNeedsReview?: boolean;
          learningSource?: "DERIVED" | "EMPTY";
        } | null;
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
        learningSource: data.draft?.learningSource ?? null,
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

  async function toggleEnabled(next: boolean) {
    if (toggling) return;
    // Optimistis: sakelar langsung bergerak supaya terasa responsif, lalu
    // dikembalikan bila server menolak. Tanpa ini, kegagalan jaringan akan
    // membuat sakelar tampak "nyangkut" dan pengguna mengira sudah tersimpan.
    const sebelumnya = enabled;
    setEnabled(next);
    setToggling(true);
    setError(null);
    setSukses(null);
    try {
      const res = await fetch("/api/repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        enabled?: boolean;
      };
      if (!res.ok) {
        setEnabled(sebelumnya);
        setError(data.error ?? "Gagal mengubah sakelar.");
        return;
      }
      setEnabled(data.enabled ?? next);
      toast.success(
        next
          ? "Commit akan dipakai sebagai bahan draf."
          : "Commit tidak akan dipakai sampai dinyalakan lagi.",
      );
      router.refresh();
    } catch {
      setEnabled(sebelumnya);
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setToggling(false);
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
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <KartuRepo
          provider={provider}
          setProvider={setProvider}
          repoPath={repoPath}
          setRepoPath={setRepoPath}
          branch={branch}
          setBranch={setBranch}
          token={token}
          setToken={setToken}
          hasExisting={hasExisting}
          hasToken={hasToken}
          saving={saving}
          bisaSimpan={bisaSimpan}
          error={error}
          sukses={sukses}
          previewLoading={preview.loading}
          onSimpan={simpan}
          onUji={() => void ujiAmbil()}
        />

        {/* Kartu 2: sakelar. Penyimpanannya SENDIRI (PUT `action: "toggle"`),
            tanpa token — karena itu dipisah dari form di atas. */}
        {hasExisting && (
          <Card size="sm">
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="repo-enabled">
                    Pakai commit sebagai bahan draf
                  </Label>
                  <p className="text-xs text-foreground/70">
                    {enabled
                      ? "Aktif. Saat menyusun draf, commit hari itu (zona WIB) ikut dipakai sebagai bahan."
                      : "Nonaktif. Repo tetap tersimpan, tapi tidak ada commit yang diambil sampai dinyalakan."}
                  </p>
                </div>
                <Switch
                  id="repo-enabled"
                  checked={enabled}
                  onCheckedChange={(v) => void toggleEnabled(v)}
                  disabled={toggling}
                />
              </div>
              <p className="mt-3 text-xs text-foreground/60">
                Perubahan sakelar berlaku langsung — tidak perlu menempel ulang
                token atau menekan tombol simpan di atas.
              </p>
            </CardContent>
          </Card>
        )}

        {preview.ok !== null && <KartuHasilUji preview={preview} />}
      </div>

      <aside className="space-y-4 text-sm">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-xs">
              <div className="space-y-1 border-t-2 border-border pt-2">
                <dt className="text-foreground/60">Terhubung</dt>
                {/* `break-words` (bukan `break-all`): jalur repo GitLab bisa
                    sangat panjang dan dulu membungkus jadi kolom sempit di
                    samping label. Ditaruh di barisnya sendiri supaya muat,
                    dan `break-words` memotong di batas kata yang wajar. */}
                <dd className="break-words">
                  {hasExisting
                    ? `${PROVIDER_LABEL[existingProvider ?? provider]} · ${existingRepoPath ?? "—"}`
                    : "Belum"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-foreground/60">Token</dt>
                <dd>
                  <Badge tone={hasToken ? "good" : "neutral"}>
                    {hasToken ? "Tersimpan" : "Belum ada"}
                  </Badge>
                </dd>
              </div>
              <div className="space-y-1 border-t-2 border-border pt-2">
                <dt className="text-foreground/60">Terakhir diambil</dt>
                <dd>{formatWib(lastFetchedAt)}</dd>
              </div>
            </dl>

            {lastError && (
              <div className="mt-3">
                <Message tone="bad">{lastError}</Message>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aksi merusak dipisah jauh dari tombol simpan: tidak boleh
            bersebelahan dengan tombol yang sering ditekan. */}
        {hasExisting && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base">Lepas repo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-foreground/70">
                Menghapus repo dan token tersimpan. Draf dari commit berhenti
                sampai Anda menghubungkan repo lagi.
              </p>
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmHapus(true)}
                disabled={deleting}
              >
                Hapus repo
              </Button>
            </CardContent>
          </Card>
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

/** Kartu 3: hasil uji pengambilan commit. Murni tampilan, tanpa aksi simpan. */
function KartuHasilUji({ preview }: { preview: PreviewState }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">
          Hasil uji ambil commit
          {preview.date ? ` — ${preview.date}` : ""}
        </CardTitle>
        {preview.message && (
          <CardDescription className="text-foreground/70">
            {preview.message}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {preview.commits.length > 0 && (
          <ul className="divide-y-2 divide-border rounded-base border-2 border-border">
            {preview.commits.map((c) => (
              <li key={c.shortId} className="p-2 text-xs">
                <code className="text-foreground/60">{c.shortId}</code>{" "}
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
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
          <p className="text-xs text-foreground/60">
            Kolom <strong>Pembelajaran yang Diperoleh</strong>
            {preview.learningSource === "DERIVED" ? (
              <>
                {" "}
                disarankan dari <em>jenis pekerjaan</em> di commit Anda, jadi
                masih perlu Anda sesuaikan dengan apa yang benar-benar Anda
                pelajari.
              </>
            ) : (
              <>
                {" "}
                belum bisa disarankan karena commit hari itu tidak menunjukkan
                jenis pekerjaan yang jelas, jadi perlu Anda tulis sendiri.
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* Bagian tampilan disusun per Kartu karena penyimpanannya BERBEDA-BEDA */

/** Kartu 1: repo + token, disimpan bersama lewat satu tombol. */
function KartuRepo({
  provider,
  setProvider,
  repoPath,
  setRepoPath,
  branch,
  setBranch,
  token,
  setToken,
  hasExisting,
  hasToken,
  saving,
  bisaSimpan,
  error,
  sukses,
  previewLoading,
  onSimpan,
  onUji,
}: {
  provider: Provider;
  setProvider: (v: Provider) => void;
  repoPath: string;
  setRepoPath: (v: string) => void;
  branch: string;
  setBranch: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  hasExisting: boolean;
  hasToken: boolean;
  saving: boolean;
  bisaSimpan: boolean;
  error: string | null;
  sukses: string | null;
  previewLoading: boolean;
  onSimpan: (e: React.FormEvent) => void;
  onUji: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repo yang dipantau</CardTitle>
        <CardDescription className="text-foreground/70">
          {hasExisting
            ? "Mengubah pengaturan di sini mengganti pengaturan yang tersimpan."
            : "Hubungkan satu repo. Setelah tersimpan, uji dulu pengambilannya sebelum mengandalkannya untuk laporan."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSimpan} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="provider">
              Penyedia <span className="text-destructive">*</span>
            </Label>
            <NativeSelect
              id="provider"
              className="w-full"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <NativeSelectOption value="GITHUB">GitHub</NativeSelectOption>
              <NativeSelectOption value="GITLAB">GitLab</NativeSelectOption>
            </NativeSelect>
            <p className="text-xs text-foreground/60">
              {TOKEN_HELP[provider].scopeNote}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repoPath">
              Repo <span className="text-destructive">*</span>
            </Label>
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
              aria-describedby="repoPath-hint"
              required
            />
            <p id="repoPath-hint" className="text-xs text-foreground/60">
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
              aria-describedby="branch-hint"
            />
            <p id="branch-hint" className="text-xs text-foreground/60">
              Kosongkan untuk memakai <code>main</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">
              Token akses <span className="text-destructive">*</span>
            </Label>
            {/* PasswordInput, bukan Input biasa (docs/UI-LAYOUT.md §5b): token
                panjang mudah salah tempel, dan tanpa tombol "lihat" pengguna
                tidak punya cara memeriksanya sebelum menyimpan. */}
            <PasswordInput
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={hasToken ? "•••••••• (token tersimpan)" : "ghp_…"}
              autoComplete="off"
              aria-describedby="token-hint"
              required
            />
            <p id="token-hint" className="text-xs text-foreground/60">
              Disimpan terenkripsi dan tidak pernah ditampilkan lagi, bahkan
              kepada Anda. Hanya dipakai untuk membaca commit.
              {hasExisting && (
                <>
                  {" "}
                  <strong>Menyimpan wajib menempel ulang token</strong> — sama
                  atau baru — karena token lama tidak dipakai ulang otomatis.
                </>
              )}
            </p>

            <TokenHelp provider={provider} />
          </div>

          {error && <Message tone="bad">{error}</Message>}
          {sukses && <Message tone="good">{sukses}</Message>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!bisaSimpan || saving}>
              {saving
                ? "Menyimpan…"
                : hasExisting
                  ? "Perbarui repo"
                  : "Simpan repo"}
            </Button>

            {hasExisting && (
              <Button
                type="button"
                variant="neutral"
                onClick={onUji}
                disabled={previewLoading}
              >
                {previewLoading ? "Mengambil…" : "Uji ambil commit"}
              </Button>
            )}

            {/* Dulu tombol simpan mati tanpa penjelasan. Sekarang alasannya
                tertulis tepat di sebelah tombol. */}
            {!bisaSimpan && (
              <p className="text-xs text-foreground/60" aria-live="polite">
                Isi {repoPath.trim() ? "token akses" : "repo dan token akses"}{" "}
                untuk menyimpan.
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* Bagian tampilan disusun per Kartu karena penyimpanannya BERBEDA-BEDA: repo +
 * token lewat satu tombol simpan, sakelar punya jalurnya sendiri (PUT
 * `action: "toggle"`), dan hasil uji hanya tampilan. Dulu semuanya ditumpuk
 * dalam satu form, sehingga pengguna wajar mengira sakelar ikut tersimpan saat
 * menekan "Perbarui repo". */

/** Petunjuk pembuatan token, dilipat agar pengguna lama tidak terganggu. */
function TokenHelp({ provider }: { provider: Provider }) {
  const help = TOKEN_HELP[provider];
  return (
    <details className="rounded-base border-2 border-border p-3">
      <summary className="cursor-pointer text-sm font-base">
        Belum punya token {PROVIDER_LABEL[provider]}?
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-foreground/70">
        {help.steps.map((langkah) => (
          <li key={langkah}>{langkah}</li>
        ))}
      </ol>
      <a
        href={help.createUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm underline underline-offset-4"
      >
        {help.createLabel} (buka tab baru)
      </a>
      <p className="mt-2 text-xs text-foreground/60">
        Memberi izin lebih luas tidak membuat fitur ini bekerja lebih baik, dan
        hanya menambah risiko bila token bocor. Jangan pakai token kerja yang
        punya akses ke banyak repo.
      </p>
      <p className="mt-1 text-xs text-foreground/60">
        Di GitLab, token hanya bisa membaca repo tempat Anda sendiri punya akses.
        Kalau muncul pesan repo tidak ditemukan, pastikan Anda sudah menjadi
        anggota repo tersebut (minimal peran Reporter), bukan hanya mengubah izin
        token.
      </p>
    </details>
  );
}
