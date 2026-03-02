import type { Metadata } from 'next';
import './test.css';

export const metadata: Metadata = {
  title: 'Try-On API Tester — Fringue',
};

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
