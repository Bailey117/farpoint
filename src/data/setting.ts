/**
 * Content for procedural runs: who built the ring network, the factions
 * living in it now, and the parts worlds are assembled from. Pure data; the
 * rules that combine it live in src/game/setting.ts and src/game/world.ts.
 *
 * Every part of a world belongs to one biome, so a world can only be built
 * from parts that fit together. Each part carries a danger value; a world's
 * hazard is 1 plus the danger of its parts, so the hazard always has causes
 * the player can read.
 *
 * Text tokens: {builders} = the builders' name, {faction} = a faction's name
 * with its article ("the Rustwake Company"), {place} = a biome place phrase,
 * {ruin} = the world's ruin ("Aumari tide-clock").
 */

import type { BiomeId } from '../game/encounter';

// ---------------------------------------------------------------------------
// Name styles. A name is 1-3 syllables (onset + vowel) and a closing coda.
// Each style draws from its own sounds, so names from one place or people
// sound related, and different places sound different.
// ---------------------------------------------------------------------------

export interface NameStyle {
  /** Onsets for the first syllable (may include '' for a vowel start). */
  first: readonly string[];
  onsets: readonly string[];
  vowels: readonly string[];
  codas: readonly string[];
  /** Weights for 1, 2 and 3 syllables before the coda. */
  syllables: readonly [number, number, number];
}

export const NAME_STYLES = {
  // Worlds, by biome.
  glass: { first: ['k', 'kh', 's', 'sh', 't', 'z', 'r', 'd', 'q', 'a'], onsets: ['k', 's', 'sh', 'r', 'd', 'z', 'm'], vowels: ['a', 'i', 'e', 'a'], codas: ['r', 'sh', 'k', 'n', 'd', 'm', 'r'], syllables: [1, 6, 3] },
  tidal: { first: ['l', 'm', 'w', 'n', 'v', 'h', 's', 'o'], onsets: ['l', 'm', 'w', 'n', 'r', 's'], vowels: ['o', 'u', 'a', 'ae', 'e'], codas: ['', '', 'l', 'n', 'm'], syllables: [0, 5, 5] },
  spore: { first: ['b', 'g', 'm', 'd', 'br', 'th', 'u', 'o'], onsets: ['b', 'g', 'm', 'd', 'l', 'r'], vowels: ['u', 'o', 'a', 'au'], codas: ['m', 'n', 'r', 'th', 'l'], syllables: [0, 7, 3] },
  rime: { first: ['sk', 'v', 'h', 'f', 'st', 'hr', 'k', 'th', 'y'], onsets: ['v', 'r', 'k', 'th', 'l', 'n'], vowels: ['e', 'i', 'y', 'a'], codas: ['ld', 'r', 'n', 'st', 'k', 'rn'], syllables: [1, 7, 2] },
  // Peoples.
  builders: { first: ['', 'th', 's', 'v', 'm', 'l'], onsets: ['m', 'r', 'th', 'l', 'n', 's'], vowels: ['au', 'e', 'i', 'a', 'o'], codas: ['i', 'ae', 'en', 'is'], syllables: [0, 7, 3] },
  dominion: { first: ['v', 'g', 'kr', 'dr', 'x', 'z', 'th'], onsets: ['r', 'g', 'x', 'th', 'k', 'v'], vowels: ['o', 'a', 'u'], codas: ['th', 'r', 'x', 'rn', 'g'], syllables: [2, 7, 1] },
  elders: { first: ['s', 'l', 'th', 'n', 'f', 'y', 'e'], onsets: ['l', 's', 'n', 'th', 'r'], vowels: ['i', 'e', 'a'], codas: ['ari', 'en', 'ith', 'ir', 'ani'], syllables: [1, 7, 2] },
  common: { first: ['d', 'm', 'c', 'h', 'w', 't', 'r', 's', 'k'], onsets: ['t', 'd', 'm', 'n', 'l', 'r', 'v', 's'], vowels: ['a', 'e', 'o', 'i'], codas: ['n', 't', 'm', 'l', 'rt', 'sk', 'th', 'ck', 'r', 'nd'], syllables: [2, 7, 1] },
} as const satisfies Record<string, NameStyle>;

export type NameStyleId = keyof typeof NAME_STYLES;

