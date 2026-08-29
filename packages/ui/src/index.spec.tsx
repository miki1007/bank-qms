import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionButton, StatusPill } from "./index";

describe("shared operational controls", () => {
  it("preserves disabled action semantics", () => {
    const action = vi.fn();
    render(
      <ActionButton disabled onClick={action}>
        Call next
      </ActionButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Call next" }));
    expect(action).not.toHaveBeenCalled();
  });

  it("renders a textual status so color is not the only signal", () => {
    render(<StatusPill tone="warning">Waiting</StatusPill>);
    expect(screen.getByText("Waiting")).toBeTruthy();
  });
});
