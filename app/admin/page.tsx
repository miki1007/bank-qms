import { QmsClient } from "../qms-client";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <QmsClient surface="admin" />;
}
