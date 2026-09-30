// prisma.config.ts: konfigurasi Prisma CLI (Prisma 7).
//
// CATATAN PENTING (baca sebelum mengubah):
// Prisma 7 memindahkan URL koneksi KELUAR dari schema.prisma. Karena itu:
//   - schema.prisma hanya berisi `provider = "postgresql"`
//   - `DATABASE_URL` dibaca di sini oleh Prisma CLI (untuk migrasi / db push)
//   - Client runtime (src/lib/prisma.ts) memakai DRIVER ADAPTER, bukan url
//
// Perbedaan dengan SPEC.md §14: SPEC ditulis untuk Prisma 6 di mana schema
// memuat `url` + `directUrl`. Di Prisma 7, `directUrl` DIHAPUS total oleh
// Prisma (lihat https://pris.ly/d/config-datasource). Migrasi kita selalu
// dijalankan dari komputer lokal, jadi `DATABASE_URL` (pooled) sudah cukup.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