// ---------------------------------------------------------------------------
// The builders: what they valued and how they ended.
// ---------------------------------------------------------------------------

export interface Devotion {
  id: string;
  /** Completes "The {builders} ..." */
  belief: string;
  /** Structures they left behind (used in ruins). */
  structures: readonly string[];
}

export const DEVOTIONS: readonly Devotion[] = [
  { id: 'tides', belief: 'kept time by the tides of a hundred seas', structures: ['tide-clock', 'moon-dial', 'reckoning hall'] },
  { id: 'song', belief: 'spoke to one another in song, across whole worlds', structures: ['song-wall', 'resonance hall', 'bell-tower'] },
  { id: 'record', belief: 'wrote down everything they ever learned', structures: ['archive', 'record-hall', 'memory vault'] },
  { id: 'gardens', belief: 'carried living things to every world they reached', structures: ['seed vault', 'glasshouse', 'terrace garden'] },
  { id: 'stars', belief: 'steered by stars no one else could see', structures: ['observatory', 'star-dome', 'orrery'] },
  { id: 'craft', belief: 'built machines meant to outlast them', structures: ['engine-house', 'foundry', 'workshop'] },
];

export interface Fall {
  id: string;
  /** Completes "Then they ..." */
  ending: string;
}

export const FALLS: readonly Fall[] = [
  { id: 'silence', ending: 'fell silent, all at once, in the middle of a sentence' },
  { id: 'flood', ending: 'drowned their own cities to stop something from spreading' },
  { id: 'sleep', ending: 'lay down in their vaults to sleep, and never woke' },
  { id: 'departure', ending: 'dialled one last address together, and never came back' },
  { id: 'war', ending: 'turned the rings against one another' },
  { id: 'fading', ending: 'dwindled, one ring at a time, until no one answered' },
];

// ---------------------------------------------------------------------------
// Factions: the powers living in the network now.
// ---------------------------------------------------------------------------

export type FactionTier = 'major' | 'minor';

export interface FactionArchetype {
  id: string;
  tier: FactionTier;
  /**
   * Name patterns. {gen} = a generated name in `style`, {word} = one of
   * `words`, {builders} = the builders' name.
   */
  names: readonly string[];
  style: NameStyleId;
  words?: readonly string[];
  /** Whether the name takes "the" ("the Rustwake Company" vs "Heirs of ..."). */
  article: boolean;
  /** Starting standing range (-3 at war .. 3 allied). */
  standing: readonly [number, number];
  /** Who they are. Never uses {faction} as a subject, so no verb has to agree with the name. */
  blurb: string;
  /** How they appear on a world: with ruins present, and without. */
  presence: { ruins: string; open: string };
}

