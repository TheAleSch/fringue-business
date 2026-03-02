import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Try-On API Test — Fringue',
};

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          * { margin: 0; }
          body { line-height: 1.5; -webkit-font-smoothing: antialiased; }
          img, video { max-width: 100%; display: block; }
          input, button, textarea, select { font: inherit; }
        `}</style>
      </head>
      <body className="bg-zinc-50 text-zinc-900 min-h-screen">{children}</body>
    </html>
  );
}
