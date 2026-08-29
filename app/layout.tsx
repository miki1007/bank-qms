import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bank QMS",
  description:
    "Connected Bank QMS customer and staff mobile apps, kiosk, public display, teller console, and manager dashboard.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