export const ARCHETYPES: readonly FactionArchetype[] = [
  {
    id: 'dominion',
    tier: 'major',
    names: ['{gen} Ascendancy', '{gen} Dominion', 'Throne of {gen}'],
    style: 'dominion',
    article: true,
    standing: [-2, -2],
    blurb: 'A spreading empire of ring worlds, ruled by force. The armies of {faction} claim every {builders} relic as their birthright.',
    presence: {
      ruins: 'Soldiers of {faction} hold this world, and they have claimed the {ruin}.',
      open: 'Soldiers of {faction} hold this world. A garrison is dug in {place}, and its watchtowers face the ring.',
    },
  },
  {
    id: 'elders',
    tier: 'major',
    names: ['{gen}', '{gen}'],
    style: 'elders',
    article: true,
    standing: [-1, 0],
    blurb: 'An old and quiet people with knowledge far beyond yours. The envoys of {faction} watch the network closely and share almost nothing.',
    presence: {
      ruins: 'An outpost of {faction} stands {place}, watching over the {ruin}. Its doors are shut.',
      open: 'An outpost of {faction} stands {place}. Its doors are shut, and it is watching the ring.',
    },
  },
  {
    id: 'remnant',
    tier: 'major',
    names: ['Heirs of the {builders}', 'Last {builders}'],
    style: 'builders',
    article: true,
    standing: [-1, 0],
    blurb: 'Descendants of the {builders}, or so they claim. They keep the old rites, guard what is left, and do not trust strangers with it.',
    presence: {
      ruins: 'A hidden settlement of {faction} lies {place}, close to the {ruin} they tend.',
      open: 'A hidden settlement of {faction} lies {place}. Its lookouts saw you arrive.',
    },
  },
  {
    id: 'salvagers',
    tier: 'minor',
    names: ['{word} Company', '{word} Crews'],
    style: 'common',
    words: ['Rustwake', 'Ashen', 'Hollowhand', 'Brine', 'Cinder', 'Blackwater', 'Gravel'],
    article: true,
    standing: [-2, -1],
    blurb: 'Ruin-strippers who will sell anything they can carry. The crews of {faction} do not like to share a site.',
    presence: {
      ruins: 'Salvage crews from {faction} have staked a claim on the {ruin}.',
      open: 'Salvage crews from {faction} are camped {place}, picking over whatever they can find.',
    },
  },
  {
    id: 'traders',
    tier: 'minor',
    names: ['{word} Concord', '{word} League'],
    style: 'common',
    words: ['Saltway', 'Long Road', 'Amber', 'Copperline', 'Waymark', 'Fairwind'],
    article: true,
    standing: [0, 1],
    blurb: 'Merchants who carry goods between the worlds that still trade. The caravans of {faction} keep the peace where it pays.',
    presence: {
      ruins: 'Traders of {faction} have set up a market {place}, within sight of the {ruin}.',
      open: 'Traders of {faction} have set up a market {place}.',
    },
  },
  {
    id: 'order',
    tier: 'minor',
    names: ['Order of the {word}'],
    style: 'common',
    words: ['Closed Ring', 'Still Gate', 'Last Door', 'Quiet Hand', 'Unturning Wheel', 'Long Silence'],
    article: true,
    standing: [-2, -1],
    blurb: 'A faith that holds the network woke something once and must never be opened again. The pilgrims of {faction} bury rings, and the people who use them.',
    presence: {
      ruins: 'Pilgrims of {faction} keep a vigil at the {ruin}, and they have begun to wall it up.',
      open: 'Pilgrims of {faction} keep a vigil {place}, and they are watching the ring.',
    },
  },
  {
    id: 'exiles',
    tier: 'minor',
    names: ['{gen} Exiles', '{gen} Wanderers'],
    style: 'common',
    article: true,
    standing: [0, 1],
    blurb: 'A people who fled their own world through the ring. The families of {faction} have been looking for a new home ever since.',
    presence: {
      ruins: 'Families of {faction} have made shelters {place}, within sight of the {ruin}.',
      open: 'Families of {faction} have made shelters {place}, and their smoke rises in thin lines.',
    },
  },
  {
    id: 'survey',
    tier: 'minor',
    names: ['{gen} Survey', '{gen} Expedition'],
    style: 'common',
    article: true,
    standing: [-1, 0],
    blurb: 'Explorers from another home world, mapping the network the same as you. The scouts of {faction} are rivals, for now.',
    presence: {
      ruins: 'A survey team from {faction} is mapping the {ruin}.',
      open: 'A survey team from {faction} has set up camp {place}.',
    },
  },
];

/** Major factions are a threat and a power you might win over; minors fill out the network. */
export const RUN_FACTIONS = { threat: ['dominion'], aloof: ['elders', 'remnant'], minors: 2 } as const;

export const STANDING_LABEL: Record<number, string> = {
  [-3]: 'At war',
  [-2]: 'Hostile',
  [-1]: 'Distrustful',
  0: 'Neutral',
  1: 'Cordial',
  2: 'Friendly',
  3: 'Allied',
};

// ---------------------------------------------------------------------------
// World parts, by biome.
// ---------------------------------------------------------------------------

export interface Part {
  id: string;
  /** Short name used in the hazard breakdown. */
  label: string;
  text: string;
  danger: number;
}

export interface BiomeParts {
  /** What you see stepping through. Never dangerous. */
  landmarks: readonly { id: string; text: string }[];
  /** Weather and season (danger 0-2). */
  conditions: readonly Part[];
  /** Animal life (danger 0-1). */
  wildlife: readonly Part[];
  /** Where a faction or ruin sits on this kind of world. Lower case, completes a sentence. */
  places: readonly string[];
  /** Ruin settings: lower-case phrases ending "... {place}". */
  ruinPlaces: readonly string[];
}

