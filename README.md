# survival-sim

A real-time evolution and ecosystem simulation. Six trophic layers — plants, insects, herbivores, carnivores, scavengers, and birds — evolve under pressure from seasons, natural disasters, and geographic isolation.

---

## Quick Start

```bash
npx serve .
# or
python -m http.server 8080
```

`index.html` can also be opened directly in a browser — all files are local, no CORS issues.

---

## File Structure

```
survival-sim/
├── index.html               # Entry point, canvas setup, camera system
├── style.css                # All UI styles
│
├── engine/
│   ├── genetics.js          # Gene definitions, mutation, crossover, SpatialGrid
│   ├── world.js             # Biome map generation (Perlin noise)
│   └── loop.js              # Main simulation loop, seasons, analytics
│
├── entities/
│   ├── Living.js            # Base class: position, energy, biomeMultiplier
│   ├── Plant.js             # Producer — 3 growth stages, spreading logic
│   ├── Insect.js            # Primary consumer — wing animation, fast reproduction
│   ├── Carcass.js           # Temporary object — fresh window (~140–200 ticks), decay
│   ├── Animal.js            # Herbivore / Carnivore — full state machine, drops carcass on death
│   ├── Scavenger.js         # Eats only fresh carcasses, flees carnivores
│   ├── Bird.js              # Insect + Fish hunter; strength > 1.5 unlocks herbivore dive attack
│   └── Fish.js              # Water-only; passive nutrient absorption; prey for Birds
│
├── events/
│   └── disasters.js         # Meteor, volcano, ice age, drought
│
└── ui/
    ├── analytics.js         # Chart.js population + evolution charts, Hall of Fame
    ├── panel.js             # Entity / terrain inspector
    └── controls.js          # Play/pause, speed, disaster buttons, param sliders
```

---

## Food Chain

```
Sun
  └─► Plant
        ├─► Insect  ──────────────────► Bird
        │                                 ├──► Fish         (dive attack)
        │                                 └──► [Herbivore]  (once strength > 1.5 evolves)
        └─► Herbivore ──► Carnivore
                               │
                               ▼
                           Carcass  ◄── (spawned on every animal/fish death)
                               └─► Scavenger  (within fresh window only)

Water
  └─► Fish  (passive nutrient absorption, aquaticAdaptation scales gain rate)
        └─► Bird  (dive attack; camouflage gene reduces catch chance)
```

---

## Genetic System

Every entity carries **12 genes**. Evolution happens through **crossover** (dominant/recessive, 10% blend) and **mutation** across generations.

| Gene | Effect |
|------|--------|
| `speed` | Movement speed |
| `visionRange` | Perception radius |
| `strength` | Combat / hunting power; unlocks Bird dive attack above 1.5 |
| `size` | Body size — increases energy drain, advantages in combat |
| `metabolism` | Energy efficiency (lower = more efficient) |
| `reproductionRate` | Reproduction probability multiplier |
| `camouflage` | Reduces chance of being spotted by predators |
| `coldResistance` | Effectiveness in snow / frozen biomes |
| `heatResistance` | Effectiveness in desert / drought biomes |
| `toxinResistance` | Survival in volcanic / scorched areas |
| `nocturnalAdaptation` | Reduces energy drain during Autumn / Winter |
| `aquaticAdaptation` | Energy bonus in wetland biome; directly scales Fish nutrient absorption rate |

### Speciation
`maxMatingRange` caps the distance at which two entities can mate. Geographically isolated populations drift toward different gene frequencies. Individuals of the same species are visually tinted by `lineageId` to make divergence visible.

---

## Biomes

| Biome | Resources | Evolutionary Pressure |
|-------|-----------|----------------------|
| Forest | Maximum | — |
| Wetland | High | `aquaticAdaptation` rewarded |
| Grassland | High | — |
| Savanna | Medium | `speed` rewarded (open terrain) |
| Desert | Low | `heatResistance` required |
| Snow | Low | `coldResistance` required |
| Volcanic | Minimal | `toxinResistance` required |
| Water | — | Impassable for land entities (Birds can cross); exclusive habitat for Fish |

---

## Seasons

Cycle every **500 ticks**:

| Season | Multiplier | Effect |
|--------|-----------|--------|
| 🌱 Spring | ×1.1 | Plant boom, easy reproduction |
| ☀ Summer | ×1.0 | Baseline |
| 🍂 Autumn | ×0.75 | Increased energy drain |
| ❄ Winter | ×0.45 | Heavy pressure; `nocturnalAdaptation` advantaged |

