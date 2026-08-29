import { QmsClient } from "../qms-client";

export const dynamic = "force-dynamic";

export default function DisplayPage() {
  return <QmsClient surface="display" />;
}
