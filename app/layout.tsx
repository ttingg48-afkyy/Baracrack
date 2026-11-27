import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "BARA TERMINAL", description: "BARA Terminal — Vercel Sandbox Edition" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="id"><body>{children}</body></html>;
}