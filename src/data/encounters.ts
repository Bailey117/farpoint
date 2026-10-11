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

  // ---------------------------------------------------------------------
  // Glass Barrens (continued)
  // ---------------------------------------------------------------------
  {
    id: 'glass-sunstorm',
    biome: 'glass',
    title: 'Sunstorm',
    text: 'The sun swells and whitens. Every pane of glass on the plain becomes a mirror, and the air above the dunes begins to shimmer and hiss.',
    probeHint: 'Stellar activity is high. Surface temperatures spike without warning.',
    choices: [
      {
        id: 'dig',
        label: 'Dig in under the sand',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} digs a trench deep enough to wait it out, and strikes something buried: an old supply crate.', effects: [{ kind: 'salvage', amount: [4, 8] }] },
        failure: { text: 'The trench is too shallow. {target} takes the worst of the heat.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'rig',
        label: 'Rig the glass into a collector',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} angles a dozen panes onto the field cells. The storm becomes a power source.', effects: [{ kind: 'power', amount: [8, 12] }] },
        failure: { text: 'The collector focuses the light in the wrong place.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.4 }] },
      },
      {
        id: 'shelter',
        label: 'Shelter by the ring and run the coolers',
        powerCost: 6,
        success: { text: 'You sit it out in the ring\'s shadow while the coolers drain the cells.', effects: [] },
      },
    ],
  },
  {
    id: 'glass-caravan',
    biome: 'glass',
    title: 'The Glass Caravan',
    text: 'A line of sledges crosses the dunes, pulled by long-legged animals and loaded with crystal. The drivers have seen you and are waiting to see what you do.',
    probeHint: 'A moving group with pack animals crosses the dunes regularly.',
    choices: [
      {
        id: 'trade',
        label: 'Trade with them',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} haggles in gestures and drawings. You come away with a tuning crystal and some scrap.', effects: [{ kind: 'item', item: 'reveal' }, { kind: 'salvage', amount: [2, 4] }] },
        failure: { text: 'Something {actor} offers is an insult. A warning shot cracks the glass near your feet.', effects: [{ kind: 'wound', target: 'actor', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'escort',
        label: 'Offer to guard them through the dunes',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: 'Nothing attacks the caravan while {actor} walks point. The drivers pay well.', effects: [{ kind: 'salvage', amount: [8, 12] }] },
        failure: { text: 'Raiders hit the caravan at dusk. {target} is hurt holding them off.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
    ],
  },
  {
    id: 'glass-obelisk',
    biome: 'glass',
    title: 'The Humming Obelisk',
    text: 'A black obelisk stands alone on the glass, humming. Shapes move across its surface. Some of them are ring glyphs.',
    probeHint: 'A tall object emits a steady low-frequency signal.',
    choices: [
      {
        id: 'read',
        label: 'Read the moving glyphs',
        check: { stat: 'rapport', difficulty: 4, favoredRole: 'linguist' },
        success: { text: '{actor} catches the sequence as it cycles: one glyph of an address, and the slot it sits in.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: '{actor} touches the surface to follow a glyph, and it burns.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'measure',
        label: 'Measure its field',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} logs the field and finds it pointing, faintly, at part of an address. The cells top up from it too.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'power', amount: 5 }] },
        failure: { text: 'The obelisk pulls charge out of {actor}\'s instruments.', effects: [{ kind: 'power', amount: -8 }] },
      },
      {
        id: 'leave',
        label: 'Leave it humming',
        success: { text: 'You give it a wide berth.', effects: [] },
      },
    ],
  },
  {
    id: 'glass-sinkhole',
    biome: 'glass',
    title: 'Sinkhole',
    text: 'With a sound like breaking ice, the glass cracks around you. Below is a cavern, and something down there is glinting.',
    probeHint: 'Hollow ground beneath the surface glass in several places.',
    choices: [
      {
        id: 'spread',
        label: 'Spread out and step slowly to firm ground',
        check: { stat: 'insight', difficulty: 2 },
        success: { text: '{actor} reads the cracks and calls each step. Everyone reaches solid glass.', effects: [] },
        failure: { text: 'A slab tips. {target} drops a body-length and lands badly.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'descend',
        label: 'Climb down to whatever is glinting',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'soldier' },
        success: { text: '{actor} comes back up with a sack of fused-glass components and a sealed filter case.', effects: [{ kind: 'salvage', amount: [10, 16] }, { kind: 'item', item: 'eliminate' }] },
        failure: { text: 'The cavern floor is no firmer than the ceiling. {actor} falls the rest of the way.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Sunken Terraces (continued)
  // ---------------------------------------------------------------------
  {
    id: 'tidal-reef-shrine',
    biome: 'tidal',
    title: 'The Reef Shrine',
    text: 'Coral has grown over a small shrine in the shallows. Offerings are piled at its base: tools, coins, and things you do not recognise.',
    probeHint: 'A small structure in shallow water, overgrown with reef.',
    choices: [
      {
        id: 'take',
        label: 'Take the offerings',
        check: { stat: 'grit', difficulty: 2 },
        success: { text: '{actor} wades in and fills a sack. Nobody comes to stop you.', effects: [{ kind: 'salvage', amount: [6, 10] }] },
        failure: { text: 'The coral stings. {actor}\'s hands swell and stiffen.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'study',
        label: 'Study the carvings',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} reads a prayer for safe travel, addressed to a world by its glyphs.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'The carvings are too worn to read.', effects: [] },
      },
      {
        id: 'offer',
        label: 'Leave a charged cell as an offering',
        powerCost: 4,
        success: { text: 'You leave the cell at the shrine and rest a while. It is the calmest hour you have spent here.', effects: [{ kind: 'heal', target: 'all', amount: 1 }] },
      },
    ],
  },
  {
    id: 'tidal-storm-surge',
    biome: 'tidal',
    title: 'Storm Surge',
    text: 'A storm rolls in off the sea. The water climbs the terraces faster than you can, and a small boat is tied to a pillar nearby.',
    probeHint: 'Severe storms build quickly over the sea.',
    choices: [
      {
        id: 'sail',
        label: 'Take the boat across to the next tower',
        check: { stat: 'insight', difficulty: 3 },
        success: { text: '{actor} reads the swell and steers you into the lee of a tower with a dry upper room, full of old charts.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'salvage', amount: [2, 5] }] },
        failure: { text: 'The boat capsizes in the surf. {target} is pulled under before you drag them out.', effects: [{ kind: 'wound', target: 'random', amount: 1 }, { kind: 'power', amount: -3 }] },
      },
      {
        id: 'swim',
        label: 'Swim for the high terrace',
        check: { stat: 'grit', difficulty: 4 },
        success: { text: '{actor} gets a rope across and the rest follow it. You find salvage washed up on the terrace.', effects: [{ kind: 'salvage', amount: [3, 6] }] },
        failure: { text: 'The water is stronger than any of you.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'wait',
        label: 'Seal yourselves in a tower and wait',
        powerCost: 8,
        success: { text: 'The pumps keep the room dry until the storm passes.', effects: [] },
      },
    ],
  },
  {
    id: 'tidal-net-hunters',
    biome: 'tidal',
    title: 'The Net Hunters',
    text: 'Something in the water casts a sticky net over the steps ahead, then waits. Further along, the remains of its last catch are still tangled up.',
    probeHint: 'Aquatic predators detected near the shoreline.',
    choices: [
      {
        id: 'fight',
        label: 'Fight it at the water\'s edge',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} drives it back into the deep. Its catch includes a lot of useful scrap.', effects: [{ kind: 'salvage', amount: [5, 9] }] },
        failure: { text: 'It drags {actor} halfway into the water before letting go.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
      {
        id: 'trap',
        label: 'Bait a trap for it',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor}\'s trap holds. You strip its lair at leisure and find a working capacitor.', effects: [{ kind: 'salvage', amount: [6, 10] }, { kind: 'item', item: 'freeDial' }] },
        failure: { text: 'It takes the bait and the trap, and lashes out at {target}.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
    ],
  },
  {
    id: 'tidal-lighthouse',
    biome: 'tidal',
    title: 'The Drowned Lighthouse',
    text: 'A tower stands in deep water, its lamp room still above the waves. Something inside it is turning, slowly.',
    probeHint: 'A tall structure offshore emits a faint rotating light.',
    choices: [
      {
        id: 'restart',
        label: 'Restart its lamp',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} brings the lamp back to life, and its old reactor fills your cells.', effects: [{ kind: 'power', amount: [12, 18] }] },
        failure: { text: 'The lamp flares while {actor} is still looking at it.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'logs',
        label: 'Climb to the keeper\'s log room',
        check: { stat: 'grit', difficulty: 3 },
        success: { text: 'The last keeper logged every ring address the light was used to guide. One is legible.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'A rusted rung gives way under {actor}.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'signal',
        label: 'Signal with the light',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} flashes a greeting. Lantern boats arrive with food, scrap and a healer\'s skill. {target} is patched up.', effects: [{ kind: 'salvage', amount: [3, 6] }, { kind: 'heal', target: 'random', amount: 1 }] },
        failure: { text: 'Something answers the light, but it is not a boat.', effects: [{ kind: 'wound', target: 'random', amount: 1, chance: 0.5 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Sporewood (continued)
  // ---------------------------------------------------------------------
  {
    id: 'spore-sleepers',
    biome: 'spore',
    title: 'The Sleepers',
    text: 'Pale cocoons hang from the stalks. Inside them, people are sleeping. They are breathing.',
    probeHint: 'Faint life signs inside the fungal growth.',
    choices: [
      {
        id: 'free',
        label: 'Cut one free',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'medic' },
        success: { text: '{actor} works the cocoon open carefully. The sleeper wakes, grateful and confused, and shows you where their party left its stores.', effects: [{ kind: 'salvage', amount: [6, 10] }, { kind: 'item', item: 'reveal' }] },
        failure: { text: 'The cocoon bursts in a cloud of spores, right in {actor}\'s face.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'observe',
        label: 'Observe from a distance',
        check: { stat: 'insight', difficulty: 2, favoredRole: 'scientist' },
        success: { text: 'One sleeper wears a badge stamped with glyphs. {actor} copies them down.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'You learn nothing, and the stillness gets to everyone.', effects: [] },
      },
    ],
  },
  {
    id: 'spore-glowmire',
    biome: 'spore',
    title: 'Glowmire',
    text: 'A wide bog glows blue-green from below. Some of the light is steady and some of it pulses, and the ground under the pulsing patches looks soft.',
    probeHint: 'Extensive wetland with strong bioluminescence.',
    choices: [
      {
        id: 'wade',
        label: 'Wade straight across',
        check: { stat: 'grit', difficulty: 3 },
        success: { text: '{actor} leads you through, waist-deep at times, and finds things the bog had swallowed.', effects: [{ kind: 'salvage', amount: [4, 8] }] },
        failure: { text: 'The mire takes {target} to the chest before you pull them out.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'map',
        label: 'Map the firm ground from the light pattern',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} sees that the steady glow marks firm ground, and that its paths form a pattern: part of an address.', effects: [{ kind: 'fragment', strength: 'minor' }, { kind: 'salvage', amount: [2, 4] }] },
        failure: { text: '{actor} trusts a steady patch that was only steady for a moment.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'burn',
        label: 'Burn a dry path with the cutter',
        powerCost: 6,
        success: { text: 'The cutter dries a crust you can walk on. It costs you charge, but nothing else.', effects: [] },
      },
    ],
  },
  {
    id: 'spore-canopy-drop',
    biome: 'spore',
    title: 'Pod Fall',
    text: 'Above you, seed pods the size of houses are tearing loose from the canopy. The first one lands with a sound you feel in your chest.',
    probeHint: 'Heavy objects periodically fall from the canopy.',
    choices: [
      {
        id: 'shelter',
        label: 'Shelter against the thickest stalk',
        check: { stat: 'grit', difficulty: 2 },
        success: { text: 'You press against the stalk while pods crash down around you. {actor} keeps everyone still.', effects: [] },
        failure: { text: 'A pod bursts nearby. Fragments hit {target}.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'harvest',
        label: 'Catch one as it lands and harvest it',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'soldier' },
        success: { text: '{actor} splits a fallen pod. Inside, its fibres are worth a great deal as salvage.', effects: [{ kind: 'salvage', amount: [10, 15] }] },
        failure: { text: 'The pod rolls. {actor} doesn\'t.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
    ],
  },
  {
    id: 'spore-gardeners',
    biome: 'spore',
    title: 'The Gardeners\' Camp',
    text: 'A camp of curved stone huts sits in a clearing. A tall machine of the same stone still walks between the beds, tending the fungus. It turns its head towards you.',
    probeHint: 'A slow-moving artificial unit is active in a cleared area.',
    choices: [
      {
        id: 'talk',
        label: 'Speak to the gardener',
        check: { stat: 'rapport', difficulty: 4, favoredRole: 'linguist' },
        success: { text: '{actor} finds words it understands. It recites a ring address, the one its makers left by, and fixes one glyph for certain.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'It decides you are a weed. {target} is thrown clear of the beds.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'repair',
        label: 'Repair its failing power core',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} patches the core. In thanks, or by design, it shares its charge and a spare capacitor.', effects: [{ kind: 'power', amount: 15 }, { kind: 'item', item: 'freeDial' }] },
        failure: { text: 'The core drains your field cells as {actor} works.', effects: [{ kind: 'power', amount: -6 }] },
      },
      {
        id: 'scavenge',
        label: 'Scavenge the empty huts',
        check: { stat: 'grit', difficulty: 2 },
        success: { text: '{actor} turns up tools and fittings the gardeners left behind.', effects: [{ kind: 'salvage', amount: [5, 9] }] },
        failure: { text: 'The gardener notices you in its huts. {actor} takes a blow.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Rimeveil (continued)
  // ---------------------------------------------------------------------
  {
    id: 'rime-pale-hunters',
    biome: 'rime',
    title: 'Pale Hunters',
    text: 'Long white shapes keep pace with you along the ridge. Sometimes four, sometimes six. They are getting closer between each count.',
    probeHint: 'Pack predators detected across the ice.',
    choices: [
      {
        id: 'hold',
        label: 'Form up and hold them off',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} breaks the first rush and the pack scatters, leaving shed crystal teeth on the ice. Worth taking.', effects: [{ kind: 'salvage', amount: [4, 8] }] },
        failure: { text: 'The pack hits from two sides. {target} is badly bitten.', effects: [{ kind: 'wound', target: 'random', amount: 2 }] },
      },
      {
        id: 'read',
        label: 'Read their movements and slip past',
        check: { stat: 'insight', difficulty: 3 },
        success: { text: '{actor} picks the moment they turn to circle, and you are gone.', effects: [] },
        failure: { text: 'They were herding you. {actor} is caught at the back.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'flare',
        label: 'Drive them off with light and noise',
        powerCost: 7,
        success: { text: 'Flares and a sonic charge send them running.', effects: [] },
      },
    ],
  },
  {
    id: 'rime-thaw-vault',
    biome: 'rime',
    title: 'The Thaw Vault',
    text: 'In a field of ice, one square of ground is bare and steaming. At its centre is a sealed hatch, warm to the touch, with a warning carved around it.',
    probeHint: 'A localised heat source under the ice sheet.',
    choices: [
      {
        id: 'lock',
        label: 'Open the heat-lock',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} vents the lock safely. Inside is a heat battery, still charged after who knows how long.', effects: [{ kind: 'power', amount: [15, 20] }, { kind: 'salvage', amount: [2, 4] }] },
        failure: { text: 'The vent fires early. {actor} takes a blast of steam.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'pry',
        label: 'Pry it open',
        check: { stat: 'grit', difficulty: 3 },
        success: { text: '{actor} forces the hatch. You strip the vault of its fittings.', effects: [{ kind: 'salvage', amount: [6, 10] }] },
        failure: { text: 'The hatch springs back under pressure and catches {actor}.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'translate',
        label: 'Translate the warning first',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: 'The warning, {actor} realises, ends with the address of the people who built the vault.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'It is a warning. That much is clear.', effects: [] },
      },
    ],
  },
  {
    id: 'rime-singing-ice',
    biome: 'rime',
    title: 'The Singing Ice',
    text: 'A frozen lake lies across your path. Every step on it produces a long, falling note, and the notes echo back changed.',
    probeHint: 'A large frozen lake with unusual acoustic properties.',
    choices: [
      {
        id: 'cross',
        label: 'Cross quickly',
        check: { stat: 'grit', difficulty: 3 },
        success: { text: '{actor} sets a quick, even pace. The ice sings, but it holds.', effects: [] },
        failure: { text: 'The ice sings one note too many. {target} goes through.', effects: [{ kind: 'wound', target: 'random', amount: 2 }] },
      },
      {
        id: 'listen',
        label: 'Listen to what the echoes are saying',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: '{actor} hears it: the lake repeats a sequence of tones, and they map to glyphs.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'Standing still for so long is a mistake. The ice cracks.', effects: [{ kind: 'wound', target: 'random', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'around',
        label: 'Go the long way round',
        powerCost: 5,
        success: { text: 'The detour costs a day of heater charge.', effects: [] },
      },
    ],
  },
  {
    id: 'rime-aurora',
    biome: 'rime',
    title: 'Aurora Storm',
    text: 'The sky fills with moving green light. Your instruments start to scream and the field cells grow warm in their packs.',
    probeHint: 'Intense charged-particle activity in the upper atmosphere.',
    choices: [
      {
        id: 'ground',
        label: 'Ground the cells and harvest the charge',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} earths the kit and turns the storm into charge.', effects: [{ kind: 'power', amount: 10 }] },
        failure: { text: 'The cells take more than they can hold, and dump it.', effects: [{ kind: 'power', amount: -8 }] },
      },
      {
        id: 'shelter',
        label: 'Get everyone down and shielded',
        check: { stat: 'grit', difficulty: 2 },
        success: { text: '{actor} gets everyone flat in a snow trench until the sky calms.', effects: [] },
        failure: { text: 'A discharge arcs across the ice and finds {target}.', effects: [{ kind: 'wound', target: 'random', amount: 1 }] },
      },
      {
        id: 'push',
        label: 'Push on and accept the drain',
        success: { text: 'You keep walking. The storm leeches power from everything you carry.', effects: [{ kind: 'power', amount: -4 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Any biome (continued)
  // ---------------------------------------------------------------------
  {
    id: 'any-stranger',
    biome: 'any',
    title: 'A Stranger at the Ring',
    text: 'Someone is slumped against the ring\'s base: a traveller from another world, injured and alone, clutching a dialling slate.',
    probeHint: 'A single faint life sign near the ring.',
    weight: 0.8,
    choices: [
      {
        id: 'treat',
        label: 'Treat their injuries',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'medic' },
        success: { text: '{actor} stabilises them. Before they leave, they mark one glyph of an address on your slate.', effects: [{ kind: 'fragment', strength: 'major' }] },
        failure: { text: 'Nothing {actor} tries is enough. They slip away, and the slate goes dark.', effects: [] },
      },
      {
        id: 'ask',
        label: 'Ask what they know',
        check: { stat: 'rapport', difficulty: 3, favoredRole: 'linguist' },
        success: { text: 'In a mix of languages, they tell {actor} part of the address they were trying to reach.', effects: [{ kind: 'fragment', strength: 'minor' }] },
        failure: { text: 'They are too far gone to make sense.', effects: [] },
      },
    ],
  },
  {
    id: 'any-power-node',
    biome: 'any',
    title: 'Dormant Relay',
    text: 'A squat machine stands near the ring, cabled to it by a thick braid. It is cold, but the casing is intact.',
    probeHint: 'An inactive power installation near the ring.',
    weight: 0.8,
    choices: [
      {
        id: 'tap',
        label: 'Wake it and tap its reserve',
        check: { stat: 'insight', difficulty: 3, favoredRole: 'scientist' },
        success: { text: '{actor} coaxes it awake and drains its reserve into your cells.', effects: [{ kind: 'power', amount: [10, 15] }] },
        failure: { text: 'It wakes all at once. {actor} is thrown back from the casing.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'strip',
        label: 'Strip it for parts',
        check: { stat: 'grit', difficulty: 2 },
        success: { text: '{actor} pulls out cabling and components worth having.', effects: [{ kind: 'salvage', amount: [5, 8] }] },
        failure: { text: 'Residual charge bites {actor}.', effects: [{ kind: 'wound', target: 'actor', amount: 1, chance: 0.5 }] },
      },
    ],
  },

  // ---------------------------------------------------------------------
  // The Farpoint (final world). Met in this order.
  // ---------------------------------------------------------------------
  {
    id: 'final-threshold',
    biome: 'final',
    title: 'The Threshold',
    text: 'You step out under a ring ten times the size of your own. Between you and the city beyond, a lattice of pale light hangs in the air and sweeps slowly over each of you in turn. It is asking something.',
    probeHint: 'An active field of structured light surrounds the arrival point.',
    choices: [
      {
        id: 'answer',
        label: 'Answer it in the builders\' script',
        check: { stat: 'rapport', difficulty: 4, favoredRole: 'linguist' },
        success: { text: '{actor} traces the reply glyph by glyph. The lattice folds aside like a curtain.', effects: [{ kind: 'salvage', amount: [5, 10] }] },
        failure: { text: 'The lattice tightens around {actor} before it lets go.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
      {
        id: 'force',
        label: 'Push through before it closes',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'soldier' },
        success: { text: '{actor} drives everyone through the gap in one rush.', effects: [] },
        failure: { text: 'The lattice snaps shut on the last of you.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.6 }] },
      },
      {
        id: 'overload',
        label: 'Overload it with your own field cells',
        powerCost: 30,
        success: { text: 'The lattice drinks the charge, flickers and goes dark.', effects: [] },
      },
    ],
  },
  {
    id: 'final-silent-city',
    biome: 'final',
    title: 'The Silent City',
    text: 'Streets of black stone run in perfect circles around a distant spire. Every door stands open. Every room is empty. The air tastes of metal and nothing moves.',
    probeHint: 'A vast, ordered city. No life signs at all.',
    choices: [
      {
        id: 'map',
        label: 'Work out the city\'s geometry',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} sees it: the rings of streets are an address, spelled out in stone, and the spire is its last glyph. You walk straight there.', effects: [{ kind: 'salvage', amount: [6, 12] }] },
        failure: { text: 'The circles fold back on themselves. Hours pass. When you finally reach the spire, {actor} is barely standing.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }, { kind: 'power', amount: -6 }] },
      },
      {
        id: 'march',
        label: 'Cut straight across, wall by wall',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'soldier' },
        success: { text: '{actor} breaks a path through courtyards and gardens of stone.', effects: [] },
        failure: { text: 'The stone fights back. Something in the walls is still awake, and {target} pays for it.', effects: [{ kind: 'wound', target: 'random', amount: 2 }] },
      },
    ],
  },
  {
    id: 'final-keepers',
    biome: 'final',
    title: 'The Keepers',
    text: 'At the foot of the spire, figures of dark stone step out of the walls. They are taller than any of you, and they have been waiting a very long time. They block the stair, and they do not move aside.',
    probeHint: 'Large artificial guardians stand at the base of the central spire.',
    choices: [
      {
        id: 'prove',
        label: 'Prove you belong: recite the address that brought you',
        check: { stat: 'rapport', difficulty: 5, favoredRole: 'linguist' },
        success: { text: '{actor} speaks the final address glyph by glyph. The keepers bow, and step back into the walls.', effects: [] },
        failure: { text: 'One glyph is wrong. The keepers close in, and {target} is struck down.', effects: [{ kind: 'wound', target: 'random', amount: 2 }, { kind: 'wound', target: 'random', amount: 1, chance: 0.5 }] },
      },
      {
        id: 'break',
        label: 'Fight your way up the stair',
        check: { stat: 'grit', difficulty: 5, favoredRole: 'soldier' },
        success: { text: '{actor} breaks one keeper apart and the rest hesitate long enough for you to pass.', effects: [{ kind: 'salvage', amount: [6, 10] }] },
        failure: { text: 'Stone does not tire. You get past them, but not cleanly.', effects: [{ kind: 'wound', target: 'all', amount: 1 }] },
      },
      {
        id: 'disable',
        label: 'Find the keepers\' control glyph',
        check: { stat: 'insight', difficulty: 5, favoredRole: 'scientist' },
        success: { text: '{actor} spots the glyph worn into every keeper\'s chest and traces it on the stair. They freeze mid-stride.', effects: [] },
        failure: { text: 'The keepers notice what {actor} is doing.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }] },
      },
    ],
  },
  {
    id: 'final-heart',
    biome: 'final',
    title: 'The Heart of the Network',
    text: 'Inside the spire, every ring address you have ever seen is carved into one wall, and thousands more besides. Lines of light run between them. The whole network meets here, and your arrival has woken it.',
    probeHint: 'An enormous energy source at the centre of the city, rising.',
    choices: [
      {
        id: 'stabilise',
        label: 'Stabilise the surge',
        check: { stat: 'insight', difficulty: 5, favoredRole: 'scientist' },
        success: { text: '{actor} finds the rhythm of the surge and steadies it. The wall settles into a calm glow, and the excess flows into your cells.', effects: [{ kind: 'power', amount: 20 }] },
        failure: { text: 'The surge throws {actor} across the chamber and tears charge from every cell you carry.', effects: [{ kind: 'wound', target: 'actor', amount: 2 }, { kind: 'power', amount: -15 }] },
      },
      {
        id: 'speak',
        label: 'Read the closing words on the wall',
        check: { stat: 'rapport', difficulty: 5, favoredRole: 'linguist' },
        success: { text: '{actor} reads the words aloud. The network listens, and quietly goes back to sleep.', effects: [{ kind: 'heal', target: 'all', amount: 1 }] },
        failure: { text: 'The words come out wrong. The light turns on all of you.', effects: [{ kind: 'wound', target: 'all', amount: 1 }] },
      },
      {
        id: 'shield',
        label: 'Shield the team and ride it out',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'medic' },
        success: { text: '{actor} keeps everyone down and covered until the surge passes.', effects: [] },
        failure: { text: 'Not everyone stays covered.', effects: [{ kind: 'wound', target: 'all', amount: 1, chance: 0.5 }] },
      },
    ],
  },
  {
    id: 'final-way-home',
    biome: 'final',
    title: 'The Way Home',
    text: 'Back at the great ring, the light behind you is spreading through the city. The ring is turning on its own, faster and faster. If you are going to dial home, it has to be now.',
    probeHint: 'The arrival ring here shows signs of instability.',
    choices: [
      {
        id: 'run',
        label: 'Run for it',
        check: { stat: 'grit', difficulty: 4, favoredRole: 'soldier' },
        success: { text: '{actor} gets everyone to the ring as it steadies, just long enough.', effects: [] },
        failure: { text: 'The ground buckles on the way. {target} goes down hard.', effects: [{ kind: 'wound', target: 'random', amount: 2 }] },
      },
      {
        id: 'lock',
        label: 'Lock the ring by hand',
        check: { stat: 'insight', difficulty: 4, favoredRole: 'scientist' },
        success: { text: '{actor} jams the control glyphs and the ring slows, obediently, to a stop.', effects: [{ kind: 'salvage', amount: [4, 8] }] },
        failure: { text: 'The controls burn under {actor}\'s hands and the ring drains your cells to stabilise itself.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }, { kind: 'power', amount: -10 }] },
      },
      {
        id: 'feed',
        label: 'Feed it power until it steadies',
        powerCost: 35,
        success: { text: 'The ring takes what it needs and settles.', effects: [] },
      },
    ],
  },
];
