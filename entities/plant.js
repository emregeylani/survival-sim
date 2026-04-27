// ─── Plant ────────────────────────────────────────────────────────────────────

class Plant extends Living {
    constructor(x, y, genes = null) {
        super(x, y, genes || Genetics.defaultGenes({
            spreadRate:  0.3,
            energyValue: 28,
            growthRate:  0.5,
        }));
        this.energy       = 40 + Math.random() * 30;
        this.maxEnergy    = 80;
        this.maxAge       = 2000 + Math.random() * 1000; // FIX: doubled lifespan, plants are baseline of ecosystem
        this.spreadTimer  = 40 + Math.random() * 60;
        this.renderSize   = 2 + Math.random() * 1.5;
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        const biome = world.getBiomeAt(this.x, this.y);

        // Can't survive on water or in volcanic core
        if (!biome || biome.type === 'water') {
            this.alive = false;
            return;
        }

        if (biome.type === 'volcanic') {
            this.energy -= dt * 4;
        } else {
            // Grow based on biome productivity and genetics
            const bmul = this.biomeMultiplier(biome);
            const seasonMult = (window.SEASON && window.SEASON.mult) || 1.0;
            const grow = dt * this.genes.growthRate * (biome.resources || 0.5) * bmul * seasonMult;
            this.energy = Math.min(this.maxEnergy, this.energy + grow);
        }

        // Spread when healthy
        this.spreadTimer -= dt;
        if (this.spreadTimer <= 0) {
            this.spreadTimer = 50 + Math.random() * 80;
            // FIX: was * 0.02 (0.6% chance), now * 0.2 (6% chance per cycle) — plants must spread reliably
            const spreadChance = (window.SIM_PARAMS?.plantSpread || 0.3) * 0.2;
            if (this.energy > 40 && Math.random() < spreadChance) {
                this._spread(world, entities);
            }
        }

        if (this.age > this.maxAge || this.energy <= 0) {
            this.alive = false;
        }
    }

    _spread(world, entities) {
        const maxPlants = window.SIM_PARAMS?.maxPlants || 500;
        const plantCount = entities.filter(e => e instanceof Plant).length;
        if (plantCount >= maxPlants) return;

        const angle = Math.random() * Math.PI * 2;
        const dist  = 15 + Math.random() * 35;
        const nx    = this.x + Math.cos(angle) * dist;
        const ny    = this.y + Math.sin(angle) * dist;

        if (nx < 5 || ny < 5 || nx > world.width - 5 || ny > world.height - 5) return;

        const biome = world.getBiomeAt(nx, ny);
        if (!biome || biome.type === 'water' || biome.type === 'volcanic' || biome.resources < 0.1) return;

        // Avoid overcrowding (fast check via spatial proximity)
        let nearby = 0;
        for (const e of entities) {
            if (e instanceof Plant && e.dist2({x:nx,y:ny}) < 18*18) {
                nearby++;
                if (nearby >= 4) return;
            }
        }

        const child = new Plant(nx, ny, Genetics.mutate(this.genes));
        child.generation = this.generation + 1;
        child.parentId   = this.id;
        child.energy     = 20;
        this.childCount++;
        entities.push(child);
    }

    render(ctx) {
        const ratio = this.energy / this.maxEnergy;
        const s     = this.renderSize * (0.55 + ratio * 0.65);
        const g     = Math.floor(85 + ratio * 105);
        const r     = Math.floor(12 + ratio * 22);
        ctx.fillStyle = `rgba(${r},${g},${Math.floor(r * 0.35)},0.92)`;
        ctx.save();
        ctx.translate(this.x, this.y);
        // Cross / plus icon — vertical stem + horizontal leaf bar
        const sw = Math.max(0.9, s * 0.38); // stroke width
        ctx.fillRect(-sw * 0.5, -s,      sw, s * 2);   // vertical
        ctx.fillRect(-s,        -sw * 0.5, s * 2, sw); // horizontal
        ctx.restore();
    }

    getSummary() {
        return {
            ...super.getSummary(),
            subtype: 'plant',
        };
    }
}
