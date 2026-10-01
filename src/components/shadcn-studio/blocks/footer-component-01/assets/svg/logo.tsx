import type { SVGAttributes } from "react";

// Logo brand MagangHub: penanda kalender bertanda centang (inti aplikasi =
// presensi). Mengikuti bentuk logo blok footer-component-01 (lingkaran penuh +
// satu aksen stroke), tetapi memakai ikon kalender-centang agar sesuai brand.
// `fill`/`stroke` memakai `currentColor` supaya otomatis ikut tema terang/gelap
// tanpa kelas dark: tambahan.
const Logo = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="4"
        fill="currentColor"
      />
      <path
        d="M8 2.5v3M16 2.5v3"
        stroke="var(--secondary-background)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 9h18"
        stroke="var(--secondary-background)"
        strokeWidth="2"
      />
      <path
        d="m8.5 15.5 2.5 2.5 5-5.5"
        stroke="var(--secondary-background)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Logo;
