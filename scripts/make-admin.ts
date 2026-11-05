/**
 * Skrip menaikkan peran seorang pengguna menjadi ADMIN.
 *
 * Gunanya: jalur pemulihan bila `ADMIN_EMAIL` kosong saat pendaftaran sehingga
 * tidak ada admin otomatis, atau bila admin terakhir tidak bisa masuk. SPEC §13
 * ("Cara Membuat Admin Pertama") menjanjikan perintah ini, jadi skripnya harus
 * benar-benar ada — dokumen tidak boleh menjanjikan skrip yang tidak ada.
 *
 * JALANKAN HANYA DARI LOKAL, dengan `.env.local` yang menunjuk database yang
 * benar. Skrip ini TIDAK dijaga apa pun selain akses ke database: siapa pun yang
 * bisa menjalankannya bisa mengangkat dirinya jadi admin. Karena itu ia tidak
 * pernah dipanggil dari dalam aplikasi (tidak ada route yang memakainya).
 *
 * Pemakaian:
 *   npm run make-admin -- email@anda.com
 *
 * Keluar dengan kode 1 bila email tidak ditemukan, tidak wajar, akunnya sudah
 * dihapus, atau database tidak bisa dihubungi — supaya salah ketik tidak lewat
 * tanpa terlihat.
 *
 * Catatan teknis (mengikuti AGENTS.md §3 "Menjalankan skrip di luar Next.js"):
 *   - `tsx` tidak memuat `.env.local` sendiri -> `dotenv.config` dipanggil dulu.
 *   - `env.ts` memvalidasi env saat impor, jadi variabel WAJIB yang belum ada
 *     diisi nilai dummy yang lolos skema. Nama variabel harus PERSIS sama
 *     dengan src/lib/env.ts, kalau tidak skrip melempar "Konfigurasi
 *     environment bermasalah" sebelum menyentuh database.
 *   - Impor `prisma` dari `@/lib/prisma` (driver adapter Neon wajib di Prisma 7).
 *   - Top-level await tidak didukung (output CJS) -> bungkus dalam `main()`.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
process.env.DATABASE_URL ??= "postgresql://uji:uji@localhost:5432/uji";
process.env.DIRECT_URL ??= "postgresql://uji:uji@localhost:5432/uji";
process.env.NEXTAUTH_SECRET ??= "uji-nyata-secret-panjang-sekali-32karakter";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= "0".repeat(64);

/**
 * Mengubah galat apa pun menjadi satu baris yang bisa dibaca.
 *
 * Driver Neon melempar `ErrorEvent` (bukan `Error`) saat koneksi gagal, sehingga
 * `String(galat)` menghasilkan `[object ErrorEvent]` yang tidak berguna. Bentuk
 * itu punya `message`/`error` di dalamnya, jadi keduanya digali di sini.
 */
function jelaskanGalat(galat: unknown): string {
  if (galat instanceof Error) {
    return galat.message;
  }

  if (galat && typeof galat === "object") {
    const rekaman = galat as {
      message?: unknown;
      error?: { message?: unknown; stack?: unknown };
      stack?: unknown;
    };

    // `ErrorEvent` dari driver Neon: `message`-nya string KOSONG dan sebab
    // sebenarnya hanya ada di `error.stack` (mis. "ECONNREFUSED
    // 127.0.0.1:59999"). Ambil baris pertama stack yang berisi pesan.
    const kandidat = [rekaman.message, rekaman.error?.message];
    for (const nilai of kandidat) {
      if (typeof nilai === "string" && nilai.trim()) {
        return nilai.trim();
      }
    }

    const tumpukan = rekaman.error?.stack ?? rekaman.stack;
    if (typeof tumpukan === "string") {
      // `ErrorEvent` dari driver Neon hanya berisi "TypeError" tanpa pesan dan
      // tanpa frame `at …` — detailnya (ECONNREFUSED, timeout, dsb.) tidak
      // pernah sampai ke kita. Mencetak "TypeError" saja justru menyesatkan,
      // jadi baris tanpa frame sengaja TIDAK dikembalikan.
      const barisPesan = tumpukan
        .split("\n")
        .map((b) => b.trim())
        .find(
          (b) =>
            b.length > 0 &&
            !b.startsWith("at ") &&
            !/^(TypeError|Error|ErrorEvent)$/.test(b),
        );

      if (barisPesan) {
        return barisPesan;
      }
    }
  }

  return "tidak ada detail dari driver (periksa DATABASE_URL & status database)";
}

