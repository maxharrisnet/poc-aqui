import type { MasterVersion } from "./discogs.js";
import type { PressingScope } from "./watchlist.js";

/**
 * At or below this many vinyl pressings we watch all of them; above it the
 * user picks. Config, not a constant of nature — see spec v0.2 §4.
 */
export const AUTO_WATCH_LIMIT = Number(process.env.PRESSING_AUTO_WATCH_LIMIT ?? 10);

export interface PressingPlan {
  scope: PressingScope;
  releaseIds: number[];
  totalVinylVersions: number;
  needsUserSelection: boolean;
  /** Populated only when the user must choose. */
  choices: MasterVersion[];
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
      releaseIds: fallbackReleaseId ? [fallbackReleaseId] : [],
      totalVinylVersions: fallbackReleaseId ? 1 : 0,
      needsUserSelection: false,
      choices: [],
    };
  }

  if (totalVinylVersions <= limit) {
    return {
      scope: "all",
      releaseIds: versions.map((v) => v.id),
      totalVinylVersions,
      needsUserSelection: false,
      choices: [],
    };
  }

  return {
    scope: "selected",
    releaseIds: [],
    totalVinylVersions,
    needsUserSelection: true,
    choices: versions,
  };
}
