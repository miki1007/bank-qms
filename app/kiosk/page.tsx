import { QmsClient } from "../qms-client";

export const dynamic = "force-dynamic";

export default function KioskPage() {
  return <QmsClient surface="kiosk" />;
}
