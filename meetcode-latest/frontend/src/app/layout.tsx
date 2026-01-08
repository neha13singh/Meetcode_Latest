import { AuthProvider } from '@/context/AuthContext';
import { Inter } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'MeetCode',
  description: 'Real-time competitive coding platform',
};

import { logger } from '@/lib/logger';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  logger.info("Application Root Layout Intercepted - Logger Active");
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning={true}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
