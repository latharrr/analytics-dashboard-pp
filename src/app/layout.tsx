import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Picapool Analytics",
  description: "Internal analytics dashboard and AI query engine over the Picapool Supabase project.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
