import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stray Pages",
  description: "Private novel translation and language-learning reader.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
