import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'Fringue Enterprise API',
  description: 'API reference for the Fringue virtual try-on B2B service',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
