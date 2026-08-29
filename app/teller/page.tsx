import { QmsClient } from "../qms-client";

export const dynamic = "force-dynamic";

export default function TellerPage() {
  return <QmsClient surface="teller" />;
}
