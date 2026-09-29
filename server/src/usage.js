import fs from "node:fs";
import path from "node:path";

export class UsageLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageLimitError";
    this.code = "USAGE_LIMIT_EXCEEDED";
  }
}

function utcKeys(now = new Date()) {
  const iso = now.toISOString();
  return {
    day: iso.slice(0, 10),
    month: iso.slice(0, 7),
  };
}

function emptyState(now = new Date()) {
  const keys = utcKeys(now);
  return {
    dayKey: keys.day,
    monthKey: keys.month,
    daySeconds: 0,
    monthSeconds: 0,
    providers: {},
  };
}

export class UsageLimiter {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load(now = new Date()) {
    let state = emptyState(now);

    try {
      state = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const keys = utcKeys(now);

    if (state.dayKey !== keys.day) {
      state.dayKey = keys.day;
      state.daySeconds = 0;
    }

    if (state.monthKey !== keys.month) {
      state.monthKey = keys.month;
      state.monthSeconds = 0;
      state.providers = {};
    }

    state.providers ||= {};
    return state;
  }

  save(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
  }

  reserve({ provider, durationMs, limits, now = new Date() }) {
    const seconds = Math.max(1, Math.ceil(durationMs / 1000));
    const state = this.load(now);
    const providerState = state.providers[provider] || { monthSeconds: 0 };

    const dailyLimitSeconds = limits.dailyMinutes * 60;
    const monthlyLimitSeconds = limits.monthlyMinutes * 60;
    const providerLimitSeconds = limits.providerMonthlyMinutes * 60;

    if (state.daySeconds + seconds > dailyLimitSeconds) {
      throw new UsageLimitError("Daily local audio limit reached.");
    }

    if (state.monthSeconds + seconds > monthlyLimitSeconds) {
      throw new UsageLimitError("Monthly local audio limit reached.");
    }

    if (providerState.monthSeconds + seconds > providerLimitSeconds) {
      throw new UsageLimitError(`Monthly local limit reached for ${provider}.`);
    }

    state.daySeconds += seconds;
    state.monthSeconds += seconds;
    providerState.monthSeconds += seconds;
    state.providers[provider] = providerState;

    this.save(state);

    return {
      reservedSeconds: seconds,
      daySeconds: state.daySeconds,
      monthSeconds: state.monthSeconds,
      providerMonthSeconds: providerState.monthSeconds,
    };
  }

  snapshot(now = new Date()) {
    return this.load(now);
  }
}
