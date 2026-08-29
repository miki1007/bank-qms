import { QmsClient } from "../qms-client";

export const dynamic = "force-dynamic";

export default function ManagerPage() {
  return <QmsClient surface="manager" />;
}
