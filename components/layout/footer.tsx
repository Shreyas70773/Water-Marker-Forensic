"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-auto">
      <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
        <span>A product of </span>
        <Link 
          href="https://pixelandpunch.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          pixelandpunch.com
        </Link>
      </div>
    </footer>
  );
}
