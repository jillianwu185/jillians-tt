"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN_ON = ["/login", "/terms", "/privacy"];

export default function NavHeader() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
      <Link href="/" className="font-semibold">
        Jillian&apos;s Auto-Editor
      </Link>
      <nav className="flex gap-5 text-sm text-neutral-600">
        <Link href="/studio" className="hover:text-black">
          Studio
        </Link>
        <Link href="/insights" className="hover:text-black">
          Insights
        </Link>
        <Link href="/ideas" className="hover:text-black">
          Ideas
        </Link>
      </nav>
    </header>
  );
}
