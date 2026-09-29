import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { UsageLimitError, UsageLimiter } from "../src/usage.js";

function temporaryUsageFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stt-usage-"));
  return path.join(dir, "usage.json");
}

test("reserves usage and persists counters", () => {
  const limiter = new UsageLimiter(temporaryUsageFile());
  const result = limiter.reserve({
    provider: "deepgram",
    durationMs: 10_100,
    limits: {
      dailyMinutes: 30,
      monthlyMinutes: 300,
      providerMonthlyMinutes: 300,
    },
    now: new Date("2026-09-29T12:00:00Z"),
  });

  assert.equal(result.reservedSeconds, 11);
  assert.equal(result.daySeconds, 11);
  assert.equal(result.monthSeconds, 11);
  assert.equal(result.providerMonthSeconds, 11);
});

test("blocks a provider after its monthly cap", () => {
  const limiter = new UsageLimiter(temporaryUsageFile());
  const limits = {
    dailyMinutes: 100,
    monthlyMinutes: 100,
    providerMonthlyMinutes: 0.1,
  };
  const now = new Date("2026-09-29T12:00:00Z");

  limiter.reserve({
    provider: "chirp",
    durationMs: 5_000,
    limits,
    now,
  });

  assert.throws(
    () =>
      limiter.reserve({
        provider: "chirp",
        durationMs: 2_000,
        limits,
        now,
      }),
    UsageLimitError,
  );
});

test("daily usage resets on the next UTC day", () => {
  const limiter = new UsageLimiter(temporaryUsageFile());
  const limits = {
    dailyMinutes: 1,
    monthlyMinutes: 100,
    providerMonthlyMinutes: 100,
  };

  limiter.reserve({
    provider: "gemini",
    durationMs: 59_000,
    limits,
    now: new Date("2026-09-29T23:59:00Z"),
  });

  assert.doesNotThrow(() =>
    limiter.reserve({
      provider: "gemini",
      durationMs: 59_000,
      limits,
      now: new Date("2026-09-30T00:01:00Z"),
    }),
  );
});
