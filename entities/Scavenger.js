// ─── Scavenger ────────────────────────────────────────────────────────────────
// Feeds ONLY on Carcasses. Flees carnivores.
// Key evolutionary pressures:
//   • toxinResistance  → can linger near disaster zones where carcasses pile up
//   • coldResistance   → winter kills many animals → more carcasses → winter bonus
//   • metabolism       → crucial since food is sparse and unpredictable

class Scavenger extends Living {
    constructor(x, y, genes = null) {
        super(x, y, genes || Genetics.defaultGenes({
            speed:              0.28 + Math.random() * 0.12,
            visionRange:        90  + Math.random() * 50,
            strength:           0.5,
            size:               0.75 + Math.random() * 0.35,
            reproductionRate:   0.30 + Math.random() * 0.20,
            metabolism:         0.65 + Math.random() * 0.30,
            toxinResistance:    0.45 + Math.random() * 0.35, // naturally elevated
            coldResistance:     0.40 + Math.random() * 0.30,
            heatResistance:     0.35 + Math.random() * 0.25,
            nocturnalAdaptation:0.25 + Math.random() * 0.25,
            aquaticAdaptation:  0.10 + Math.random() * 0.20,
            camouflage:         0.15 + Math.random() * 0.25,
        }));

        this.energy              = 60 + Math.random() * 30;
        this.maxEnergy           = 130;
        this.maxAge              = 300 + Math.random() * 200;
        this.reproductionCooldown = 110 + Math.random() * 60;
        this.state               = 'idle';
        this.direction           = Math.random() * Math.PI * 2;
        this.target              = null;
        this.killCount           = 0; // carcasses consumed
        this.turnCooldown        = 0;
        this._renderR            = 3 + (this.genes.size || 0.75) * 1.3;
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        this.reproductionCooldown -= dt;
        this.turnCooldown -= dt;

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            return;
        }

        const biome = world.getBiomeAt(this.x, this.y);
        if (!biome || biome.type === 'water') {
            this.energy -= dt * 0.08;
            this._turnAround();
            this._move(world, 0.5);
            return;
        }

        const meta        = this.genes.metabolism || 1.0;
        const bmul        = this.biomeMultiplier(biome);
        const isHarsh     = window.SEASON && window.SEASON.mult < 0.8;
        const noctBonus   = isHarsh ? (this.genes.nocturnalAdaptation || 0.25) * 0.3 : 0;
        const seasonDrain = window.SEASON
            ? Math.max(0.5, (2.0 - window.SEASON.mult) - noctBonus)
            : 1.0;
        const drain = dt * (0.09 + (this.genes.size || 0.75) * 0.028) * meta * seasonDrain / Math.max(0.1, bmul);
        this.energy -= drain;

        // Nearby lookup
        const nearby = grid
            ? grid.getNearby(this.x, this.y, this.genes.visionRange).filter(e => e.alive && e !== this)
            : entities.filter(e => e.alive && e !== this && this.distanceTo(e) < this.genes.visionRange);

        // Flee carnivores
        const threats = nearby.filter(e => e instanceof Animal && e.type === 'carnivore');

        if (threats.length > 0) {
            this.state = 'flee';
            const threat   = this._closest(threats);
            const dx = this.x - threat.x;
            const dy = this.y - threat.y;
            this.direction = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
            this.target = null;

        } else if (this.energy < this.maxEnergy * 0.85) {
            // Seek carcasses
            const carcasses = nearby.filter(e => e instanceof Carcass && e.energy > 3);
            if (carcasses.length > 0) {
                this.state  = 'food';
                this.target = this._closest(carcasses);
                if (this.target) {
                    this.direction = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                    if (this.dist2(this.target) < 9 * 9) {
                        const gain = Math.min(this.target.energy, 30);
                        this.energy = Math.min(this.maxEnergy, this.energy + gain);
                        this.target.energy -= gain;
                        if (this.target.energy <= 0) this.target.alive = false;
                        this.killCount++;
                    }
                }
            } else {
                this._wander(nearby, entities);
            }
        } else {
            this._wander(nearby, entities);
        }

        this._move(world, this.state === 'flee' ? 1.5 : 1.0);

