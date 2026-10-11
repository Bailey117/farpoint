import type { WorldBiome } from '../game/encounter';

export interface BiomeInfo {
  name: string;
  description: string;
}

export const BIOME_INFO: Record<WorldBiome, BiomeInfo> = {
  glass: {
    name: 'Glass Barrens',
    description: 'Dunes fused into sheets of green glass by some ancient heat. Blinding by day, ringing with wind by night.',
  },
  tidal: {
    name: 'Sunken Terraces',
    description: 'Stepped stone cities half-drowned by a slow, warm sea. The tides here are fast and very high.',
  },
  spore: {
    name: 'Sporewood',
    description: 'A canopy of towering fungal stalks. The air is thick, sweet and faintly luminous.',
  },
  rime: {
    name: 'Rimeveil',
    description: 'A white world of wind-carved ice and buried towers. Sound carries strangely in the cold.',
  },
  final: {
    name: 'The Farpoint',
    description: 'The world every address in the network was built to reach. No one alive has seen it.',
  },
};

/** Syllables for procedurally named worlds. */
export const WORLD_SYLLABLES = {
  start: ['Ka', 'Vel', 'Or', 'Thes', 'Mi', 'Dra', 'Ush', 'Ne', 'Sol', 'Ira', 'Pel', 'Zo'],
  middle: ['ra', 'ven', 'lo', 'shi', 'tar', 'mo', 'quel', 'di', 'an', 'ru'],
  end: ['th', 'n', 'ra', 'dor', 'is', 'el', 'ax', 'une', 'or', 'em'],
} as const;
