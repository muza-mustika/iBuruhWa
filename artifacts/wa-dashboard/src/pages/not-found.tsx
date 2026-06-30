import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl font-medium">Halaman tidak ditemukan</p>
      <p className="text-muted-foreground">Halaman yang Anda cari tidak ada.</p>
      <Link href="/"><Button>Kembali ke Beranda</Button></Link>
    </div>
  );
}
