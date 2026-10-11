/**
 * The 24 glyphs of the ring network. Identity and names only; the SVG
 * artwork lives in src/ui/glyphArt.ts so game logic never touches rendering.
 */

export const GLYPH_IDS = [
  'cairn', 'weir', 'spindle', 'lantern', 'crest', 'thorn',
  'hollow', 'tide', 'loom', 'keel', 'gyre', 'fork',
  'mantle', 'shard', 'bloom', 'tether', 'beacon', 'ridge',
  'span', 'seed', 'hearth', 'knot', 'step', 'vane',
] as const;

export type GlyphId = (typeof GLYPH_IDS)[number];

export const GLYPH_COUNT = GLYPH_IDS.length;

const GLYPH_SET: ReadonlySet<string> = new Set(GLYPH_IDS);

export function isGlyphId(value: string): value is GlyphId {
  return GLYPH_SET.has(value);
}

export function glyphName(id: GlyphId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
