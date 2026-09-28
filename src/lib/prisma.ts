// src/lib/prisma.ts — satu instance PrismaClient untuk seluruh aplikasi.
//
// Prisma 7 memakai DRIVER ADAPTER, bukan `url` di schema. Untuk Neon
// serverless (Vercel), adapter `@prisma/adapter-neon` adalah cara yang benar:
// memakai HTTP/WebSocket, bukan koneksi TCP yang cepat habis di serverless.
//
// Selama pengembangan lokal, instance disimpan di globalThis supaya
// hot-reload Next.js tidak membuat koneksi baru terus-menerus.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
