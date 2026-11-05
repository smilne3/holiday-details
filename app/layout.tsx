import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Wish Lists",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#fffdf8]">{children}</body>
    </html>
  );
}
