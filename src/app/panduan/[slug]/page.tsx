// src/app/panduan/[slug]/page.tsx: halaman satu artikel panduan (audit C-1).
//
// Dirender statis lewat generateStaticParams: artikel adalah konten yang tidak
// berubah per permintaan, jadi lebih baik jadi HTML diam sejak build. Ini juga
// yang membuat crawler dan pengguna melihat halaman yang sama tanpa render
// ulang di server.
//
// Metadata dan isi diambil dari sumber yang SAMA (lib/guides.ts), sehingga
// title, description, dan JSON-LD tidak mungkin menyimpang dari teks yang
// terlihat.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuidePage } from "@/components/guide-page";
import { getGuide, GUIDE_SLUGS } from "@/lib/guides";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  return {
    title: guide.judul,
    description: guide.ringkas,
    keywords: [...guide.kataKunci],
    alternates: { canonical: `/panduan/${guide.slug}` },
    openGraph: {
      type: "article",
      locale: "id_ID",
      siteName: SITE_NAME,
      title: `${guide.judul} | ${SITE_NAME}`,
      description: guide.ringkas,
      url: `/panduan/${guide.slug}`,
      publishedTime: guide.terbit,
    },
  };
}

export default async function GuideDetailPage({ params }: Props) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return <GuidePage guide={guide} />;
}
