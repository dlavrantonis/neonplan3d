import assert from "node:assert/strict";
import { test } from "node:test";
import { bundleIsStale, refreshTarget } from "./cache-refresh.ts";

test("a different bundle token is stale, a missing one is not", () => {
  assert.equal(bundleIsStale("1.20.1-aaaa", "1.20.1-bbbb"), true);
  assert.equal(bundleIsStale("1.20.1-aaaa", "1.20.1-aaaa"), false);
  assert.equal(bundleIsStale(null, "1.20.1-aaaa"), false);
  assert.equal(bundleIsStale("1.20.1-aaaa", null), false);
});

test("the refresh address is new once, and the Reload button always changes it", () => {
  const page = "https://home.local/neonplan3d/home";
  const next = refreshTarget(page, "1.20.1-bbbb");
  assert.ok(next);
  const url = new URL(next!);
  assert.equal(url.searchParams.get("fp3d_bundle"), "1.20.1-bbbb");
  assert.equal(refreshTarget(url.href, "1.20.1-bbbb"), null);
  const again = refreshTarget(url.href, "1.20.1-bbbb", true);
  assert.ok(again && again !== url.href);
  assert.ok(new URL(again!).searchParams.get("fp3d_bundle")!.startsWith("1.20.1-bbbb."));
});
