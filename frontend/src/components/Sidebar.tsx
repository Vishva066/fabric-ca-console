"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { getCAInfo } from "@/lib/api";
import CAInfoModal from "./CAInfoModal";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📋" },
  { href: "/register", label: "Register", icon: "📝" },
  { href: "/enroll", label: "Enroll", icon: "🔐" },
  { href: "/decoder", label: "Certificate Decoder", icon: "🔍" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [caName, setCaName] = useState<string>("Fabric CA");
  const [showCAInfo, setShowCAInfo] = useState(false);

  useEffect(() => {
    const fetchCAName = async () => {
      try {
        const res = await getCAInfo();
        const name = res?.result?.CAName as string;
        if (name) setCaName(name);
      } catch {
        // Keep default "Fabric CA" on failure
      }
    };
    fetchCAName();
  }, []);

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Logo / Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-zinc-200 px-6 dark:border-zinc-800">
          <button
            onClick={() => setShowCAInfo(true)}
            title="View CA details"
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <Image
              src="/fabric-logo.svg"
              alt="Fabric CA Console"
              width={32}
              height={32}
              className="rounded-lg"
            />
          </button>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Fabric CA Console
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {caName}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-lg font-semibold transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <span className="text-2xl">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* CA Info Modal */}
      {showCAInfo && <CAInfoModal onClose={() => setShowCAInfo(false)} />}
    </>
  );
}
