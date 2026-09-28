import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Maganghub Autoabsen",
  description:
    "Kirim absensi MagangHub dari tiga template laporan Anda, otomatis dan tanpa biaya bulanan.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={cn("font-sans", inter.variable)}>
      <body className="bg-secondary-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}