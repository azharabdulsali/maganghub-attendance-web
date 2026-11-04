// src/lib/admin-user-actions.ts: aturan murni untuk aksi admin atas pengguna.
//
// Halaman /admin hanya BACA sampai fitur ini. Menambah aksi yang mengubah data
// orang lain butuh penjagaan yang bisa diuji tanpa DB, jadi keputusannya
// dikumpulkan di sini: siapa yang boleh disentuh, siapa yang tidak, dan
// bagaimana kata sandi sementara dibentuk.
//
// Kenapa dipisah dari route: route hanya menyusun respons HTTP. Semua "boleh
// atau tidak" ada di sini supaya bisa diuji unit dan tidak tergoda ditulis dua
// kali (klien menyembunyikan tombol, server memutuskan).

/** Alasan sebuah aksi ditolak. Dipetakan ke pesan & status HTTP di route. */
export type ActionDenial =
  | "SELF" // admin mencoba menghapus/mengatur ulang akunnya sendiri
  | "IS_ADMIN" // sasaran adalah admin lain
  | "NOT_FOUND"; // sasaran tidak ada / sudah dihapus

export interface TargetUser {
  id: string;
  role: string;
}

/**
 * Boleh atau tidak admin `actorId` melakukan aksi destruktif pada `target`.
 *
 * Aturan (disepakati):
 *   - tidak boleh pada diri sendiri (cegah admin mengunci dirinya keluar),
 *   - tidak boleh pada admin lain (cegah saling tendang / eskalasi),
 *   - hanya untuk pengguna biasa yang benar-benar ada.
 *
 * Mengembalikan `null` bila boleh, selain itu alasan penolakan.
 */
export function checkAdminTarget(
  actorId: string,
  target: TargetUser | null | undefined,
): ActionDenial | null {
  if (!target) return "NOT_FOUND";
  if (target.id === actorId) return "SELF";
  if (target.role.toUpperCase() === "ADMIN") return "IS_ADMIN";
  return null;
}

/** Pesan ramah untuk setiap alasan penolakan. */
export function describeActionDenial(denial: ActionDenial): string {
  switch (denial) {
    case "SELF":
      return "Anda tidak bisa melakukan aksi ini pada akun sendiri.";
    case "IS_ADMIN":
      return "Akun admin lain tidak boleh diubah dari sini.";
    case "NOT_FOUND":
      return "Pengguna tidak ditemukan atau sudah dihapus.";
  }
}

/** Status HTTP yang cocok untuk tiap alasan penolakan. */
export function statusForDenial(denial: ActionDenial): number {
  switch (denial) {
    case "NOT_FOUND":
      return 404;
    case "SELF":
    case "IS_ADMIN":
      return 403;
  }
}

/** Peran yang dikenal aplikasi. `Role` di Prisma hanya punya dua nilai. */
export type AssignableRole = "USER" | "ADMIN";

/** Alasan sebuah perubahan PERAN ditolak. */
export type RoleChangeDenial =
  | ActionDenial // SELF / IS_ADMIN / NOT_FOUND — aturan sama dengan aksi destruktif
  | "INVALID_ROLE" // peran yang diminta tidak dikenal
  | "NO_CHANGE"; // peran sama dengan yang sekarang

export interface TargetUserWithRole extends TargetUser {
  role: string;
}

/**
 * Boleh atau tidak admin mengubah PERAN `target`.
 *
 * Aturan (beda dari aksi destruktif, sengaja):
 *   - tidak boleh pada diri sendiri (cegah admin menurunkan/menaikkan dirinya
 *     sendiri dan mengunci sistem),
 *   - peran yang diminta harus USER atau ADMIN,
 *   - tidak ada perubahan bila perannya sama,
 *   - sasaran admin hanya boleh DIKECUALIKAN dari penurunan peran: mengubah
 *     ADMIN -> USER belum didukung (bisa mengunci sistem bila admin terakhir),
 *     tetapi USER -> ADMIN DIIZINKAN. Ini alasan aturan `checkAdminTarget`
 *     tidak dipakai apa adanya: aturan itu menolak SEMUA sasaran admin, yang
 *     di sini akan membuat promosi mustahil dan peran tak bisa dikelola.
 *
 * Mengembalikan `null` bila boleh, selain itu alasan penolakan.
 */
