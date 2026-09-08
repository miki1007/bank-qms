export const BANK_NAME = "WorldLink Bank";
export const BANK_LOGO = "/worldlink-bank-logo.jpeg";
export const BANK_TIMEZONE = "Africa/Addis_Ababa";
export const DEFAULT_BRANCH_CODE = "SUMMIT";

export const BANK_BRANCHES = [
  { code: "SUMMIT", name: "Summit" },
  { code: "CMC", name: "CMC" },
  { code: "AYAT", name: "Ayat" },
  { code: "PIYASSA", name: "Piyassa" },
  { code: "4-KILLO", name: "4 Killo" },
  { code: "STADIUM", name: "Stadium" },
  { code: "MEGENAGNA", name: "Megenagna" },
  { code: "MEXICO", name: "Mexico" },
  { code: "BOLE", name: "Bole" },
  { code: "SHOLA", name: "Shola" },
  { code: "LIDETA", name: "Lideta" },
] as const;

export function bankBranch(code: unknown) {
  return BANK_BRANCHES.find((branch) => branch.code === code);
}
