import { describe, expect, it } from "vitest";
import { announcementText, spokenDigits } from "./announcement";

describe("English display announcements", () => {
  it("speaks ticket digits individually so leading zeroes are preserved", () => {
    expect(spokenDigits("DEP-042")).toBe("zero four two");
  });

  it("directs the customer to the assigned counter", () => {
    expect(
      announcementText({
        publicNumber: "DEP-042",
        counterLabel: "Counter 3",
      }),
    ).toBe(
      "Ticket number zero four two. Please proceed to counter number three.",
    );
  });
});
