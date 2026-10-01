"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN_ON = ["/login", "/terms", "/privacy"];

export default function NavHeader() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;

  const links = [
    { href: "/studio", label: "Studio" },
    { href: "/insights", label: "Insights" },
    { href: "/ideas", label: "Ideas" },
  ];

  return (
    <header className="flex items-center justify-between bg-white px-6 py-3 shadow-sm">
      <Link href="/" className="flex items-center gap-2 font-semibold text-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" className="h-7 w-7" />
        Jillian&apos;s Auto-Editor
      </Link>
      <nav className="flex gap-2 text-sm">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-1.5 font-medium transition ${
                active ? "bg-sky-100 text-sky-700" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