async function main() {
  const argumen = process.argv[2]?.trim().toLowerCase();

  if (!argumen) {
    console.error(
      "Email belum diisi.\n\nPemakaian:\n  npm run make-admin -- email@anda.com",
    );
    process.exitCode = 1;
    return;
  }

  if (!argumen.includes("@")) {
    console.error(
      `"${argumen}" bukan alamat email yang wajar. Periksa lagi (harus memuat "@").`,
    );
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/lib/prisma");

  let pengguna;
  try {
    pengguna = await prisma.user.findUnique({
      where: { email: argumen },
      select: { id: true, email: true, name: true, role: true, deletedAt: true },
    });
  } catch (galat) {
    // Galat koneksi (DATABASE_URL salah, Neon tidur, jaringan putus) sebelumnya
    // tampil sebagai `ErrorEvent { … }` yang tidak memberi tahu apa pun. Pesan
    // di bawah menyebut hal yang bisa diperiksa pemilik sendiri.
    console.error(
      `Tidak bisa menghubungi database saat mencari "${argumen}".\n` +
        "Periksa bahwa `.env.local` ada dan DATABASE_URL/DIRECT_URL-nya benar " +
        "(Neon paket gratis \"tidur\" saat lama tidak dipakai — coba lagi beberapa detik kemudian).\n" +
        `Pesan teknis: ${jelaskanGalat(galat)}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!pengguna) {
    console.error(
      `Tidak ada pengguna dengan email "${argumen}".\n` +
        "Pengguna harus MENDAFTAR lebih dulu lewat /register; skrip ini tidak " +
        "membuat akun baru (password harus dibuat pemiliknya sendiri).",
    );
    process.exitCode = 1;
    return;
  }

  if (pengguna.deletedAt) {
    console.error(
      `Akun "${argumen}" sudah dihapus (soft delete) pada ` +
        `${pengguna.deletedAt.toISOString()}.\n` +
        "Akun terhapus tidak bisa dimasuki, jadi tidak berguna dijadikan admin. " +
        "Minta pemiliknya mendaftar ulang dengan email lain.",
    );
    process.exitCode = 1;
    return;
  }

  if (pengguna.role === "ADMIN") {
    console.log(`"${argumen}" SUDAH ADMIN — tidak ada yang diubah.`);
    return;
  }

  const diperbarui = await prisma.user.update({
    where: { id: pengguna.id },
    data: { role: "ADMIN" },
    select: { email: true, role: true },
  });

  // Sesi lama tidak perlu dicabut: callback `jwt` membaca `role` dari DB setiap
  // permintaan (lihat AGENTS.md §15.1 / `peranSesiEfektif`), jadi pengguna
  // langsung menjadi admin tanpa login ulang.
  console.log(
    `Berhasil. "${diperbarui.email}" sekarang berperan ${diperbarui.role}.\n` +
      "Muat ulang halaman aplikasi (atau login ulang bila perlu) untuk melihat menu Panel Admin.",
  );
}

main()
  .catch((galat) => {
    console.error("Gagal menaikkan peran:", galat);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Sengaja diam-diam gagal: bila proses sudah sampai di sini dengan
    // `exitCode = 1` (mis. impor `@/lib/prisma` sendiri gagal), melempar galat
    // baru dari `finally` akan MENGGANTI pesan aslinya — pengguna akhirnya
    // melihat galat disconnect, bukan masalah sebenarnya.
    try {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    } catch {
      /* tidak ada koneksi untuk ditutup */
    }
  });
