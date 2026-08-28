import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PHYSI Enterprise',
  description: 'Enterprise-ready PHYSI pilot for campus verification, authority, and mining.',
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
