export type AnnouncementTarget = {
  publicNumber: string;
  counterLabel: string;
  serviceName: string;
};

const ENGLISH_DIGITS: Record<string, string> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
};

export function spokenDigits(value: string) {
  const digits = value.match(/\d/g);
  return digits?.length
    ? digits.map((digit) => ENGLISH_DIGITS[digit]).join(" ")
    : value;
}

export function announcementText(call: AnnouncementTarget) {
  const serviceName = call.serviceName.trim() || "Service";
  return [
    `${serviceName} ticket number ${spokenDigits(call.publicNumber)}.`,
    `Please proceed to counter number ${spokenDigits(call.counterLabel)}.`,
  ].join(" ");
}
