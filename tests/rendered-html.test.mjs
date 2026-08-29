import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const productTitle = /title:\s*["']Bank QMS["']/i;
const developmentPreviewMeta = /codex-preview/i;

test("builds the Bank QMS product without the starter preview marker", async () => {
  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  await access(new URL("../dist/server/index.js", import.meta.url));

  assert.match(layout, productTitle);
  assert.doesNotMatch(layout, developmentPreviewMeta);
});
