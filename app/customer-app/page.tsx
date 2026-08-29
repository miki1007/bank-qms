import type { Metadata } from "next";

import { MobileCustomerClient } from "../mobile-customer-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bank QMS Customer",
  description: "Join and follow your bank queue from your phone.",
  manifest: "/customer-app.webmanifest",
  appleWebApp: {
    capable: true,
    title: "QMS Customer",
    statusBarStyle: "black-translucent",
  },
};

export default function CustomerAppPage() {
  return <MobileCustomerClient />;
}
