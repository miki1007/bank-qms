import type { Metadata } from "next";
import "./globals.css";
import "./worldlink.css";

export const metadata: Metadata = {
  title: "WorldLink Bank | Queue Management",
  description:
    "WorldLink Bank customer queue portal, teller console, manager dashboard, branch kiosk and public number display. Academic demonstration.",
  icons: {
    icon: "/worldlink-bank-logo.jpeg",
    shortcut: "/worldlink-bank-logo.jpeg",
    apple: "/worldlink-bank-logo.jpeg",
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
