import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/query-provider';
import '@/styles/globals.css';

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
      <body className="min-h-screen bg-background font-sans antialiased">
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
