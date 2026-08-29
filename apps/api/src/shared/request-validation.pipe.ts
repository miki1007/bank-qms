import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from "@nestjs/common";
import { DomainError } from "./domain-error";

const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
const maxDepth = 12;
const maxObjectKeys = 256;
const maxArrayItems = 512;
const maxStringLength = 32_768;

function reject(message: string): never {
  throw new DomainError("VALIDATION_ERROR", message, 400);
}

function inspectJsonValue(
  value: unknown,
  depth: number,
  visited: WeakSet<object>,
): void {
  if (typeof value === "string") {
    if (value.length > maxStringLength) {
      reject("A request value is too long.");
    }
    if (value.includes("\0")) {
      reject("A request value contains unsupported characters.");
    }
    return;
  }

  if (value === null || typeof value !== "object") return;
  if (depth > maxDepth) reject("The request payload is too deeply nested.");
  if (visited.has(value)) reject("The request payload must be valid JSON.");
  visited.add(value);

  if (Array.isArray(value)) {
    if (value.length > maxArrayItems) {
      reject("The request contains too many list items.");
    }
    for (const item of value) inspectJsonValue(item, depth + 1, visited);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    reject("The request payload contains an unsupported value.");
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > maxObjectKeys) {
    reject("The request contains too many fields.");
  }
  for (const [key, item] of entries) {
    if (forbiddenKeys.has(key)) {
      reject("The request payload contains an unsupported field.");
    }
    inspectJsonValue(item, depth + 1, visited);
  }
}

/**
 * Guards every HTTP argument before controller code runs. Endpoint-specific
 * schemas and domain services remain responsible for business validation.
 */
@Injectable()
export class RequestValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === "body" || metadata.type === "query") {
      inspectJsonValue(value, 0, new WeakSet());
    }
    return value;
  }
}
