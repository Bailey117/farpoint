/**
 * Encounter content. Pure data: the engine in src/game/expedition.ts reads
 * this and never hard-codes encounter logic.
 *
 * Text placeholders: {actor} = the member who attempted the check,
 * {target} = the member an effect landed on.
 */

import type { EncounterDef } from '../game/encounter';

export const ENCOUNTERS: readonly EncounterDef[] = [
  // ---------------------------------------------------------------------
  // Glass Barrens
  // ---------------------------------------------------------------------
  {
    id: 'glass-singing-dunes',
    biome: 'glass',
    title: 'The Singing Dunes',
    text: 'Wind pours through fins of fused glass and the whole valley hums one low, rising note. Within minutes everyone has a headache. Within an hour, someone will have a nosebleed.',
    probeHint: 'Acoustic sensors picked up a sustained tone across a wide area, loud enough to be harmful.',
    choices: [
      {
        id: 'push',
        label: 'Push straight through before it gets worse',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} sets a brutal pace. You come out the far side shaken but whole, and pick up glass-fused scrap on the way.', effects: [{ kind: 'salvage', amount: [5, 10] }] },
        failure: { text: 'The note climbs higher. {target} drops to their knees and has to be half-carried out.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'map',
        label: 'Map the resonance and find the quiet lanes',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} finds the dead zones between the fins. In one, a carved marker stone stands half-buried.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'salvage', amount: [3, 6] }] },
        failure: { text: '{actor} leans in to take a reading just as a gust hits. They come away with blood running from both ears.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'detour',
        label: 'Take the long way round',
        powerCost: 5,
        success: { text: 'You circle the valley. It costs hours and charge, but nobody bleeds.', effects: [] },
      },
    ],
  },
  {
    id: 'glass-mirror-field',
    biome: 'glass',
    title: 'Field of Mirrors',
    text: 'A plain of tilted glass panes catches the sun and throws it in moving beams. Where two beams cross, the sand glows.',
    probeHint: 'Thermal imaging shows moving points of extreme heat on an open plain.',
    choices: [
      {
        id: 'time',
        label: 'Read the pattern and time a crossing',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} counts the sweep of the beams and calls the moves. You cross untouched and loot a shattered instrument mast.', effects: [{ kind: 'salvage', amount: [6, 11] }] },
        failure: { text: '{actor} misjudges one beam. The burn is deep.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
      {
        id: 'smash',
        label: 'Smash a path through the panes',
        check: { stat: 'grit', difficulty: 2, favoredRole: 'soldier' },
        success: { text: '{actor} clears a lane with a rifle butt and sheer stubbornness. Behind one pane, a sealed case.', effects: [{ kind: 'salvage', amount: [3, 6] }, { kind: 'item', item: 'eliminate' }] },
        failure: { text: 'The panes don\'t break cleanly. Glass sprays everywhere in long, wicked shards.', effects: [{ kind: 'wound', target: 'random', amount: 1, chance: 0.7 }] },
      },
      {
        id: 'night',
        label: 'Wait for nightfall',
        powerCost: 8,
        success: { text: 'You run the heaters and wait out the day. At night the field is just glass.', effects: [] },
      },
    ],
  },
  {
    id: 'glass-buried-vault',
    biome: 'glass',
    title: 'The Buried Vault',
    text: 'Wind has uncovered a doorway sunk into the dunes. Its frame is cut with rows of angular script, and one row looks very like a ring address.',
    probeHint: 'Ground-penetrating scans found a large hollow structure beneath the sand.',
    choices: [
      {
        id: 'translate',
        label: 'Translate the inscription',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} works through the script line by line. It names a world, and one glyph of its address, plainly.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: '{actor} reads one line aloud. The doorframe answers with a jet of scalding steam.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'bypass',
        label: 'Bypass the lock mechanism',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} coaxes the door open. Inside: a dusty store of tuning crystals.', effects: [{ kind: 'item', item: 'reveal' }, { kind: 'salvage', amount: [4, 8] }] },
        failure: { text: 'The mechanism draws current from {actor}\'s tools and drains the field cells before they can disconnect.', effects: [{ kind: 'power', amount: -6 }] },
      },
      {
        id: 'leave',
        label: 'Leave it sealed',
        success: { text: 'Some doors are shut for a reason. You move on.', effects: [] },
      },
    ],
  },
  {
    id: 'glass-glass-eaters',
    biome: 'glass',
    title: 'Glass-Eaters',
    text: 'Low, armoured creatures are grinding the dunes with mineral teeth. They have noticed you. Their grinding has stopped.',
    probeHint: 'Large animal life detected: slow-moving, heavily armoured, apparently territorial.',
    choices: [
      {
        id: 'drive',
        label: 'Drive them off',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} holds the line until they lumber away, leaving their hoard of polished fragments behind.', effects: [{ kind: 'salvage', amount: [7, 12] }] },
        failure: { text: 'They charge as a group. Nobody is fast enough.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'mimic',
        label: 'Mimic their grinding rhythm',
        check: { stat: 'rapport', difficulty: 4, favoredRole: 'linguist' },
        success: { text: '{actor} taps out the rhythm on a slab of glass. The herd relaxes and wanders off, and their path leads past an old supply cache.', effects: [{ kind: 'item', item: 'freeDial' }, { kind: 'salvage', amount: [2, 5] }] },
        failure: { text: 'Whatever {actor} said in their language, it was rude. {target} is knocked flat.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Sunken Terraces
  // ---------------------------------------------------------------------
  {
    id: 'tidal-fast-tide',
    biome: 'tidal',
    title: 'The Fast Tide',
    text: 'The sea pulls back from the lower terraces all at once, then you hear it coming back.',
    probeHint: 'Tidal range is extreme: several terraces flood and drain within minutes.',
    choices: [
      {
        id: 'climb',
        label: 'Climb for the upper terrace',
        check: { stat: 'grit', difficulty: 2 },
        success: { text: '{actor} hauls the last of you up as the water hits the wall below. Wedged in the stonework is a corroded box of fittings.', effects: [{ kind: 'salvage', amount: [2, 5] }] },
        failure: { text: 'The surge catches {actor} on the steps and slams them into the stone.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'window',
        label: 'Calculate the tide window and use it',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} times it to the second. You walk the drained terrace floor and find a sealed archive room, still dry.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'salvage', amount: [3, 6] }] },
        failure: { text: 'The window is shorter than {actor} thought. Everyone gets soaked, the field cells included, and {target} is swept against a pillar.', effects: [{ kind: 'wound', target: 'random', amount: 1 }, { kind: 'power', amount: -4 }] },
      },
    ],
  },
  {
    id: 'tidal-drowned-archive',
    biome: 'tidal',
    title: 'The Drowned Archive',
    text: 'A hall of carved tablets stands waist-deep in still green water. More rows continue down into the dark.',
    probeHint: 'A large flooded structure with regular internal shelving.',
    choices: [
      {
        id: 'dive',
        label: 'Dive for the deepest tablets',
        check: { stat: 'grit', difficulty: 3 },
        success: { text: '{actor} surfaces with a tablet that names a ring address and fixes one glyph of it.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'Something below has a grip like a vice. {actor} gets free, barely.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'read',
        label: 'Read what is above the waterline',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} pieces together a partial address from the upper rows.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'salvage', amount: [1, 3] }] },
        failure: { text: 'The upper rows are mostly tide tables. {actor} is fairly sure.', effects: [] },
      },
      {
        id: 'pump',
        label: 'Pump the hall dry',
        powerCost: 10,
        success: { text: 'The pumps whine for an hour. When the water is gone, the whole archive is yours.', effects: [{ kind: 'fragment', strength: 'major' }, { kind: 'salvage', amount: [3, 6] }] },
      },
    ],
  },
  {
    id: 'tidal-lantern-folk',
    biome: 'tidal',
    title: 'The Lantern Folk',
    text: 'Small boats move between the flooded towers, each with a lantern on a long pole. They have stopped rowing to watch you.',
    probeHint: 'Faint artificial lights move on the water at night. Possible inhabitants.',
    choices: [
      {
        id: 'hail',
        label: 'Hail them and try to trade',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} finds enough shared gesture to trade. They pay in charged cells that hum in your hands.', effects: [{ kind: 'power', amount: [10, 15] }, { kind: 'salvage', amount: [2, 4] }] },
        failure: { text: 'Something in {actor}\'s greeting alarms them. A volley of sling-stones covers their retreat.', effects: [{ kind: 'wound', target: 'random', amount: 1, chance: 0.4 }] },
      },
      {
        id: 'follow',
        label: 'Shadow them back to their harbour',
        check: { stat: 'insight', difficulty: 3 },
        success: { text: '{actor} tracks the lanterns to a hidden harbour full of reclaimed tech, much of it unguarded.', effects: [{ kind: 'salvage', amount: [4, 8] }, { kind: 'item', item: 'eliminate' }] },
        failure: { text: 'You are spotted. They melt into the towers, and {target} slips on the weed-slick stone.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
    ],
  },
  {
    id: 'tidal-sunken-engine',
    biome: 'tidal',
    title: 'The Sunken Engine',
    text: 'Under clear water, a machine the size of a house is still running. Its hum is in your teeth, and the water above it is warm.',
    probeHint: 'A strong energy source is active under water. It reads as artificial.',
    choices: [
      {
        id: 'tap',
        label: 'Tap its power',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} rigs a coupling. The field cells fill faster than anyone thought possible.', effects: [{ kind: 'power', amount: [15, 25] }] },
        failure: { text: 'The engine notices. The discharge throws {actor} clear of the water.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
      {
        id: 'strip',
        label: 'Strip its outer plating',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} prises away plate after plate of strange alloy.', effects: [{ kind: 'salvage', amount: [8, 14] }] },
        failure: { text: 'A plate comes free with an edge like a blade. {actor} catches it badly.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Sporewood
  // ---------------------------------------------------------------------
  {
    id: 'spore-bloom',
    biome: 'spore',
    title: 'Spore Bloom',
    text: 'Every stalk in the clearing bursts at once. The air turns gold and thick enough to chew.',
    probeHint: 'Airborne particulate counts spike periodically. Respiratory protection advised.',
    choices: [
      {
        id: 'push',
        label: 'Masks on, push through',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'medic' },
        success: { text: '{actor} keeps everyone moving and breathing steadily. You bag some spore samples on the way.', effects: [{ kind: 'salvage', amount: [4, 8] }] },
        failure: { text: 'The masks clog. By the time you are clear, everyone is coughing up gold.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'analyse',
        label: 'Analyse the bloom cycle',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} works out the bloom rhythm and finds the spores carry traces of refined metal. Someone was here before.', effects: [{ kind: 'salvage', amount: [6, 10] }] },
        failure: { text: '{actor} takes off their mask for a closer look. It is a mistake.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
    ],
  },
  {
    id: 'spore-hollow-stalk',
    biome: 'spore',
    title: 'The Hollow Stalk',
    text: 'One stalk is wider than a tower and hollow. Steps have been carved into its inner wall, spiralling up into the dark.',
    probeHint: 'One structure in the canopy is far taller than the rest and appears hollow.',
    choices: [
      {
        id: 'climb',
        label: 'Climb to the top',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: 'At the top, {actor} finds a platform of carved bone and a weathered address plaque.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'salvage', amount: [3, 6] }] },
        failure: { text: 'A step crumbles under {actor}. The fall is long.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
      {
        id: 'carvings',
        label: 'Study the carvings at the base',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} reads the carvings as a pilgrims\' guide, which includes part of an address.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'The carvings are decorative. Probably.', effects: [] },
      },
    ],
  },
  {
    id: 'spore-murmuring-network',
    biome: 'spore',
    title: 'The Murmuring Network',
    text: 'Pale threads under the soil pulse with light in long, structured bursts. It looks like language.',
    probeHint: 'Patterned bioelectric signals detected in the soil over a wide area.',
    choices: [
      {
        id: 'speak',
        label: 'Try to communicate with it',
        check: { stat: 'rapport', difficulty: 4, favoredRole: 'linguist' },
        success: { text: '{actor} answers the pulses and the network answers back: a stream of light that resolves into a glyph sequence.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'The network floods {actor}\'s senses. They come round an hour later, shaking.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'record',
        label: 'Record and analyse the signal',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} isolates a repeating structure and builds a filter from it, useful for tuning the ring.', effects: [{ kind: 'item', item: 'reveal' }] },
        failure: { text: 'The recorders overload and drain the cells.', effects: [{ kind: 'power', amount: -5 }] },
      },
      {
        id: 'leave',
        label: 'Leave it undisturbed',
        success: { text: 'You step carefully and the light follows you to the edge of the clearing, then stops.', effects: [] },
      },
    ],
  },
  {
    id: 'spore-grazers',
    biome: 'spore',
    title: 'Stalk Grazers',
    text: 'A herd of huge, placid animals is moving through the stalks. One startles. Then they all do.',
    probeHint: 'Large herd animals present. Normally docile.',
    choices: [
      {
        id: 'steer',
        label: 'Hold position and steer the herd',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'soldier' },
        success: { text: '{actor} turns the lead animal aside and the herd flows around you. They leave shed armour plates behind.', effects: [{ kind: 'salvage', amount: [6, 10] }] },
        failure: { text: 'The herd goes straight through you. {target} is trampled.', effects: [{ kind: 'wound', target: 'random', amount: 2 }] },
      },
      {
        id: 'calm',
        label: 'Calm them',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'medic' },
        success: { text: '{actor} talks the nearest beast down and the herd settles around you. It is the safest you have felt all day. Everyone rests.', effects: [{ kind: 'heal', target: 'all', amount: 1 }] },
        failure: { text: 'The calm doesn\'t take. {target} is clipped by a passing flank.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'flare',
        label: 'Scatter them with a flare',
        powerCost: 6,
        success: { text: 'The flare scatters the herd in every direction but yours.', effects: [] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Rimeveil
  // ---------------------------------------------------------------------
  {
    id: 'rime-whiteout',
    biome: 'rime',
    title: 'Whiteout',
    text: 'The wind rises from nothing. In a minute you cannot see your own hands.',
    probeHint: 'Sudden severe storms. Visibility drops to zero without warning.',
    choices: [
      {
        id: 'march',
        label: 'Rope up and keep marching',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} leads on the rope, step by step, until you walk out of the storm.', effects: [{ kind: 'salvage', amount: [1, 3] }] },
        failure: { text: 'The rope snaps. You find {target} an hour later, half-frozen. The search drains the heaters.', effects: [{ kind: 'wound', target: 'random', amount: 1 }, { kind: 'power', amount: -4 }] },
      },
      {
        id: 'instruments',
        label: 'Navigate by instruments',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} steers you to shelter: the top of a tower buried in the ice, marked with frost-script.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'The compass spins. Hours pass, and the cold bites deep.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.35 }] },
      },
      {
        id: 'dig',
        label: 'Dig in and wait',
        powerCost: 8,
        success: { text: 'You dig a snow cave and run the heaters until it passes.', effects: [] },
      },
    ],
  },
  {
    id: 'rime-buried-tower',
    biome: 'rime',
    title: 'The Buried Tower',
    text: 'A spire of dark stone rises from the ice, its windows sealed with frost. Script is etched in the rime itself.',
    probeHint: 'A tall artificial structure is partly buried in the ice sheet.',
    choices: [
      {
        id: 'cut',
        label: 'Cut your way inside',
        check: { stat: 'grit', difficulty: 3 },
        success: { text: '{actor} breaks through into a storeroom, frozen exactly as it was left.', effects: [{ kind: 'salvage', amount: [6, 12] }, { kind: 'item', item: 'freeDial' }] },
        failure: { text: 'The ice gives way under {actor}.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'read',
        label: 'Read the frost-script',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} reads it as a departure board: a list of addresses, one of them legible.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'While {actor} studies the script, a sheet of rime shears off the spire above.', effects: [{ kind: 'wound', target: 'random', amount: 1, chance: 0.4 }] },
      },
    ],
  },
  {
    id: 'rime-echo-chasm',
    biome: 'rime',
    title: 'Echo Chasm',
    text: 'A crevasse breathes cold air. Voices echo up from it, and after a while you realise they are saying your names.',
    probeHint: 'A deep fissure in the ice with unusual acoustic properties.',
    choices: [
      {
        id: 'descend',
        label: 'Descend into it',
        check: { stat: 'grit', difficulty: 4 },
        success: { text: 'At the bottom, {actor} finds the source: a ring-glyph carved a hundred times over, each repetition humming.', effects: [{ kind: 'fragment', strength: 'major' }, { kind: 'salvage', amount: [2, 5] }] },
        failure: { text: 'The ledge {actor} trusted was only frost.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
      {
        id: 'acoustics',
        label: 'Study the acoustics from the edge',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} maps the echoes and isolates a repeating tone sequence that matches part of an address.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'The echoes go silent the moment {actor} starts recording.', effects: [] },
      },
      {
        id: 'leave',
        label: 'Walk away',
        success: { text: 'You leave. The voices stop calling once you are out of earshot. Almost.', effects: [] },
      },
    ],
  },
  {
    id: 'rime-other-expedition',
    biome: 'rime',
    title: 'The Other Expedition',
    text: 'A camp, half-buried. Tents of an unfamiliar weave, tools of an unfamiliar make. Whoever they were, they came through the ring too.',
    probeHint: 'Small artificial structures detected near the ring. No life signs.',
    choices: [
      {
        id: 'search',
        label: 'Search the camp',
        check: { stat: 'insight', difficulty: 2 },
        success: { text: '{actor} finds their stores: salvage, and a bank of cells that still holds charge.', effects: [{ kind: 'salvage', amount: [5, 9] }, { kind: 'power', amount: 10 }] },
        failure: { text: 'Something in the camp was still on guard duty. {actor} trips it.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'rites',
        label: 'Honour their dead and read their logs',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} reads their last log aloud. It ends with an address they never reached. The team is quiet afterwards, but steadier.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'heal', target: 'random', amount: 1 }] },
        failure: { text: 'The logs are unreadable. The silence is heavy.', effects: [] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Any biome
  // ---------------------------------------------------------------------
  {
    id: 'any-ring-echo',
    biome: 'any',
    title: 'Ring Echo',
    text: 'Behind you, the ring flickers. An incoming signal, from somewhere else, and nobody dialled it.',
    probeHint: 'The ring here shows signs of irregular incoming activity.',
    weight: 0.8,
    choices: [
      {
        id: 'analyse',
        label: 'Analyse the signal',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} captures the dial sequence before it fades. Part of an address, clean and certain.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'The signal feeds back through {actor}\'s rig and into the field cells.', effects: [{ kind: 'power', amount: -6 }] },
      },
      {
        id: 'ignore',
        label: 'Ignore it',
        success: { text: 'It fades on its own. You try not to think about who was calling.', effects: [] },
      },
    ],
  },
  {
    id: 'any-ambush',
    biome: 'any',
    title: 'Ambush',
    text: 'Figures rise from cover on both sides. Their weapons are improvised but pointed at you.',
    probeHint: 'Signs of armed activity near the ring.',
    choices: [
      {
        id: 'fight',
        label: 'Fight',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} turns it around fast. The raiders scatter, dropping what they carried.', effects: [{ kind: 'salvage', amount: [6, 12] }] },
        failure: { text: 'It goes badly. {actor} is hit, and the raiders get away.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }, { kind: 'wound', target: 'random', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'talk',
        label: 'Talk them down',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} talks until the weapons lower. They trade a little, then fade back into cover.', effects: [{ kind: 'salvage', amount: [2, 5] }] },
        failure: { text: 'They stop listening to {actor} mid-sentence.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'smoke',
        label: 'Pop smoke and slip away',
        powerCost: 10,
        success: { text: 'The smoke screen and a decoy beacon buy you the gap you need.', effects: [] },
      },
    ],
  },
  {
    id: 'any-cache',
    biome: 'any',
    title: 'Abandoned Cache',
    text: 'A sealed niche in a wall, marked with a glyph you have seen at other rings: supplies, left for travellers.',
    probeHint: 'Small sealed compartments near the ring; possibly supply caches.',
    weight: 0.8,
    choices: [
      {
        id: 'open',
        label: 'Open it carefully',
        check: { stat: 'insight', difficulty: 2 },
        success: { text: '{actor} finds the release. Inside, a spare capacitor and some scrap.', effects: [{ kind: 'item', item: 'freeDial' }, { kind: 'salvage', amount: [2, 4] }] },
        failure: { text: 'The release was also a trap. {actor} takes the brunt of it.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'force',
        label: 'Force it open',
        check: { stat: 'grit', difficulty: 2, favoredRole: 'soldier' },
        success: { text: '{actor} wrenches it open. Mostly scrap, but good scrap.', effects: [{ kind: 'salvage', amount: [8, 12] }] },
        failure: { text: 'It gives way all at once, contents crushed, and the heavy door swings wide.', effects: [{ kind: 'wound', target: 'random', amount: 1, chance: 0.5 }] },
      },
    ],
  },
];
