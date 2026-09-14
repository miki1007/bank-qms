export type AnnouncementTarget = {
  publicNumber: string;
  counterLabel: string;
};

const AMHARIC_DIGITS: Record<string, string> = {
  "0": "ዜሮ",
  "1": "አንድ",
  "2": "ሁለት",
  "3": "ሶስት",
  "4": "አራት",
  "5": "አምስት",
  "6": "ስድስት",
  "7": "ሰባት",
  "8": "ስምንት",
  "9": "ዘጠኝ",
};

export function spokenDigits(value: string) {
  const digits = value.match(/\d/g);
  return digits?.length
    ? digits.map((digit) => AMHARIC_DIGITS[digit]).join(" ")
    : value;
}

export function announcementText(call: AnnouncementTarget) {
  return [
    "ትኬት ቁጥር",
    spokenDigits(call.publicNumber),
    "ወደ መስኮት ቁጥር",
    spokenDigits(call.counterLabel),
    "ይሂዱ።",
  ].join(" ");
}