export const BIOME_PARTS: Record<BiomeId, BiomeParts> = {
  glass: {
    landmarks: [
      { id: 'fused-dunes', text: 'Dunes fused into sheets of green glass stretch to the horizon.' },
      { id: 'mirror-canyon', text: 'A canyon of mirrored walls cuts through the plain, and the ring stands at its mouth.' },
      { id: 'spire-rows', text: 'Black glass spires rise from the sand in long, straight rows.' },
      { id: 'frozen-waves', text: 'The glass here has set in frozen waves, taller than a person.' },
      { id: 'white-lakebed', text: 'A dry lake bed of white glass has cracked into hexagons underfoot.' },
    ],
    conditions: [
      { id: 'still', label: 'still air', text: 'The air is still and the glass lies quiet.', danger: 0 },
      { id: 'cool-season', label: 'cool season', text: 'It is the cool season, and the glass only burns to the touch at noon.', danger: 0 },
      { id: 'glare', label: 'blinding glare', text: 'The sun is fierce, and every pane throws it back in your eyes.', danger: 1 },
      { id: 'grit-wind', label: 'cutting winds', text: 'The wind rarely drops, and it carries grit sharp enough to cut.', danger: 1 },
      { id: 'sunstorms', label: 'sunstorm season', text: 'It is sunstorm season. The heat comes in waves strong enough to blister through a suit.', danger: 2 },
      { id: 'glass-quakes', label: 'glass quakes', text: 'The ground shifts often, and whole sheets of glass crack and fall away into the dark below.', danger: 2 },
    ],
    wildlife: [
      { id: 'crawlers', label: 'crawlers', text: 'Small glass-shelled crawlers scatter from your shadow.', danger: 0 },
      { id: 'glass-eaters', label: 'glass-eaters', text: 'Armoured glass-eaters graze the dunes, and they do not like company.', danger: 1 },
    ],
    places: ['among the dunes', 'at the edge of the glass plain', 'in a sheltered hollow of the dunes', 'along the canyon floor'],
    ruinPlaces: ['half-buried in the glass', 'at the head of a dry valley', 'in the shade of the spires'],
  },
  tidal: {
    landmarks: [
      { id: 'drowned-terraces', text: 'Stepped stone cities stand half-drowned in a warm, green sea.' },
      { id: 'flooded-towers', text: 'Flooded towers rise from the water in a long, crooked line.' },
      { id: 'causeway', text: 'A causeway of carved stone runs out over the water and vanishes beneath it.' },
      { id: 'lagoon', text: 'A ring of terraced islands encloses a still lagoon.' },
      { id: 'sea-arches', text: 'The sea has carved the terraces into arches, and it booms through them.' },
    ],
    conditions: [
      { id: 'calm', label: 'calm seas', text: 'The sea is calm and the tide is slow.', danger: 0 },
      { id: 'neap', label: 'neap tides', text: 'The tides are small this season, and the lower terraces stay dry for hours.', danger: 0 },
      { id: 'fast-tides', label: 'fast tides', text: 'The tide comes in fast here, and the lower terraces flood twice a day.', danger: 1 },
      { id: 'sea-fog', label: 'sea fog', text: 'A thick fog sits on the water for most of the day.', danger: 1 },
      { id: 'storms', label: 'storm season', text: 'It is storm season. Waves break over the third terrace.', danger: 2 },
      { id: 'great-tides', label: 'the great tides', text: 'The great tides are running. Water climbs the terraces faster than anyone can.', danger: 2 },
    ],
    wildlife: [
      { id: 'fish', label: 'reef fish', text: 'Bright fish flicker through the flooded streets.', danger: 0 },
      { id: 'deep-thing', label: 'something in the water', text: 'Something large moves under the water near the steps.', danger: 1 },
    ],
    places: ['on the upper terraces', 'on the far islands', 'out along the causeway', 'in the flooded towers'],
    ruinPlaces: ['below the waterline', 'on the highest terrace', 'at the end of the causeway'],
  },
  spore: {
    landmarks: [
      { id: 'stalk-forest', text: 'Fungal stalks tower overhead, their caps lost in a glowing haze.' },
      { id: 'stalk-marsh', text: 'A forest of pale, ribbed stalks stands in still water.' },
      { id: 'thread-mat', text: 'The ground is a soft mat of threads that glow faintly where you step.' },
      { id: 'shelf-cliffs', text: 'Shelf-fungus climbs the cliffs in giant tiers, like stairs built for something enormous.' },
      { id: 'breathing-crater', text: 'A crater is filled to the brim by a single vast growth that rises and falls as if breathing.' },
    ],
    conditions: [
      { id: 'dormant', label: 'dormant season', text: 'The stalks are dormant and the air is almost clear.', danger: 0 },
      { id: 'damp', label: 'damp and still', text: 'The air is damp and still, and little stirs.', danger: 0 },
      { id: 'thick-haze', label: 'thick spore haze', text: 'The spore haze is thick enough to taste, and breathing is slow work.', danger: 1 },
      { id: 'bloom', label: 'bloom season', text: 'It is bloom season. Every few hours the air turns gold.', danger: 1 },
      { id: 'rot-fever', label: 'rot fever', text: 'A rot is spreading through the stalks, and the haze carries a fever.', danger: 2 },
      { id: 'canopy-fall', label: 'falling canopy', text: 'The canopy is shedding. Pods the size of houses come down without warning.', danger: 2 },
    ],
    wildlife: [
      { id: 'grazers', label: 'grazers', text: 'Placid grazers drift between the stalks.', danger: 0 },
      { id: 'spine-hunters', label: 'spine-backed hunters', text: 'Spine-backed hunters move through the canopy above you.', danger: 1 },
    ],
    places: ['in a clearing among the stalks', 'up in the canopy', 'on the high shelves', 'along the edge of the marsh'],
    ruinPlaces: ['grown through with stalks', 'in a clearing the fungus will not touch', 'deep among the stalks'],
  },
  rime: {
    landmarks: [
      { id: 'carved-ice', text: 'Wind-carved ice stretches white in every direction, broken by buried towers.' },
      { id: 'frozen-sea', text: 'A frozen sea lies under a sky of green and violet light.' },
      { id: 'glacier-valley', text: 'Ice cliffs ring a valley of blue-white glacier.' },
      { id: 'snow-city', text: 'Snow lies over the ruins of a city. The lines of its streets still show.' },
      { id: 'steam-vents', text: 'Steam rises from vents in the ice, and the snow around them is stained orange.' },
    ],
    conditions: [
      { id: 'clear', label: 'clear skies', text: 'The sky is clear, and the cold is bitter but steady.', danger: 0 },
      { id: 'thaw', label: 'brief thaw', text: 'A brief thaw has softened the snow, and the wind has dropped.', danger: 0 },
      { id: 'drifts', label: 'drifting snow', text: 'Snow drifts across everything and hides the crevasses.', danger: 1 },
      { id: 'long-night', label: 'the long night', text: 'It is the long night. The sun has not risen in weeks.', danger: 1 },
      { id: 'whiteouts', label: 'whiteout season', text: 'It is whiteout season. Storms roll in without warning.', danger: 2 },
      { id: 'deep-freeze', label: 'deep freeze', text: 'The cold is deep enough to crack metal.', danger: 2 },
    ],
    wildlife: [
      { id: 'snow-hares', label: 'snow-hares', text: 'Snow-hares tunnel through the drifts.', danger: 0 },
      { id: 'pale-hunters', label: 'pale hunters', text: 'Pale hunters run in packs along the ridges.', danger: 1 },
    ],
    places: ['in the lee of the ice cliffs', 'out on the frozen sea', 'among the buried towers', 'around the steam vents'],
    ruinPlaces: ['locked in the ice', 'under a dome of packed snow', 'at the foot of the glacier'],
  },
};

export interface RuinState {
  id: string;
  label: string;
  /** Completes "{A} {builders} {structure} ... " */
  text: string;
  danger: number;
}

export const RUIN_STATES: readonly RuinState[] = [
  { id: 'open', label: 'open ruins', text: 'stands open and empty', danger: 0 },
  { id: 'sealed', label: 'sealed ruins', text: 'is sealed, but intact', danger: 0 },
  { id: 'picked', label: 'ruins', text: 'was picked clean long ago', danger: 0 },
  { id: 'guarded', label: 'ruin guardians', text: 'is still guarded by its machines', danger: 1 },
  { id: 'unstable', label: 'unstable ruins', text: 'is cracking apart, and its floors shift underfoot', danger: 1 },
];
