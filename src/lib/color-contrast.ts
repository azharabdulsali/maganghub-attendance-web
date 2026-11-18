// src/lib/color-contrast.ts: hitung rasio kontras WCAG dari token warna proyek.
//
// Kenapa ada: aturan proyek mewajibkan latar selalu berpasangan dengan
// foreground-nya (`bg-main` + `text-main-foreground`, dst). Aturan itu mudah
// dilanggar tanpa terlihat, karena warna yang "kelihatan beda" di layar
// pengembang bisa saja hanya 2.8:1 dan tidak terbaca di layar HP di bawah
// matahari. Pemeriksaan mata tidak bisa diandalkan dan tidak bisa diulang,
// jadi dihitung.
//
// Modul ini MURNI (tanpa DOM, tanpa dependensi): membaca nilai token dari
// `globals.css`, mengubahnya ke sRGB, lalu menghitung rasio kontras menurut
// WCAG 2.x. Tesnya (`color-contrast.test.ts`) memeriksa pasangan yang benar-
// benar dipakai di komponen.
//
// Batas yang diketahui: token ber-alpha (mis. `--border` = `oklch(1 0 0 / 35%)`)
// TIDAK diuji, karena hasil akhirnya bergantung pada latar di belakangnya.
// Border juga bukan teks, jadi ambang 4.5:1 tidak berlaku untuknya.

/** Satu warna sRGB, kanal 0–255. */
export type Rgb = { r: number; g: number; b: number };

/** Nilai token untuk mode terang & gelap. */
export type PasanganToken = { terang: string; gelap: string };

/**
 * Pecah isi `light-dark(...)` pada koma TINGKAT ATAS saja.
 *
 * Nilai di proyek ini memuat tanda kurung bersarang (`light-dark(hsl(214, 95%,
 * 93%), oklch(0.16 0 0))`), jadi regex sederhana akan salah memecah di koma
 * DALAM `hsl()`. Penghitung kedalaman kurung diperlukan.
 */
function pecahLightDark(isi: string): [string, string] | null {
  let kedalaman = 0;
  for (let i = 0; i < isi.length; i++) {
    const c = isi[i];
    if (c === "(") kedalaman++;
    else if (c === ")") kedalaman--;
    else if (c === "," && kedalaman === 0) {
      return [isi.slice(0, i).trim(), isi.slice(i + 1).trim()];
    }
  }
  return null;
}

/**
 * Ambil nilai token dari isi CSS, termasuk pembungkus `light-dark(a, b)`.
 *
 * Mengembalikan `null` bila token tidak ada atau bentuknya tidak dikenali —
 * pemanggil (tes) harus gagal keras saat itu terjadi, karena token yang hilang
 * berarti pemeriksaan kontrasnya diam-diam tidak berjalan.
 */
export function bacaToken(css: string, nama: string): PasanganToken | null {
  // `--nama:` diikuti nilai sampai titik koma. `[^;]+` cukup karena nilai token
  // di proyek ini selalu satu baris.
  const pola = new RegExp(`--${nama}\\s*:\\s*([^;]+);`);
  const cocok = pola.exec(css);
  if (!cocok) return null;
  const nilai = cocok[1].trim();

  if (nilai.startsWith("light-dark(") && nilai.endsWith(")")) {
    const dalam = nilai.slice("light-dark(".length, -1);
    const bagian = pecahLightDark(dalam);
    if (bagian) return { terang: bagian[0], gelap: bagian[1] };
    return null;
  }

  // Token tanpa light-dark() berlaku sama di kedua mode.
  return { terang: nilai, gelap: nilai };
}

/** Apakah warna memuat alpha (tidak bisa diuji tanpa tahu latar di belakangnya). */
export function punyaAlpha(warna: string): boolean {
  return /\/\s*[\d.]+%?\s*\)/.test(warna);
}

/** hsl(h, s%, l%) → sRGB. */
function hslKeRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lig - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** OKLCH → sRGB (rumus resmi CSS Color 4, lewat Oklab lalu linear sRGB). */
function oklchKeRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const linR = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const linG = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const linB = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const gamma = (v: number) => {
    const k = Math.min(1, Math.max(0, v));
    return k <= 0.0031308 ? 12.92 * k : 1.055 * k ** (1 / 2.4) - 0.055;
  };

  return {
    r: Math.round(gamma(linR) * 255),
    g: Math.round(gamma(linG) * 255),
    b: Math.round(gamma(linB) * 255),
  };
}

/**
 * Ubah satu nilai warna CSS (`hsl()`, `oklch()`, `#rrggbb`, `rgb()`) ke sRGB.
 * Melempar galat untuk bentuk yang tidak dikenali: lebih baik tes gagal jelas
 * daripada diam-diam melewati pemeriksaan.
 */
export function keRgb(warna: string): Rgb {
  const w = warna.trim().toLowerCase();

  const hex = /^#([0-9a-f]{6})$/.exec(w);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const hsl = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(w);
  if (hsl) return hslKeRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));

  const oklch =
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(w);
  if (oklch) {
    // `oklch(100% 0 0)` memakai persen; `oklch(0.16 0 0)` memakai pecahan.
    const l = oklch[2] === "%" ? Number(oklch[1]) / 100 : Number(oklch[1]);
    return oklchKeRgb(l, Number(oklch[3]), Number(oklch[4]));
  }

  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(w);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  throw new Error(`Bentuk warna tidak dikenali: ${warna}`);
}

/** Luminans relatif menurut WCAG 2.x. */
export function luminans({ r, g, b }: Rgb): number {
  const kanal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

/** Rasio kontras WCAG antara dua warna (1–21). */
export function rasioKontras(a: string, b: string): number {
  const la = luminans(keRgb(a));
  const lb = luminans(keRgb(b));
  const terang = Math.max(la, lb);
  const gelap = Math.min(la, lb);
  return (terang + 0.05) / (gelap + 0.05);
}
