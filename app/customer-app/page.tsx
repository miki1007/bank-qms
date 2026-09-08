import type { Metadata } from "next";

import { MobileCustomerClient } from "../mobile-customer-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WorldLink Bank | Customer Portal",
  description: "Join and follow your bank queue from your phone.",
  manifest: "/customer-app.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WorldLink",
    statusBarStyle: "black-translucent",
  },
};

export default function CustomerAppPage() {
  return <MobileCustomerClient />;
}
