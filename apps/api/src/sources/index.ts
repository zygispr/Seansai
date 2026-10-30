import type { Logger } from '../lib/logger.ts';
import type { SourceAdapter, SourceId } from './types.ts';

export type SourceConfig = {
  id: SourceId;
  enabled: boolean;
  /** Fetch even where robots.txt disallows it. Only with a written owner decision. */
  robotsOverride: boolean;
  overrideReason: string | null;
};

const OWNER_OVERRIDE_REASON = 'Owner decision 2026-10-30, see research.md §1b';

const strict = (id: SourceId): SourceConfig => ({
  id,
  enabled: true,
  robotsOverride: false,
  overrideReason: null,
});

export const sourceConfigs: readonly SourceConfig[] = [
  strict('apollo'),
  strict('forum'),
  strict('pasaka'),
  strict('skalvija'),
  strict('atlantis'),
  strict('garsas'),
  strict('spindulys'),
  strict('minija'),
  strict('romuva'),
  { id: 'vue', enabled: true, robotsOverride: true, overrideReason: OWNER_OVERRIDE_REASON },
  { id: 'cinamon', enabled: true, robotsOverride: true, overrideReason: OWNER_OVERRIDE_REASON },
];

/** Adapters for the configured sources; registered as they are built (T060–T067). */
export const adapters: readonly SourceAdapter[] = [];

export function findSourceConfig(id: SourceId): SourceConfig | undefined {
  return sourceConfigs.find((config) => config.id === id);
}

/** Every robots.txt override is logged at startup so it is never silent. */
export function logRobotsOverrides(logger: Logger, configs = sourceConfigs): void {
  for (const config of configs) {
    if (config.enabled && config.robotsOverride) {
      logger.warn(
        { source: config.id, reason: config.overrideReason },
        'Source runs with a robots.txt override',
      );
    }
  }
}
