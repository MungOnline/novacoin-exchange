'use client';

import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <title>NovaCoin Exchange - แพลตฟอร์มซื้อขายเหรียญดิจิทัล</title>
        <meta name="description" content="NovaCoin (NVC) - แพลตฟอร์มซื้อขายเหรียญดิจิทัลที่ปลอดภัยและน่าเชื่อถือ" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/novacoin-logo.svg" />
      </head>
      <body className="min-h-screen bg-slate-50">
        <AuthProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