export function checkRoleChange(
  actorId: string,
  target: TargetUserWithRole | null | undefined,
  newRole: string,
): RoleChangeDenial | null {
  if (!target) return "NOT_FOUND";
  if (target.id === actorId) return "SELF";

  const diminta = newRole.trim().toUpperCase();
  if (diminta !== "USER" && diminta !== "ADMIN") return "INVALID_ROLE";

  const sekarang = target.role.toUpperCase();
  if (sekarang === diminta) return "NO_CHANGE";

  // Menurunkan admin lain butuh jaminan "masih ada admin lain" yang belum
  // tersedia di sini; lebih baik ditolak terang-terangan daripada sistem
  // terkunci tanpa jalan masuk.
  if (sekarang === "ADMIN" && diminta === "USER") return "IS_ADMIN";

  return null;
}

/** Pesan ramah untuk penolakan perubahan peran. */
export function describeRoleChangeDenial(denial: RoleChangeDenial): string {
  switch (denial) {
    case "INVALID_ROLE":
      return "Peran hanya boleh USER atau ADMIN.";
    case "NO_CHANGE":
      return "Pengguna ini sudah memiliki peran tersebut.";
    default:
      return describeActionDenial(denial);
  }
}

/** Status HTTP untuk penolakan perubahan peran. */
export function statusForRoleChangeDenial(denial: RoleChangeDenial): number {
  switch (denial) {
    case "INVALID_ROLE":
      return 400;
    case "NO_CHANGE":
      return 409; // konflik dengan keadaan sekarang, bukan salah permintaan
    default:
      return statusForDenial(denial);
  }
}

// ---------------------------------------------------------------------------
// Kata sandi sementara
// ---------------------------------------------------------------------------

// Alfabet tanpa karakter yang mudah tertukar saat disalin manual (0/O, 1/I/l),
// karena kata sandi ini dibacakan admin ke pengguna lewat WhatsApp/telepon.
// Huruf besar & kecil ditulis terpisah: menurunkan alfabet besar jadi huruf
// kecil akan menghadirkan kembali "l" (dari "L"), yang justru ingin dihindari.
const HURUF_BESAR = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // tanpa I, O
const HURUF_KECIL = "abcdefghijkmnopqrstuvwxyz"; // tanpa l
const ANGKA = "23456789"; // tanpa 0, 1
// Simbol aman (tidak bentrok dengan kutip/backslash yang menyulitkan penyalinan).
const SIMBOL = "!@#$%&*?";
const ALFABET = HURUF_BESAR + HURUF_KECIL + ANGKA;
const PANJANG = 16;

/**
 * Buat kata sandi sementara acak yang kuat (16 karakter, ada huruf besar,
 * kecil, angka, dan simbol). Memakai `crypto.getRandomValues` (Web Crypto)
 * supaya acak secara kriptografis — bukan `Math.random`.
 *
 * `rand` bisa disuntik untuk pengujian (harus mengembalikan 0 ≤ x < 1).
 */
export function generateTemporaryPassword(
  rand: () => number = defaultRandom,
): string {
  const pick = (sumber: string) =>
    sumber[Math.floor(rand() * sumber.length)] ?? sumber[0];

  // Satu karakter dari tiap kelas dijamin ada, sisanya bebas, lalu diacak.
  const wajib = [
    pick(HURUF_BESAR),
    pick(HURUF_KECIL),
    pick(ANGKA),
    pick(SIMBOL),
  ];
  const sisa = Array.from({ length: PANJANG - wajib.length }, () => pick(ALFABET + SIMBOL));
  const semua = [...wajib, ...sisa];

  // Fisher–Yates dengan sumber acak yang sama supaya posisi "wajib" tidak tetap.
  for (let i = semua.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [semua[i], semua[j]] = [semua[j], semua[i]];
  }
  return semua.join("");
}

function defaultRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
