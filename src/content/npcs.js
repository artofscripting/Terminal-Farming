// Townsfolk. `likes` are gift items (category + id) that raise friendship more.
// `core: true` marks the three quest-giving founders, guaranteed in the home
// town (region 0,0). The other 22 are flavor NPCs scattered across towns by
// world generation (systems/town.js townRosterFor), 2-5 per town.
export const NPCS = [
  {
    id: 'marla', name: 'Marla', title: 'Mayor', core: true,
    likes: [{ cat: 'dishes', id: 'celebration_cake' }, { cat: 'dishes', id: 'bread' }, { cat: 'crops', id: 'sunflower' }],
    greet: ['Hello, neighbor.', 'The town looks brighter lately.', 'You\'re becoming a pillar of this valley.'],
  },
  {
    id: 'sam', name: 'Sam', title: 'Shopkeeper', core: true,
    likes: [{ cat: 'goods', id: 'egg' }, { cat: 'goods', id: 'milk' }, { cat: 'dishes', id: 'butter' }, { cat: 'dishes', id: 'pancakes' }],
    greet: ['Shop\'s open!', 'Good to see a reliable supplier.', 'For you? Always a fair price.'],
  },
  {
    id: 'pip', name: 'Pip', title: 'Forager', core: true,
    likes: [{ cat: 'forage', id: 'mushroom' }, { cat: 'forage', id: 'herb' }, { cat: 'forage', id: 'truffle' }, { cat: 'forage', id: 'berry' }],
    greet: ['The woods are generous today.', 'Found anything rare?', 'You know these trails as well as I do now.'],
  },
  {
    id: 'gus', name: 'Gus', title: 'Blacksmith',
    likes: [{ cat: 'crops', id: 'potato' }, { cat: 'crops', id: 'pumpkin' }, { cat: 'dishes', id: 'potato_hash' }],
    greet: ['Mind the sparks.', 'Good steel takes patience.', 'You keep good company, farmer.'],
  },
  {
    id: 'nora', name: 'Nora', title: 'Baker',
    likes: [{ cat: 'crops', id: 'wheat' }, { cat: 'dishes', id: 'bread' }, { cat: 'dishes', id: 'pancakes' }],
    greet: ['Fresh loaves this morning.', 'Flour\'s a bit dear this season.', 'Always save you the corner slice.'],
  },
  {
    id: 'eli', name: 'Eli', title: 'Librarian',
    likes: [{ cat: 'forage', id: 'herb' }, { cat: 'dishes', id: 'mushroom_stew' }, { cat: 'crops', id: 'spinach' }],
    greet: ['Shh. Reading.', 'I found a lovely old atlas.', 'You\'d make a fine subject for a book.'],
  },
  {
    id: 'hale', name: 'Hale', title: 'Doctor',
    likes: [{ cat: 'forage', id: 'herb' }, { cat: 'crops', id: 'garlic' }, { cat: 'dishes', id: 'root_soup' }],
    greet: ['Eat your greens.', 'Rest is medicine too.', 'You\'re looking hale and hearty.'],
  },
  {
    id: 'rosa', name: 'Rosa', title: 'Innkeeper',
    likes: [{ cat: 'goods', id: 'milk' }, { cat: 'dishes', id: 'bread' }, { cat: 'dishes', id: 'butter' }],
    greet: ['Room\'s always open.', 'Travelers bring good gossip.', 'You\'re practically family here.'],
  },
  {
    id: 'tom', name: 'Tom', title: 'Carpenter',
    likes: [{ cat: 'crops', id: 'potato' }, { cat: 'crops', id: 'turnip' }, { cat: 'goods', id: 'egg' }],
    greet: ['Measure twice.', 'That fence of yours needs mending.', 'Solid work, like solid wood.'],
  },
  {
    id: 'finn', name: 'Finn', title: 'Fisherman',
    likes: [{ cat: 'forage', id: 'winter_root' }, { cat: 'forage', id: 'mushroom' }, { cat: 'dishes', id: 'mushroom_stew' }],
    greet: ['Slow bite today.', 'River\'s calm this morning.', 'You\'ve got a fisherman\'s patience.'],
  },
  {
    id: 'ivy', name: 'Ivy', title: 'Tailor',
    likes: [{ cat: 'crops', id: 'sunflower' }, { cat: 'crops', id: 'strawberry' }, { cat: 'dishes', id: 'berry_jam' }],
    greet: ['Lovely color on you.', 'Thread\'s thin this week.', 'You\'ve got an eye for nice things.'],
  },
  {
    id: 'wendell', name: 'Wendell', title: 'Postman',
    likes: [{ cat: 'goods', id: 'egg' }, { cat: 'dishes', id: 'bread' }, { cat: 'dishes', id: 'fried_egg' }],
    greet: ['Nothing for you today.', 'Long route, good weather.', 'Always happy to see a friendly stop.'],
  },
  {
    id: 'maud', name: 'Maud', title: 'Barkeep',
    likes: [{ cat: 'dishes', id: 'pancakes' }, { cat: 'dishes', id: 'butter' }, { cat: 'goods', id: 'milk' }],
    greet: ['Usual table\'s open.', 'Slow night, good talk.', 'On the house, for you.'],
  },
  {
    id: 'cyrus', name: 'Cyrus', title: 'Teacher',
    likes: [{ cat: 'crops', id: 'carrot' }, { cat: 'crops', id: 'cabbage' }, { cat: 'dishes', id: 'turnip_salad' }],
    greet: ['Lesson\'s about to start.', 'Curious minds, the lot of them.', 'You\'d have made a fine student.'],
  },
  {
    id: 'agnes', name: 'Agnes', title: 'Priest',
    likes: [{ cat: 'forage', id: 'herb' }, { cat: 'dishes', id: 'celebration_cake' }, { cat: 'crops', id: 'sunflower' }],
    greet: ['Peace be with you.', 'The valley is kind this season.', 'You do good work, farmer.'],
  },
  {
    id: 'leo', name: 'Leo', title: 'Musician',
    likes: [{ cat: 'crops', id: 'berry' }, { cat: 'forage', id: 'berry' }, { cat: 'dishes', id: 'berry_jam' }],
    greet: ['New tune, want to hear it?', 'Strings keep snapping today.', 'You\'ve got rhythm, farmer.'],
  },
  {
    id: 'bella', name: 'Bella', title: 'Painter',
    likes: [{ cat: 'crops', id: 'sunflower' }, { cat: 'crops', id: 'pepper' }, { cat: 'crops', id: 'cauliflower' }],
    greet: ['The light is perfect today.', 'Colors from your fields inspire me.', 'You\'d paint well, I bet.'],
  },
  {
    id: 'hank', name: 'Hank', title: 'Beekeeper',
    likes: [{ cat: 'forage', id: 'herb' }, { cat: 'crops', id: 'pumpkin' }, { cat: 'dishes', id: 'berry_jam' }],
    greet: ['Bees are busy today.', 'Careful, hive\'s a bit riled up.', 'You smell like fresh clover.'],
  },
  {
    id: 'sage', name: 'Sage', title: 'Herbalist',
    likes: [{ cat: 'forage', id: 'herb' }, { cat: 'forage', id: 'mushroom' }, { cat: 'forage', id: 'winter_root' }],
    greet: ['The roots speak, if you listen.', 'A good tonic needs patience.', 'You\'ve a forager\'s instinct.'],
  },
  {
    id: 'otis', name: 'Otis', title: 'Miller',
    likes: [{ cat: 'crops', id: 'wheat' }, { cat: 'crops', id: 'corn' }, { cat: 'dishes', id: 'bread' }],
    greet: ['Wheel\'s turning steady.', 'Good grain this year.', 'You grow a fine crop.'],
  },
  {
    id: 'dot', name: 'Dot', title: 'Stablehand',
    likes: [{ cat: 'crops', id: 'carrot' }, { cat: 'crops', id: 'turnip' }, { cat: 'goods', id: 'milk' }],
    greet: ['Horses are restless today.', 'Mind the mud by the trough.', 'You\'ve a way with animals.'],
  },
  {
    id: 'clara', name: 'Clara', title: 'Potter',
    likes: [{ cat: 'crops', id: 'leek' }, { cat: 'crops', id: 'squash' }, { cat: 'dishes', id: 'root_soup' }],
    greet: ['Clay\'s just right today.', 'Kiln\'s still warm.', 'You\'ve steady hands, like a potter.'],
  },
  {
    id: 'russ', name: 'Russ', title: 'Weaver',
    likes: [{ cat: 'crops', id: 'onion' }, { cat: 'crops', id: 'pea' }, { cat: 'dishes', id: 'turnip_salad' }],
    greet: ['Loom\'s humming along.', 'Fine thread, this batch.', 'You\'ve patience for the slow work.'],
  },
  {
    id: 'birdie', name: 'Birdie', title: 'Brewer',
    likes: [{ cat: 'crops', id: 'wheat' }, { cat: 'crops', id: 'potato' }, { cat: 'dishes', id: 'butter' }],
    greet: ['Fresh batch brewing.', 'Careful, that one\'s strong.', 'You\'ve a brewer\'s patience, farmer.'],
  },
  {
    id: 'gareth', name: 'Gareth', title: 'Guard',
    likes: [{ cat: 'dishes', id: 'potato_hash' }, { cat: 'crops', id: 'garlic' }, { cat: 'goods', id: 'egg' }],
    greet: ['All quiet today.', 'Keep the roads safe, eh?', 'Good to have you looking out for the town too.'],
  },
];

export const CORE_NPC_IDS = NPCS.filter((n) => n.core).map((n) => n.id);

export function npcDef(id) {
  return NPCS.find((n) => n.id === id);
}
