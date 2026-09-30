// src/app/api/dev-tools/analyze-capture/route.ts: menganalisis rekaman HAR/curl
// untuk menemukan endpoint submit laporan (docs/MONEV-API.md §8).
//
// Endpoint ini HANYA membaca teks yang sudah direkam pengguna. Ia tidak
// mengirim apa pun ke portal Monev, tidak menyimpan hasilnya, dan tidak
// mengembalikan nilai rahasia (token/cookie/password ditapis oleh
// `src/lib/har-capture.ts`). Dibatasi untuk ADMIN supaya langkah diagnostik ini
// tidak jadi permukaan serangan bagi user biasa.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { analyzeCapture } from "@/lib/har-capture";

const MAKS_PANJANG = 2_000_000; // 2 MB, cukup untuk HAR, mencegah penyalahgunaan.

export async function POST(request: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }
  if (role !== "ADMIN") {
    return NextResponse.json(
      { error: "Hanya admin yang boleh memakai alat diagnostik ini." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });
  }

  const raw = (body as { raw?: unknown })?.raw;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'raw' berisi teks rekaman wajib diisi." },
      { status: 400 },
    );
  }
  if (raw.length > MAKS_PANJANG) {
    return NextResponse.json(
      { error: "Rekaman terlalu besar (maksimal 2 MB)." },
      { status: 413 },
    );
  }

  const hasil = analyzeCapture(raw);
  return NextResponse.json(hasil);
}
