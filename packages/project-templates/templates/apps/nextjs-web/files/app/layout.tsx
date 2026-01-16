import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
// @obora:layout-imports
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "{{PROJECT_NAME}}",
  description: "Created with obora-kit",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // @obora:layout-async
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* @obora:layout-provider-start */}
        <Providers>{children}</Providers>
        {/* @obora:layout-provider-end */}
      </body>
    </html>
  );
}
