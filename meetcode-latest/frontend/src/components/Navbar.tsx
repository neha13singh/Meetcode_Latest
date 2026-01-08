import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="border-b border-white/10 bg-black/50 backdrop-blur-xl fixed top-0 w-full z-50">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          MeetCode
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/practice" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Practice
          </Link>
        </div>
      </div>
    </nav>
  );
}