---

## Disasters

| Disaster | Trigger | Effect |
|----------|---------|--------|
| ☄ Meteor | Click button → aim on map | Area damage + biome change |
| 🌋 Volcano | Click button → aim on map | Permanent lava zone |
| ❄ Ice Age | Instant | Snow spreads across the map |
| ☀ Drought | Instant | Green areas wither |

---

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Mutation Rate | 0.15 | Per-gene mutation probability (0–0.5) |
| Plant Spread | 0.30 | Plant spreading aggressiveness |
| Max Herbivores | 300 | Population cap |
| Max Carnivores | 100 | Population cap |
| Max Plants | 500 | Population cap |
| Max Scavengers | 80 | Population cap |
| Max Birds | 100 | Population cap |
| Max Fish | 120 | Population cap |
| Mating Range | 180 px | Mating distance limit — lower = faster speciation |
| World Seed | Random | Same seed = same map |

---

## Camera Controls

| Action | Control |
|--------|---------|
| Zoom in / out | Mouse wheel |
| Pan | Left-click drag |
| Reset view | Double-click |
| Pause / resume | **Spacebar** (works anywhere except text inputs) |
| Zoom level | Indicator in bottom-right corner |

## Border Reflection

All entities reflect off world edges like a billiard ball rather than getting stuck. When an entity hits a border:

- **Left / right wall** — horizontal velocity component is flipped (`direction = π − direction`)
- **Top / bottom wall** — vertical component is flipped (`direction = −direction`)
- A small random jitter (±0.35 rad) is added to each reflection to prevent perfectly periodic bouncing
- Terrain obstacles (water for land animals, shore for fish) trigger a wider jitter (±0.6 rad) full reverse

Fish use their own variant that keeps them strictly within water tiles, reflecting off the shore boundary.

---

## Evolution Observation Tips

**To observe speciation:**
- Set `Mating Range` to 60–80 px → geographic isolation increases, colour bands diverge
- Set `Mutation Rate` to 0.25+ → gene drift accelerates

**To observe niche divergence:**
- Zoom into a wetland area → entities with high `aquaticAdaptation` should cluster there
- Watch after Winter: mass die-off → carcass surge → Scavenger boom + `nocturnalAdaptation` selection
- As Bird population grows, Insect count drops → pressure on Herbivores from Carnivores increases

**To observe Bird dive attack evolution:**
Unlocks automatically once `genes.strength > 1.5`. The `Dive Hunter` trait tag appears in the ENTITY panel and the beak gains an orange highlight. Birds will now also target Fish — watch shoreline Bird density increase near large water bodies.

**To observe Fish camouflage selection:**
As Bird population grows, Fish with low `camouflage` get picked off first. Over generations the average `camouflage` in the Fish population should drift upward. Zoom into a water body and inspect individual Fish genes to track this.

---

## Fish Behaviour

Fish are the only entity confined to water tiles. They do not eat — instead they passively absorb energy scaled by `aquaticAdaptation × season multiplier`. In winter their gain rate drops significantly, creating boom-bust cycles.

| Predator | Catch mechanic |
|----------|----------------|
| Bird | Dive attack; `Fish.camouflage` reduces catch probability by up to 55% |

On death, Fish drop a `Carcass` at the shoreline (where they last were) — Scavengers near water edges benefit from Bird fishing activity.

**Key genes for Fish:**
- `aquaticAdaptation` — primary energy source scaler; highest impact gene for Fish survival
- `camouflage` — reduces Bird catch chance: `catchChance = max(0.15, 0.75 − camouflage × 0.55)`
- `speed` — escape from dive attacks
- `size` — larger Fish carry more energy but are slower and easier targets

---

## Technical Notes

- **SpatialGrid** — 80 px cell size, reduces proximity queries from O(n²) to ~O(1)
- **Carcass fresh window** — ~140–200 ticks; Scavengers cannot feed after this, carcass fades visually
- **Double-spawn guard** — `_carcassSpawned` flag prevents two Carcass objects from one death event
- **Fish placement** — spawned exclusively in water tiles at startup; bounce off shore edges during movement; emergency reseed triggers at <5 Fish (water-only search, up to 400 tries)
- **Border reflection** — `Living._reflectMove()` shared by all entities; mirrors direction on axis of contact + random jitter to prevent periodic loops
- **Render order** — Carcass → Plant → moving entities (Fish render underwater, below Birds visually)
- All entities render via `ctx.save / translate / rotate / restore`, independent of camera transform
