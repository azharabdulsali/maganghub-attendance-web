import LogoSvg from "./blocks/footer-component-01/assets/svg/logo";

import { cn } from "@/lib/utils";

// Wrapper logo + nama brand, sejajar dengan pola `Logo` di blok asli
// (svg + teks), tetapi memakai nama & ikon brand proyek ini, bukan
// "shadcn/studio".
const Logo = ({ className }: { className?: string }) => {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoSvg className="size-8 text-foreground" />
      <span className="font-heading text-xl">MagangHub Autoabsen</span>
    </div>
  );
};

export default Logo;
