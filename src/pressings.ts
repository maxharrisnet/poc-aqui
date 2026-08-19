import type { MasterVersion } from "./discogs.js";
import type { PressingScope } from "./watchlist.js";

/**
 * At or below this many vinyl pressings we watch all of them; above it the
 * user picks. Config, not a constant of nature — see spec v0.2 §4.
 */
const DEFAULT_AUTO_WATCH_LIMIT = 10;

function readAutoWatchLimit(): number {
  const raw = process.env.PRESSING_AUTO_WATCH_LIMIT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_AUTO_WATCH_LIMIT;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.warn(
      `PRESSING_AUTO_WATCH_LIMIT must be a positive integer — got "${raw}". ` +
        `Falling back to ${DEFAULT_AUTO_WATCH_LIMIT}.`,
    );
    return DEFAULT_AUTO_WATCH_LIMIT;
  }
  return parsed;
}

export const AUTO_WATCH_LIMIT = readAutoWatchLimit();

export interface PressingPlan {
  scope: PressingScope;
  releaseIds: number[];
  totalVinylVersions: number;
  needsUserSelection: boolean;
  /** Populated only when the user must choose. */
  choices: MasterVersion[];
  /**
   * True when `choices` holds fewer pressings than `totalVinylVersions` — we
   * fetch a single 100-item page. The UI must say so rather than implying the
   * list is complete.
   */
  choicesTruncated: boolean;
}

export function planPressings(
  versions: MasterVersion[],
  totalVinylVersions: number,
  limit: number,
  fallbackReleaseId?: number,
): PressingPlan {
  if (totalVinylVersions === 0) {
    return {
      scope: "all",
      releaseIds: fallbackReleaseId !== undefined ? [fallbackReleaseId] : [],
      totalVinylVersions: fallbackReleaseId !== undefined ? 1 : 0,
      needsUserSelection: false,
      choices: [],
      choicesTruncated: false,
    };
  }

  if (totalVinylVersions <= limit) {
    return {
      scope: "all",
      releaseIds: versions.map((v) => v.id),
      totalVinylVersions,
      needsUserSelection: false,
      choices: [],
      choicesTruncated: false,
    };
  }

  return {
    scope: "selected",
    releaseIds: [],
    totalVinylVersions,
    needsUserSelection: true,
    choices: versions,
    choicesTruncated: versions.length < totalVinylVersions,
  };
}