        if (this.energy <= 0 || this.age > this.maxAge) this.alive = false;
    }

    _wander(nearby, entities) {
        const mates = (this.reproductionCooldown <= 0 && this.energy > 72)
            ? nearby.filter(e =>
                e instanceof Scavenger &&
                e.energy > 60 &&
                e.reproductionCooldown <= 0 &&
                this.distanceTo(e) < (window.SIM_PARAMS?.maxMatingRange || 180))
            : [];

        if (mates.length > 0) {
            this.state = 'mate';
            const mate = mates[0];
            this.direction = Math.atan2(mate.y - this.y, mate.x - this.x);
            if (this.dist2(mate) < 14 * 14) {
                this._reproduce(mate, entities);
            }
        } else {
            this.state = 'idle';
            if (this.turnCooldown <= 0) {
                this.direction  += (Math.random() - 0.5) * 0.85;
                this.turnCooldown = 12 + Math.random() * 18;
            }
        }
    }

    _reproduce(mate, entities) {
        const maxPop     = window.SIM_PARAMS?.maxScavengers || 80;
        const currentPop = entities.filter(e => e instanceof Scavenger).length;
        if (currentPop >= maxPop) return;

        const child = new Scavenger(
            this.x + (Math.random() - 0.5) * 18,
            this.y + (Math.random() - 0.5) * 18,
            Genetics.mutate(Genetics.crossover(this.genes, mate.genes))
        );
        child.generation = Math.max(this.generation, mate.generation) + 1;
        child.parentId   = this.id;
        child.lineageId  = Math.random() < 0.005
            ? Math.floor(Math.random() * 360)
            : this.lineageId;
        child.energy     = 50;

        this.energy -= 22;
        mate.energy  -= 22;
        this.reproductionCooldown = 95 + Math.random() * 40;
        mate.reproductionCooldown = 95 + Math.random() * 40;
        this.childCount++;
        entities.push(child);
    }

    _closest(list) {
        let best = null, bestD2 = Infinity;
        for (const e of list) {
            const d2 = this.dist2(e);
            if (d2 < bestD2) { bestD2 = d2; best = e; }
        }
        return best;
    }

    _turnAround() {
        this.direction += Math.PI + (Math.random() - 0.5) * 0.8;
    }

    _move(world, speedMult) {
        const spd = (this.genes.speed || 1.1) * speedMult;
        let nx = this.x + Math.cos(this.direction) * spd;
        let ny = this.y + Math.sin(this.direction) * spd;
        nx = Math.max(5, Math.min(world.width  - 5, nx));
        ny = Math.max(5, Math.min(world.height - 5, ny));
        if (world.isPassable(nx, ny)) {
            this.x = nx; this.y = ny;
        } else {
            this._turnAround();
        }
    }

    render(ctx, isSelected) {
        const r     = this._renderR;
        const ratio = this.energy / this.maxEnergy;
        const hue   = 270 + ((this.lineageId || 0) % 40) - 20; // purple band, lineage-tinted
        const lit   = 22 + ratio * 32;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction);

        // Pentagon shape — distinct from chevron animals
        ctx.fillStyle = `hsl(${hue}, 42%, ${lit}%)`;
        ctx.beginPath();
        ctx.moveTo( r * 1.45, 0);
        ctx.lineTo( r * 0.45, -r * 0.95);
        ctx.lineTo(-r * 0.90, -r * 0.65);
        ctx.lineTo(-r * 0.90,  r * 0.65);
        ctx.lineTo( r * 0.45,  r * 0.95);
        ctx.closePath();
        ctx.fill();

        // State inner dot
        if (this.state !== 'idle') {
            ctx.fillStyle = this.state === 'flee' ? 'rgba(255,80,60,0.75)'
                          : this.state === 'food' ? 'rgba(200,140,255,0.75)'
                          : 'rgba(0,212,170,0.75)';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.40, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth   = 0.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.genes.visionRange, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getSummary() {
        return {
            ...super.getSummary(),
            subtype:              'scavenger',
            hunger:               Math.floor((1 - this.energy / this.maxEnergy) * 100),
            state:                this.state,
            killCount:            this.killCount,
            reproductionCooldown: Math.max(0, Math.floor(this.reproductionCooldown)),
        };
    }
}
