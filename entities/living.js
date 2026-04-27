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
    }

    /** Called each simulation tick. Override in subclasses. */
    update(dt, world, entities, grid) {
        this.age += dt;
        if (this.age > this.maxAge || this.energy <= 0) {
            this.alive = false;
        }
    }

    /** Squared distance — use for comparisons to avoid sqrt. */
    dist2(other) {
        return (this.x - other.x) ** 2 + (this.y - other.y) ** 2;
    }

    distanceTo(other) {
        return Math.sqrt(this.dist2(other));
    }

    /** Returns a biome-based energy multiplier for this entity. */
    biomeMultiplier(biome) {
        if (!biome) return 0.5;
        switch (biome.type) {
            case 'snow':     return this.genes.coldResistance || 0.45;
            case 'volcanic': return this.genes.heatResistance || 0.45;
            case 'desert':   return (this.genes.heatResistance || 0.45) * 0.85;
            case 'frozen':   return (this.genes.coldResistance || 0.45) * 0.7;
            case 'drought':  return (this.genes.heatResistance || 0.45) * 0.75;
            case 'scorched': return (this.genes.heatResistance || 0.45) * 0.6;
            default:         return 1.0;
        }
    }

    /** Summary object used by UI panel. */
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
        };
    }
}
