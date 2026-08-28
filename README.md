|# Terminal Harvest


**Title screen:** `1` new game · `2` load (if saves exist) · `q` quit

In-game help is always available with **`?`** — press any other key afterward to look up what it does (and what it means on the map, if it's also a glyph). A command console is available with **`/`**.

---

## First day (quick start)

1. Move with **WASD** or arrow keys onto grass inside the fence.
2. **`t`** till → **`p`** plant → **`e`** water.
3. **`z`** sleep (crops grow overnight if watered; game autosaves).
4. Repeat until the crop glyph becomes ripe (e.g. Turnip `Y`, Potato `P`, Wheat `W`), then **`r`** harvest.
5. **`o`** open the shop → **`2`** sell crops for gold.
6. Exit the **south gate** (`=` in the fence) to explore the wilds — harvest ripe wild plants with **`r`**. Explored land is saved forever.

Energy drops with actions. Sleep restores it. Eat cooked food in the kitchen when you need a mid-day refill.

**Story guide:** The HUD **`Next:`** line always suggests the next story step (farm → town quests → friendship gates). Town (`'`) shows the same hint at the top.

---

## Controls

### Movement & field

| Key | Action |
|-----|--------|
| WASD / arrows / hjkl | Move (costs 1 energy; roads are far cheaper) |
| `t` | Till soil |
| `p` | Plant selected seed |
| `e` | Water |
| `r` | Harvest ripe crop(s) |
| `Space` / `A` | Auto-farm the connected field (till + plant + water) |
| `R` | Auto-harvest every ripe crop in the connected field |
| `g` | Gather forage on the tile |
| `c` | Cycle selected seed |
| `X` | Cycle selected fertilizer |
| `x` | Apply selected fertilizer to tilled soil |
| `B` | Buy the plot you're standing on |
| `I` | Install irrigation on the tile under you |
| `P` | Install irrigation on every eligible tile in the plot under you |
| `W` | Buy and place a well on the tile under you |

All of the above (except movement and `P`) act only **on the tile you're standing on** — `P` covers every eligible tile in the whole plot.

### Menus & meta

| Key | Action |
|-----|--------|
| `o` | Shop |
| `u` | Labor board |
| `;` | Ranch (feed / auto-feed) |
| `b` | Kitchen |
| `'` | Town (NPCs, quests, gifts) |
| `f` | Festival / calendar |
| `i` | Inventory |
| `K` | Skills |
| `S` | Lifetime stats & achievements (gold earned, crops harvested, days played, ...) |
| `M` | Overview map — your position, owned plots, and nearby towns on one compressed screen |
| `Y` | Workshops — process a built workshop's recipe (as many as you have materials for) |
| `C` | Seed Plant — convert harvested crops into seeds of the same crop (4-6 seeds per unit, `m` cycles the batch size x1/x5/x10/x25) |
| `H` | Walk home — auto-paths to your house (preferring roads) and travels there one tile at a time, sleeping in place if you run out of energy; press `H` again to cancel |
| `Z` | Auto-play — runs your farm hands-off, one action every 0.1s. **It never teleports** — if the next thing to do is more than a tile away, it walks there first (real pathing, one tile per 0.1s, the same route and energy/fuel cost the movement keys would spend) and only acts once it arrives. **If you own a tractor, mounts it the moment it has fuel and drives it for every field action below (3x3 area, fuel instead of energy, so it works far more ground per day than by hand)**, harvests ripe crops, waters, plants, tills bare owned ground, **processes raw materials at any built workshop**, **converts some of a harvested crop into seed at an owned Seed Plant if that crop's own seed stock has run low (before it would otherwise get sold away)**, sells what's left (holding back anything a workshop could still turn into a better good), and buys more seed once it runs out — a weighted-random mix of whatever safely matures before the next frost risk, favoring profit but never locking onto one monocrop, **so the field fills in as a genuine mix of crops**. Exception: once you're housing animals and hay drops under an **8-week reserve**, it grows **Wheat** exclusively until that's topped back up, since Wheat harvests also leave hay behind. Keeps a **2000g** reserve at all times — it only spends surplus above that floor, in order: tool upgrades, **wells for any irrigated tile that's lost water coverage, irrigation for the rest of each owned plot**, **topping up an owned tractor's fuel tank**, ranch **and workshop** buildings, buying hay to finish the 8-week reserve (once there's no open ground left to grow more Wheat) + auto-feed, animals to fill them, and — only once every owned field is fully tilled, planted, and watered *and* there's energy to spare — adjacent land. Sleeps when there's truly nothing left to do; press `Z` again to cancel |
| `z` | Sleep (end day, autosave) |
| `v` / `F5` | Save menu |
| `F9` | Load menu |
| `?` | Help & key lookup — press any other key to see what it does (n/p to page instead) |
| `/` | Command console |
| `q` / Esc | Pause menu (resume / save / load / restart / quit) |

### Tractor (after purchase)

| Key | Action |
|-----|--------|
| `m` | Mount / dismount next to garage **G** (blocked in rain) |
| `n` | Cycle implement (plow / seed / water / harvest) |
| `y` | Toggle overnight auto-route |
| `,` | Cycle auto zone |

---

## Map legend

| Glyph | Meaning |
|-------|---------|
| `@` | You |
| `T` | You on tractor |
| `.` | Grass (also the town plaza) |
| `"` | Field (premium farmland — pricier to buy) |
| `:` | Sand |
| `=` | Road, or a gate through a fence |
| `#` | Fence (blocked) |
| `~` | Tilled soil (also plain water, untilled) |
| `^` | Rock (blocked) |
| `&` | Tree (blocked) |
| letter / symbol | Growing crop (cycle seed with `c`) |
| UPPER / alt symbol | Ripe crop — not always the capitalized letter, check `?` on the glyph |
| `*` `+` `o` `v` `$` | Forage (press `g`) |
| `H` | House |
| `U` | Bunkhouse |
| `G` | Garage |
| `C` | Coop |
| `B` | Barn |
| `V` | Hive |
| `K` | Kitchen |
| `O` | Well |
| `M` | Sawmill |
| `W` | Carpenter |
| `I` | Cotton Gin |
| `S` | Spinner |
| `E` | Weaver |
| `L` | Cloth Goods Maker |
| `P` | Seed Plant |

A few glyphs do double duty (e.g. `~` is both water and tilled soil, `O` is both the well and ripe pumpkin). In-game, press **`?`** then the glyph's key to see every meaning it can have, both as a control and on the map.

The farm has a **south gate**. Outside is a chunked procedural overworld (16×16 chunks). Chunks near you stay loaded; leaving range archives them. Explored land is permanent across unload/reload and saves (v19).

**Farm-only:** till, plant, water, tractor. **Anywhere:** walk, harvest ripe crops, forage.

The HUD shows year, season, day, weather, gold, energy, skills, animals, active quests, and tractor status. A **`Next:`** line under the HUD tracks story progress. The status line at the bottom reports what just happened.

---

## Core loop

Each day you walk the farm, spend energy on work, then **`z` sleep**. Overnight:

1. Watered crops advance one growth stage (rain auto-waters all planted tiles).
2. Tractor auto-routes run (if enabled and fueled).
3. Hired workers act in their zones (if paid).
4. Fed animals produce eggs / milk.
5. Weather and random morning events update.
6. Wild forage may spawn on grass.
7. The calendar advances; game autosaves.

**Growth rule:** A crop only advances if it was watered that day (or it rained) — missing water 3 nights in a row kills it. A crop left in the ground after its season ends dies, not just stalls. **Frost** occurs in winter, plus the first 5 days of spring and last 5 days of fall (winter's cold edges), and kills any crop that doesn't grow in winter; winter crops (beet, garlic, kale, spinach, leek) are immune. Whenever anything dies, the morning report says why (frost / lack of water / season change) and how many.

---

## Calendar, weather & seasons

- Four seasons × **28 days** each → then the year increments.
- **Weather:** Sunny · Rain (auto-water) · Drought · Frost.
- Seeds only sell / grow in their seasons.

| Crop | Days watered | Seed | Sell | Seasons |
|------|--------------|------|------|---------|
| Turnip | 3 | 10g | 25g | Spring, Fall |
| Potato | 4 | 15g | 40g | Spring, Summer |
| Wheat | 5 | 20g | 55g | Summer, Fall |
| Cotton | 5 | 18g | 45g | Summer |
| Oak Tree | 112 (~1 year) | 100g | 45g | All year |
| *+22 more* | 2–7d | 8–35g | 20–100g | See shop |

**27 crops total.** Cycle with **`c`**. The shop (`o` → `1`) lists only **in-season** seeds (keys `1–9`, `0`, `a–z`). Winter favors its own frost-immune crops (beet, garlic, kale, spinach, leek). **Oak Tree** grows in every season (never dies to season-change or frost) but takes a full year (112 watered days) — miss watering 3 nights running and it dies just like any other crop, so irrigation is the practical way to see one through. Feeds the sawmill; **Cotton** feeds the cotton gin (see Workshops below). **Wheat** threshes into grain (the sellable crop item) *and* leaves behind harvestable **hay** (+2 per unit, credited straight to your ranch hay stock on harvest) — it's the only way to grow your own animal feed instead of buying it.

**Market prices drift** day to day, ±5% per item (seeds and sell prices alike) — watch for `▲`/`▼` next to a price in the shop, plus a tiny 5-day trend bar (e.g. `▅▁▇▅▇`) so you can see whether a price is climbing or about to dip.

---

## Shop (`o`)

| Key | Section |
|-----|---------|
| `1` | Buy seeds (in season only) |
| `2` | Sell crops, forage, animal goods, cooked food (`A` sells everything at once) |
| `3` | Upgrade hoe / can / sickle |
| `4` | Expand farm (+2×+2, limited sizes) |
| `5` | Buy fertilizer |
| `6` | Buy tractor (then a 2nd) |
| `7` | Fuel can (+20 fuel) |
| `8` | Ranch submenu — coop, barn, chickens, cows, hay |
| `9` | Buy kitchen (unlock cooking) |
| `0` | Workshops submenu — buy sawmill, carpenter, cotton gin, spinner, weaver, cloth goods maker |
| `S` | Buy Seed Plant (450g) — converts harvested crops into seed, see below |
| `q` | Leave |

**Traveling merchant:** roughly 1 in 10 days, the shop root screen shows a `D` line offering one random seed or fertilizer at 40% off, good for that day only.

**Tool tiers:** Tier 2 hits a line of 3; Tier 3 hits a 3×3. Upgrade path ~120g then ~350g per tool.

**Festival days:** Shop sell prices × **1.5**.

**Sam friendship ♥5+:** Shop sell prices × **1.1** (stacks with festival when both apply).

---

## Quality ★ / ★★

Better harvests come from consistent watering, a better sickle, and higher **Farming** skill.

- ★ silver — +25% sell value  
- ★★ gold — +50% sell value  

Cooking preserves quality: quality ingredients → quality dishes.

---

## Skills (`k`)

| Skill | Gain XP from | Perks |
|-------|--------------|--------|
| Farming | Till, plant, water, harvest | +0.2 max energy per level; better quality; Lv5 cheaper drought watering; Lv8 cheaper till |
| Foraging | Gather wild finds (`g`) | Lv3 truffles can appear; Lv5 chance of double gathers |

---

## Foraging

Each morning, forage can appear on grass. Stand on it and press **`g`**.

| Glyph | Item | Typical seasons |
|-------|------|-----------------|
| `*` | Wild berry | Spring, Summer |
| `+` | Herb | Spring–Fall |
| `o` | Mushroom | Summer, Fall |
| `v` | Winter root | Fall, Winter |
| `$` | Truffle | All (needs Foraging Lv3+) |

---

## Labor (`u`)

Hire hands from the board. They work **when you sleep**.

- **Roles:** Field hand (water) · Harvester · Generalist (both, costs more work points).
- Assign **zones** so they only work a rectangle of the farm.
- Pay **daily wages** or they quit.
- **Bunkhouse (`U`)** upgrades (labor board `b`) unlock more slots: base 2 → 4 → 6.

---

## Machines & tractor (`x`, `m`/`n`/`y`/`,`)

1. Buy a tractor in the shop (`6`) — garage tile **`G`** appears.
2. Stand next to **G** (it's a building, so not walkable), press **`m`** to mount (not in rain).
3. Cycle implement with **`n`**, drive and use field keys as usual (uses fuel).
4. Enable **auto** (`y`) and pick a **zone** (`,`) for overnight routes.
5. Buy fuel cans (`7`) and a second tractor for more capacity / throughput.

Maintenance and fuel matter — an empty tank stops work.

**Auto-play (`Z`) uses an owned tractor automatically** — mounts it as soon as it has fuel and drives every field action through it instead of by hand, and keeps its tank topped up once you're past the 2000g reserve. It won't buy the tractor itself, only fuel for one you already bought.

---

## Ranch (`;` and shop `8`)

| Building | Lv1 cost / slots | Animal | Feed / day | Product |
|----------|-------------------|--------|------------|---------|
| Coop `C` | 400g / 4 | Chicken 150g | 1 hay | Egg (~20g) |
| Barn `B` | 800g / 3 (shared) | Cow 500g | 2 hay | Milk (~45g) |
| Barn `B` | (shared) | Goat 350g | 1 hay | Wool (~38g) |
| Hive `V` | 350g / 3 | Bee 250g | 1 hay | Honey (~60g) |

A building's slots are a shared pool across every animal it houses — a Barn can mix cows and goats in any combination up to its slot count. Each building has **3 upgrade levels** (buy the level-1 building, then upgrade it further from the ranch shop) — a Coop goes 4 → 7 → 12 slots, Barn 3 → 6 → 10, Hive 3 → 6 → 10, at rising gold cost per tier.

- Buy **hay** in the ranch shop submenu, or grow your own — harvesting **Wheat** leaves hay behind (see Crops above).
- Use **`;`** to feed or enable **auto-feed**.
- Care streaks improve product quality over consecutive fed days.
- Collect products from inventory after overnight production (sold in shop `2`).

---

## Kitchen (`b`, unlock shop `9` for 250g)

Cook recipes, then sell dishes or **eat** them for energy.

| Recipe | Ingredients | Sell | Eat |
|--------|-------------|------|-----|
| Turnip salad | 2 turnip | 60g | +10E |
| Fried egg | 1 egg | 28g | +8E |
| Omelette | egg + turnip | 55g | +14E |
| Potato hash | potato + egg | 70g | +16E |
| Bread | 2 wheat | 90g | +18E |
| Butter | 2 milk | 100g | (ingredient) |
| Pancakes | egg + milk + wheat | 130g | +22E |
| Mushroom stew | mushroom + herb | 85g | +20E |
| Root soup | winter root + milk | 95g | +20E |
| Berry jam | 2 wild berry | 50g | +6E |
| Truffle oil | 1 truffle | 200g | — |
| Celebration cake | wheat + egg + milk + jam | 220g | +35E |

**Kitchen tips:** `m` then a recipe cooks **×5**. Toggle eat mode to restore energy from cooked food.

---

## Workshops (`Y`, buildings from shop `0`)

Turn raw materials into higher-value goods. Buy a workshop (each needs a free tile on owned land, like a ranch building), then press **`Y`** to process any of its recipes — one keypress makes as many as your materials allow. Two production chains:

| Workshop | Cost | Recipe | Needs | Makes |
|----------|------|--------|-------|-------|
| Sawmill `M` | 500g | Plank | 2 Logs (Oak Tree crop) | 3 Plank |
| Carpenter `W` | 800g | Toolbox | 4 Plank | 1 Toolbox |
| Carpenter `W` | (shared) | Furniture ★ | 6 Plank + 2 Cloth | 1 Furniture |
| Cotton Gin `I` | 400g | Ginned Cotton | 3 Cotton (crop) | 2 Ginned Cotton |
| Spinner `S` | 500g | Thread | 2 Ginned Cotton | 2 Thread |
| Weaver `E` | 600g | Cloth | 3 Thread | 2 Cloth |
| Cloth Goods Maker `L` | 700g | Shirt | 2 Cloth | 1 Shirt |
| Cloth Goods Maker `L` | (shared) | Sack ★ | 3 Cloth + 1 Plank | 2 Sack |

**★ Multi-source bonus:** a recipe that combines materials from more than one source (Furniture, Sack) is guaranteed at least ★ quality, with a further chance at ★★ — plain single-ingredient recipes only have the normal chance of any star at all. Quality affects sell price the same way it does for crops (★ +25%, ★★ +50%).

**Auto-play (`Z`)** processes materials at any built workshop automatically, and never auto-sells raw materials or intermediates a built workshop still needs — only finished goods (and anything with nowhere left to go) get sold off.

---

## Seed Plant (`C`, building `P` from shop `S`)

Turns a harvested crop back into seed of the same crop — 450g to build, needs a free tile on owned land like any other building. Press **`C`** while standing next to it (it's a building, so not walkable — same as the tractor garage) to open the interface: pick a crop you're holding, and it converts your current batch size worth of it into **4-6 seeds per unit converted** (randomized, so batches of the same crop won't always yield the same seed count). `m` cycles the batch size through x1/x5/x10/x25. Any quality of the crop works, spending your lowest-quality stacks first. It never converts anything on its own — only a keypress here, or auto-play, ever triggers it.

**Auto-play (`Z`)** treats this as part of its harvest → sell pipeline: before selling off a harvested crop, it checks whether that crop's own seed stock has dropped low, and if so converts a bit of it into seed first (enough to cover roughly one restock's worth) rather than selling all of it and having to buy seed back with gold later.

---

## Town (`'`) — NPCs, quests & friendship

Talk to townsfolk, accept / turn in quests, and gift liked items (**one gift per NPC per day**).

| NPC | Title | Notes |
|-----|-------|--------|
| **Marla** | Mayor | Quests, festivals; ♥10 (★ Best Friend) → 10% off plots & farm expansion |
| **Sam** | Shopkeeper | Goods quests; ♥5 → +10% sell prices, ♥10 (★ Best Friend) → +25% |
| **Pip** | Forager | Forage / stew / truffle quests; ♥10 (★ Best Friend) → more forage spawns each morning |

Friendship is **♥ 0–10**. Hearts rise from quest turn-ins and liked gifts. Friend greetings appear at ♥3+. Some quests require a minimum heart level. Maxing any NPC to ♥10 makes them a **★ Best Friend** (shown in the town screen); the three core NPCs above each grant a perk, and every NPC gets a warmer greeting.

### Quest chain (overview)

| Quest | NPC | Needs | Unlocks after |
|-------|-----|-------|----------------|
| First Harvest | Marla | 3 turnips | — |
| Egg Run | Sam | 2 eggs | First Harvest |
| Forest Favor | Pip | 2 mushrooms | First Harvest |
| Butter Trade | Sam | 1 butter | Egg Run |
| Town Table | Marla | 1 cake | Egg Run |
| Milk Route | Sam | 2 milk | Butter Trade |
| Trail Stew | Pip | 1 stew | Forest Favor |
| Council Lunch | Marla | 2 bread | First Harvest + ♥2 |
| Shop Special | Sam | 1 pancakes | Milk Route + ♥4 |
| Rare Find | Pip | 1 truffle | Trail Stew + ♥3 |

HUD **`Q#`** shows how many quests you currently have active.

---

## Festivals (`f`) — season day 14

| Season | Festival | Favored contest crop |
|--------|----------|----------------------|
| Spring | Spring Egg Hunt | Turnip |
| Summer | Midsummer Fair | Potato |
| Fall | Harvest Festival | Wheat |
| Winter | Frost Feast | Any surviving crop |

On festival day you can visit, enter a **crop contest**, and buy a **seed booth**. Shop sells get the ×1.5 bonus that day.

---

## Saving

| When | What |
|------|------|
| Sleep (`z`) | Autosave |
| `v` / `F5` | Manual save slots 1–3 |
| `F9` / title `2` | Load |

Saves live under the `saves/` folder as JSON. Older save versions migrate forward when loaded.

---

## Tips

1. **Water every planted tile before sleep** — or wait for rain.
2. Upgrade the **watering can** early; Tier 2/3 saves huge amounts of energy.
3. Sell on **festival day** (or after Sam ♥5) for better prices.
4. Build **coop → chickens → eggs** before chasing kitchen quests.
5. Cook **salad / jam / butter** to raise friendship and unlock later quests.
6. Forage after sleep; raise Foraging for truffles and double gathers.
7. Don’t hire more workers than you can pay — unpaid hands walk.
8. Keep hay stocked if auto-feed is on; cows eat 2/day each.
9. Press **`?`** in-game anytime — same controls, paginated.

---

