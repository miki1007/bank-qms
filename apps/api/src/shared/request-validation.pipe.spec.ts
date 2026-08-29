import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error";
import { RequestValidationPipe } from "./request-validation.pipe";

const bodyMetadata = { type: "body" as const };

describe("RequestValidationPipe", () => {
  const pipe = new RequestValidationPipe();

  it("passes ordinary JSON bodies through unchanged", () => {
    const body = { username: "manager.dev", filters: ["today"] };
    expect(pipe.transform(body, bodyMetadata)).toBe(body);
  });

  it("rejects prototype-pollution keys before controllers run", () => {
    const body = JSON.parse('{"__proto__":{"isAdmin":true}}') as unknown;
    expect(() => pipe.transform(body, bodyMetadata)).toThrow(DomainError);
  });

  it("rejects excessively deep payloads", () => {
    const body: Record<string, unknown> = {};
    let cursor = body;
    for (let index = 0; index < 14; index += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    expect(() => pipe.transform(body, bodyMetadata)).toThrow(
      "The request payload is too deeply nested.",
    );
  });
});
