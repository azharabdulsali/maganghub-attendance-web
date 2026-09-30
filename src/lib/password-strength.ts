// src/lib/password-strength.ts — perkiraan kekuatan kata sandi (murni, tanpa I/O).
//
// Kenapa ada: aplikasi hanya mewajibkan 8 karakter (`changePasswordSchema`).
// Itu batas minimum, tetapi tidak memberi tahu pengguna bahwa "password123"
// jauh lebih lemah dari "Kucing-Tidur-72". Indikator ini mendorong kata sandi
// yang lebih baik **tanpa** menambah aturan keras yang bisa mengunci orang
// dari akunnya (tidak ada email pemulihan — lihat password-form.tsx).
//
// Ini BUKAN pengukur entropi sungguhan dan bukan pengganti zxcvbn; hanya
// perkiraan kasar yang cukup untuk memberi umpan balik visual. Aturannya
// sengaja transparan supaya bisa diuji dan diprediksi.

export type StrengthLevel = "kosong" | "lemah" | "sedang" | "kuat";

export type Strength = {
  level: StrengthLevel;
  /** 0–4; dipakai untuk lebar bilah dan jumlah blok yang menyala. */
  skor: number;
  /** Kalimat pendek untuk pengguna, mis. "Tambahkan angka atau simbol." */
  saran: string;
};

const PANJANG_BAIK = 12;
const PANJANG_MINIMUM = 8;

/**
 * Hitung kekuatan kata sandi.
 *
 * Cara kerja: mulai dari 0, tambah satu poin untuk tiap hal yang membuat kata
 * sandi lebih sulit ditebak — panjang memadai, campuran huruf besar/kecil,
 * angka, dan simbol. Lalu turunkan poin bila kata sandi ada di daftar umum
 * atau hanya mengulang satu jenis karakter.
 */
export function hitungKekuatan(sandi: string): Strength {
  if (sandi.length === 0) {
    return { level: "kosong", skor: 0, saran: "" };
  }

  // Kata sandi yang sangat sering dipakai. Tidak menambah poin apa pun dan
  // dipaksa ke "lemah" di akhir, karena panjangnya bisa menyesatkan.
  const umum = [
    "password",
    "qwerty",
    "123456",
    "12345678",
    "admin",
    "letmein",
    "iloveyou",
    "welcome",
    "monkey",
    "maganghub",
  ];
  const hurufKecil = sandi.toLowerCase();
  const terlaluUmum = umum.some((k) => hurufKecil.includes(k));

  let skor = 0;
  if (sandi.length >= PANJANG_MINIMUM) skor += 1;
  if (sandi.length >= PANJANG_BAIK) skor += 1;

  const adaHurufBesar = /[A-Z]/.test(sandi);
  const adaHurufKecil = /[a-z]/.test(sandi);
  const adaAngka = /[0-9]/.test(sandi);
  const adaSimbol = /[^A-Za-z0-9]/.test(sandi);

  if (adaHurufBesar && adaHurufKecil) skor += 1;
  if (adaAngka) skor += 1;
  if (adaSimbol) skor += 1;

  // Hanya satu jenis karakter (semua huruf, atau semua angka) mudah ditebak,
  // sebagus apa pun panjangnya. Turunkan satu poin.
  const jenis = [adaHurufBesar || adaHurufKecil, adaAngka, adaSimbol].filter(
    Boolean,
  ).length;
  if (jenis <= 1) skor -= 1;

  if (terlaluUmum) skor = Math.min(skor, 1);

  // Jaga di rentang 0–4.
  skor = Math.max(0, Math.min(4, skor));

  if (skor <= 1) {
    return {
      level: "lemah",
      skor,
      saran: terlaluUmum
        ? "Kata sandi ini terlalu sering dipakai orang lain."
        : "Tambahkan lebih banyak karakter, angka, atau simbol.",
    };
  }
  if (skor === 2) {
    return {
      level: "sedang",
      skor,
      saran: "Tambahkan huruf besar, angka, atau simbol.",
    };
  }
  if (skor === 3) {
    return {
      level: "sedang",
      skor,
      saran: "Hampir kuat — tambah panjang atau simbol.",
    };
  }
  return { level: "kuat", skor, saran: "Kata sandi yang kuat." };
}
