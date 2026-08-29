import type { Metadata } from "next";

import { MobileStaffClient } from "../mobile-staff-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bank QMS Staff",
  description: "Secure mobile queue operations for tellers and managers.",
  manifest: "/staff-app.webmanifest",
  appleWebApp: {
    capable: true,
    title: "QMS Staff",
    statusBarStyle: "black-translucent",
  },
};

export default function StaffAppPage() {
  return <MobileStaffClient />;
}
