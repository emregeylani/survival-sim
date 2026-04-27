// ─── Genetics Engine ────────────────────────────────────────────────────────
// Handles gene definitions, mutation, crossover, trait descriptions, fitness.

const GENE_DEFS = {
    speed:            { min: 0.3,  max: 3.0,   base: 1.0,  strength: 0.12 },
    visionRange:      { min: 20,   max: 200,   base: 70,   strength: 8    },
    strength:         { min: 0.3,  max: 3.0,   base: 1.0,  strength: 0.12 },
    size:             { min: 0.5,  max: 3.0,   base: 1.0,  strength: 0.10 },
    heatResistance:   { min: 0.1,  max: 1.0,   base: 0.45, strength: 0.06 },
    coldResistance:   { min: 0.1,  max: 1.0,   base: 0.45, strength: 0.06 },
    reproductionRate: { min: 0.1,  max: 1.0,   base: 0.45, strength: 0.06 },
    camouflage:       { min: 0.0,  max: 1.0,   base: 0.2,  strength: 0.06 },
    metabolism:       { min: 0.4,  max: 2.0,   base: 1.0,  strength: 0.10 },
};

// Trait descriptions for display
const TRAIT_DESCRIPTORS = [
    { gene: 'speed',           threshold: 1.6,  label: 'Swift',          positive: true  },
    { gene: 'speed',           threshold: 0.65, label: 'Sluggish',       positive: false, below: true },
    { gene: 'visionRange',     threshold: 130,  label: 'Eagle-Eyed',     positive: true  },
    { gene: 'visionRange',     threshold: 35,   label: 'Near-Sighted',   positive: false, below: true },
    { gene: 'strength',        threshold: 1.6,  label: 'Powerful',       positive: true  },
    { gene: 'strength',        threshold: 0.65, label: 'Frail',          positive: false, below: true },
    { gene: 'coldResistance',  threshold: 0.72, label: 'Arctic Adapted', positive: true  },
    { gene: 'heatResistance',  threshold: 0.72, label: 'Heat Adapted',   positive: true  },
    { gene: 'reproductionRate',threshold: 0.72, label: 'Prolific',       positive: true  },
    { gene: 'camouflage',      threshold: 0.65, label: 'Camouflaged',    positive: true  },
    { gene: 'metabolism',      threshold: 0.65, label: 'Efficient',      positive: true, below: true },
    { gene: 'size',            threshold: 2.2,  label: 'Massive',        positive: null  },
    { gene: 'size',            threshold: 0.65, label: 'Tiny',           positive: null,  below: true },
];

class Genetics {
    /**
     * Generate a default gene set with slight random variation.
     */
    static defaultGenes(overrides = {}) {
        const genes = {};
        for (const [key, def] of Object.entries(GENE_DEFS)) {
            genes[key] = def.base + (Math.random() - 0.5) * def.strength * 2;
            genes[key] = Math.max(def.min, Math.min(def.max, genes[key]));
        }
        return { ...genes, ...overrides };
    }

    /**
     * Apply random mutations to a gene set.
     * Uses SIM_PARAMS.mutationRate as probability per gene.
     */
    static mutate(genes) {
        const mutated = { ...genes };
        const rate = (window.SIM_PARAMS && SIM_PARAMS.mutationRate) || 0.15;

        for (const [key, def] of Object.entries(GENE_DEFS)) {
            if (key in mutated && Math.random() < rate) {
                const delta = (Math.random() - 0.5) * 2 * def.strength * (1 + Math.random() * 0.5);
                mutated[key] = Math.max(def.min, Math.min(def.max, mutated[key] + delta));
            }
        }
        return mutated;
    }

    /**
     * Dominant/recessive crossover between two parents.
     * Each gene is either inherited from one parent or blended.
     */
    static crossover(genesA, genesB) {
        const child = {};
        for (const key of Object.keys(GENE_DEFS)) {
            const a = genesA[key] ?? GENE_DEFS[key].base;
            const b = genesB[key] ?? GENE_DEFS[key].base;
            const r = Math.random();
            if (r < 0.45) {
                child[key] = a;           // dominant parent A
            } else if (r < 0.90) {
                child[key] = b;           // dominant parent B
            } else {
                child[key] = (a + b) / 2; // blend (10% chance)
            }
        }
        return child;
    }

    /**
     * Compute evolutionary fitness of an entity.
     */
    static fitness(entity) {
        let score = entity.age * 0.3;
        score += (entity.childCount || 0) * 8;
        score += (entity.killCount  || 0) * 4;
        score += entity.generation  * 2;
        return Math.floor(score);
    }

    /**
     * Return array of trait tags for an entity's gene set.
     */
    static describe(genes) {
        const traits = [];
        for (const desc of TRAIT_DESCRIPTORS) {
            const val = genes[desc.gene];
            if (val === undefined) continue;
            const triggered = desc.below ? val < desc.threshold : val > desc.threshold;
            if (triggered) {
                traits.push({ label: desc.label, positive: desc.positive });
            }
        }
        return traits;
    }
}

// ─── Spatial Grid ─────────────────────────────────────────────────────────
// Optimizes proximity queries from O(n²) to ~O(1) for nearby lookups.
class SpatialGrid {
    constructor(width, height, cellSize = 80) {
        this.cellSize = cellSize;
        this.cells    = new Map();
    }

    clear() { this.cells.clear(); }

    _key(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return (cx << 16) | (cy & 0xffff); // fast integer key
    }

    add(entity) {
        const k = this._key(entity.x, entity.y);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(entity);
    }

    /**
     * Returns all entities within radius of (x, y).
     * Does NOT filter by actual distance — caller must check if needed.
     */
    getNearby(x, y, radius) {
        const result = [];
        const span   = Math.ceil(radius / this.cellSize);
        const cx0    = Math.floor(x / this.cellSize);
        const cy0    = Math.floor(y / this.cellSize);

        for (let dx = -span; dx <= span; dx++) {
            for (let dy = -span; dy <= span; dy++) {
                const k = ((cx0 + dx) << 16) | ((cy0 + dy) & 0xffff);
                const cell = this.cells.get(k);
                if (cell) for (const e of cell) result.push(e);
            }
        }
        return result;
    }
}
