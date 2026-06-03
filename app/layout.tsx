import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Webinar Registrants — Admin',
  description: 'Browse, filter, and search the Supabase webinar migration data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
