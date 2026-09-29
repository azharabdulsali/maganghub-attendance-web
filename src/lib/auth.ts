// src/lib/auth.ts — konfigurasi NextAuth v5 (SPEC.md §9 poin 2, §13 baris 6).
//
// Keputusan yang tercermin di sini:
//   - Login memakai email + password (tanpa OAuth).
//   - Password di-hash bcryptjs, cost 12.
//   - Pendaftaran terbuka & langsung aktif (tanpa verifikasi email).
//   - Email yang cocok dengan ADMIN_EMAIL otomatis jadi ADMIN (§13 baris 8).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { env, isAdminEmail } from "@/lib/env";
import { clientIpFromHeaders, rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Rate limit per IP untuk mencegah brute force. Dipasang SEBELUM
        // menyentuh DB/auth supaya percobaan berulang tak membebani server.
        // `headers()` memberi IP dari proxy (Vercel: x-forwarded-for).
        let limitKey = "unknown";
        try {
          const h = await headers();
          limitKey = clientIpFromHeaders((name) => h.get(name));
        } catch {
          // Di luar konteks request (mis. pemanggilan internal) — pakai default.
        }

        const gate = await enforceRateLimit(
          "login",
          rateLimitKey("login", limitKey),
        );
        if (!gate.decision.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.trim().toLowerCase() },
        });

        // Pesan gagal sengaja tidak membedakan "email tidak ada" dan
        // "password salah" — supaya tidak bisa dipakai menebak email terdaftar.
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role =
          (token.role as string) ?? "USER";
      }
      return session;
    },
  },
  secret: env.NEXTAUTH_SECRET,
});

export { isAdminEmail };
