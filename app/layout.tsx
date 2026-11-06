import type { Metadata } from "next";
import "./globals.css";

// robots: a personal link that ends up somewhere public mustn't put anyone's lists in search
// results, so no page is indexed and no link on it followed.
export const metadata: Metadata = {
  title: "Family Wish Lists",
  robots: { index: false, follow: false },
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
