// ─── Living ──────────────────────────────────────────────────────────────────
// Base class for all living entities. Defines shared state and interface.

class Living {
    static _nextId = 0;

    constructor(x, y, genes = {}) {
        this.id         = Living._nextId++;
        this.x          = x;
        this.y          = y;
        this.age        = 0;
        this.energy     = 100;
        this.maxEnergy  = 120;
        this.alive      = true;
        this.genes      = genes;
        this.maxAge     = 800;
        this.generation = 0;
        this.parentId   = null;
        this.childCount = 0;
        this.lineageId  = Math.floor(Math.random() * 360); // for speciation colour
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        if (this.age > this.maxAge || this.energy <= 0) {
            this.alive = false;
        }
    }

    dist2(other) {
        return (this.x - other.x) ** 2 + (this.y - other.y) ** 2;
    }

    distanceTo(other) {
        return Math.sqrt(this.dist2(other));
    }

    /**
     * Returns a biome-based energy multiplier for this entity.
     * New genes: toxinResistance (volcanic/scorched), aquaticAdaptation (wetland).
     */
    biomeMultiplier(biome) {
        if (!biome) return 0.5;
        const heat  = this.genes.heatResistance    || 0.45;
        const cold  = this.genes.coldResistance    || 0.45;
        const toxin = this.genes.toxinResistance   || 0.25;
        const aqua  = this.genes.aquaticAdaptation || 0.20;

        switch (biome.type) {
            case 'snow':     return cold;
            case 'frozen':   return cold * 0.7;
            case 'desert':   return heat * 0.85;
            case 'drought':  return heat * 0.75;
            // Toxic biomes: blend toxin + heat resistance
            case 'volcanic': return toxin * 0.75 + heat * 0.35;
            case 'scorched': return toxin * 0.65 + heat * 0.30;
            // Wetland: base efficiency boosted heavily by aquatic adaptation
            case 'wetland':  return 0.65 + aqua * 0.65;
            // Savanna: slight heat penalty — heat-adapted do better
            case 'savanna':  return 0.82 + heat * 0.22;
            default:         return 1.0;
        }
    }

    getSummary() {
        return {
            id:         this.id,
            className:  this.constructor.name,
            age:        Math.floor(this.age),
            energy:     Math.floor(this.energy),
            maxEnergy:  this.maxEnergy,
            generation: this.generation,
            childCount: this.childCount,
            fitness:    Genetics.fitness(this),
            genes:      { ...this.genes },
            lineageId:  this.lineageId,
        };
    }
}
