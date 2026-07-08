import '@/styles/globals.css';

import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: {
    default: 'Veridion - AI Smart Contract Security',
    template: '%s | Veridion',
  },
  description: 'AI-powered smart contract security platform with on-chain audit verification',
  keywords: ['smart contract', 'security', 'audit', 'solidity', 'blockchain', 'AI'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background min-h-screen font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
