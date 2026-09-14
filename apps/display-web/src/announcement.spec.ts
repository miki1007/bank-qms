import { describe, expect, it } from "vitest";
import { announcementText, spokenDigits } from "./announcement";

describe("Amharic public-display announcement", () => {
  it("speaks ticket and counter digits individually", () => {
    expect(
      announcementText({
        publicNumber: "DEP-042",
        counterLabel: "Counter 3",
      }),
    ).toBe("ትኬት ቁጥር ዜሮ አራት ሁለት ወደ መስኮት ቁጥር ሶስት ይሂዱ።");
  });

  it("keeps a non-numeric counter label as a safe fallback", () => {
    expect(spokenDigits("Customer Care Desk")).toBe("Customer Care Desk");
  });
});
