"use client";

import Link from "next/link";
import { AuthButton } from "./AuthButton";

export function Navbar() {
  return (
    <nav className="navbar bg-white border-b border-gray-200 px-4 lg:px-8">
      <div className="flex-1">
        <Link href="/" className="text-xl font-bold text-blue-600">
          ClearCost
        </Link>
      </div>
      <div className="flex-none gap-2">
        <Link href="/saved" className="btn btn-ghost btn-sm text-gray-600">
          Saved
        </Link>
        <AuthButton />
      </div>
    </nav>
  );
}
