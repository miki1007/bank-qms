import { BANK_LOGO, BANK_NAME } from "@/lib/bank-brand";
import Image from "next/image";

export function BankLogo({ size = 44 }: { size?: number }) {
  return (
    <Image
      className="worldlink-logo"
      src={BANK_LOGO}
      alt={`${BANK_NAME} emblem`}
      width={size}
      height={size}
      unoptimized
    />
  );
}
