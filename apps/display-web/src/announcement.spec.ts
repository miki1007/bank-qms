import { describe, expect, it } from "vitest";
import { announcementText, spokenDigits } from "./announcement";

describe("English public-display announcement", () => {
  it("speaks ticket digits individually so leading zeroes are preserved", () => {
    expect(spokenDigits("DEP-042")).toBe("zero four two");
  });

  it("directs the customer to the assigned counter", () => {
    expect(
      announcementText({
        publicNumber: "DEP-042",
        counterLabel: "Counter 3",
        serviceName: "Deposit",
      }),
    ).toBe(
      "Deposit ticket number zero four two. Please proceed to counter number three.",
    );
  });

  it("identifies different services before speaking their ticket numbers", () => {
    expect(
      announcementText({
        publicNumber: "WDR-1234",
        counterLabel: "Counter 2",
        serviceName: "Cash Withdrawal",
      }),
    ).toBe(
      "Cash Withdrawal ticket number one two three four. Please proceed to counter number two.",
    );
    expect(
      announcementText({
        publicNumber: "TRF-008",
        counterLabel: "Counter 4",
        serviceName: "Transfer",
      }),
    ).toContain("Transfer ticket number zero zero eight.");
  });

  it("keeps a non-numeric counter label as a safe fallback", () => {
    expect(spokenDigits("Customer Care Desk")).toBe("Customer Care Desk");
  });
});
