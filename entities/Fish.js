// ─── Fish ─────────────────────────────────────────────────────────────────────
// Lives exclusively in water tiles. Eats nothing (absorbs nutrients passively).
// Predators: Bird (dive from shore), Carnivore (only if on a water-adjacent land tile).
// Drops a Carcass on death — Scavengers near shoreline benefit.
//
// Evolutionary pressures:
//   • aquaticAdaptation → directly boosts energy gain rate
//   • camouflage        → harder for Birds to spot
//   • speed             → escape from Bird dive attacks
//   • size              → larger fish = more energy but slower, easier target

class Fish extends Living {
    constructor(x, y, genes = null) {
        super(x, y, genes || Genetics.defaultGenes({
            speed:               0.55 + Math.random() * 0.30,
            visionRange:         50   + Math.random() * 30,
            strength:            0.4  + Math.random() * 0.3,
            size:                0.7  + Math.random() * 0.5,
            reproductionRate:    0.55 + Math.random() * 0.30,
            metabolism:          0.55 + Math.random() * 0.25,
            camouflage:          0.30 + Math.random() * 0.35,
            aquaticAdaptation:   0.65 + Math.random() * 0.30, // naturally elevated
            coldResistance:      0.40 + Math.random() * 0.25,
            heatResistance:      0.25 + Math.random() * 0.20,
            toxinResistance:     0.15 + Math.random() * 0.15,
            nocturnalAdaptation: 0.20 + Math.random() * 0.20,
        }));

        this.energy               = 55 + Math.random() * 30;
        this.maxEnergy            = 120;
        this.maxAge               = 500 + Math.random() * 400;
        this.reproductionCooldown = 90  + Math.random() * 60;
        this.direction            = Math.random() * Math.PI * 2;
        this.turnTimer            = 0;
        this.killCount            = 0;
        this._carcassSpawned      = false;
        this.lineageId            = Math.floor(Math.random() * 360);
        this._tailPhase           = Math.random() * Math.PI * 2;
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        this.reproductionCooldown -= dt;
        this.turnTimer -= dt;
        this._tailPhase += dt * 0.18;

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            this._spawnCarcass(entities);
            return;
        }

        const biome = world.getBiomeAt(this.x, this.y);

        // Fish must stay in water
        if (!biome || biome.type !== 'water') {
            this.energy -= dt * 0.35;
            // Desperately swim back
            this.direction += Math.PI + (Math.random() - 0.5) * 0.6;
            this._move(world);
            if (this.energy <= 0) { this.alive = false; this._spawnCarcass(entities); }
            return;
        }

        // Passive nutrient absorption — aquaticAdaptation boosts this
        const aqua    = this.genes.aquaticAdaptation || 0.65;
        const meta    = this.genes.metabolism || 0.55;
        const season  = window.SEASON ? window.SEASON.mult : 1.0;
        const gain    = dt * 0.18 * aqua * season;
        const drain   = dt * (0.08 + (this.genes.size || 0.7) * 0.022) * meta;
        this.energy   = Math.min(this.maxEnergy, this.energy + gain - drain);

        // Flee birds diving nearby
        const nearby = grid
            ? grid.getNearby(this.x, this.y, this.genes.visionRange).filter(e => e.alive && e !== this)
            : entities.filter(e => e.alive && e !== this && this.distanceTo(e) < this.genes.visionRange);

        const threats = nearby.filter(e => e instanceof Bird);

        if (threats.length > 0) {
            const threat = this._closest(threats);
            const dx = this.x - threat.x, dy = this.y - threat.y;
            this.direction = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
        } else if (this.reproductionCooldown <= 0 && this.energy > 75) {
            // Seek mate
            const mates = nearby.filter(e =>
                e instanceof Fish &&
                e.energy > 60 &&
                e.reproductionCooldown <= 0 &&
                this.distanceTo(e) < (window.SIM_PARAMS?.maxMatingRange || 180)
            );
            if (mates.length > 0) {
                const mate = mates[0];
                this.direction = Math.atan2(mate.y - this.y, mate.x - this.x);
                if (this.dist2(mate) < 12 * 12) {
                    this._reproduce(mate, entities);
                }
            } else {
                this._wander();
            }
        } else {
            this._wander();
        }

        this._move(world);
        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            this._spawnCarcass(entities);
        }
    }

    _wander() {
        if (this.turnTimer <= 0) {
            this.direction  += (Math.random() - 0.5) * 0.9;
            this.turnTimer   = 10 + Math.random() * 18;
        }
    }

    _move(world) {
        // Fish reflect off world borders and off shore (non-water tiles)
        const spd   = this.genes.speed || 0.55;
        const MARGIN = 4;
        let nx = this.x + Math.cos(this.direction) * spd;
        let ny = this.y + Math.sin(this.direction) * spd;

        const hitLeft   = nx < MARGIN;
        const hitRight  = nx > world.width  - MARGIN;
        const hitTop    = ny < MARGIN;
        const hitBottom = ny > world.height - MARGIN;

        if (hitLeft || hitRight) {
            this.direction = Math.PI - this.direction + (Math.random() - 0.5) * 0.35;
            nx = hitLeft ? MARGIN : world.width - MARGIN;
        }
        if (hitTop || hitBottom) {
            this.direction = -this.direction + (Math.random() - 0.5) * 0.35;
            ny = hitTop ? MARGIN : world.height - MARGIN;
        }

        const b = world.getBiomeAt(nx, ny);
        if (b && b.type === 'water') {
            this.x = nx; this.y = ny;
        } else {
            // Shore — reflect back into water with jitter
            this.direction = this.direction + Math.PI + (Math.random() - 0.5) * 1.0;
        }
    }

    _closest(list) {
        let best = null, bestD2 = Infinity;
        for (const e of list) {
            const d2 = this.dist2(e);
            if (d2 < bestD2) { bestD2 = d2; best = e; }
        }
        return best;
    }

    _reproduce(mate, entities) {
        const maxPop = window.SIM_PARAMS?.maxFish || 120;
        if (entities.filter(e => e instanceof Fish).length >= maxPop) return;

        const child = new Fish(
            this.x + (Math.random() - 0.5) * 16,
            this.y + (Math.random() - 0.5) * 16,
            Genetics.mutate(Genetics.crossover(this.genes, mate.genes))
        );
        child.generation = Math.max(this.generation, mate.generation) + 1;
        child.parentId   = this.id;
        child.lineageId  = Math.random() < 0.005
            ? Math.floor(Math.random() * 360)
            : this.lineageId;
        child.energy     = 40;

        this.energy -= 20;
        mate.energy  -= 20;
        this.reproductionCooldown = 80 + Math.random() * 50;
        mate.reproductionCooldown = 80 + Math.random() * 50;
        this.childCount++;
        entities.push(child);
    }

    _spawnCarcass(entities) {
        if (this._carcassSpawned) return;
        this._carcassSpawned = true;
        entities.push(new Carcass(this.x, this.y,
            Math.max(10, (this.genes.size || 0.7) * 18 + 6)));
    }

    render(ctx, isSelected) {
        const g     = this.genes;
        const ratio = this.energy / this.maxEnergy;
        const s     = 3.5 + (g.size || 0.7) * 2.5;

        // Tail oscillation
        const tailSwing = Math.sin(this._tailPhase) * 0.35;

        const hue   = 200 + ((this.lineageId || 0) % 55);  // blue-cyan band
        const sat   = 55  + (g.aquaticAdaptation || 0.65) * 25;
        const lit   = 30  + ratio * 28;
        const fill   = `hsl(${hue}, ${sat}%, ${lit}%)`;
        const stroke = `hsl(${hue}, ${sat}%, ${Math.min(82, lit + 28)}%)`;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction + tailSwing * 0.25);

        // ── Tail fin ─────────────────────────────────────────────────
        ctx.fillStyle   = `hsla(${hue}, ${sat}%, ${lit + 10}%, 0.65)`;
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lit + 22}%, 0.5)`;
        ctx.lineWidth   = 0.6;

        ctx.save();
        ctx.rotate(tailSwing);
        // Top lobe
        ctx.beginPath();
        ctx.moveTo(-s * 0.85, 0);
        ctx.lineTo(-s * 1.80, -s * 0.80);
        ctx.lineTo(-s * 1.30,  0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Bottom lobe
        ctx.beginPath();
        ctx.moveTo(-s * 0.85, 0);
        ctx.lineTo(-s * 1.80,  s * 0.80);
        ctx.lineTo(-s * 1.30,  0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // ── Dorsal fin ───────────────────────────────────────────────
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit + 8}%, 0.55)`;
        ctx.beginPath();
        ctx.moveTo(-s * 0.30, -s * 0.22);
        ctx.lineTo( s * 0.35, -s * 0.75);
        ctx.lineTo( s * 0.70, -s * 0.22);
        ctx.closePath();
        ctx.fill();

        // ── Body ─────────────────────────────────────────────────────
        ctx.fillStyle   = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = 0.9;
        ctx.beginPath();
        ctx.moveTo( s * 1.35,  0);           // snout
        ctx.bezierCurveTo( s * 1.0, -s * 0.60, -s * 0.60, -s * 0.65, -s * 0.85,  0);
        ctx.bezierCurveTo(-s * 0.60,  s * 0.65,  s * 1.0,  s * 0.60,  s * 1.35,  0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Scale line
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lit + 18}%, 0.35)`;
        ctx.lineWidth   = 0.5;
        ctx.beginPath();
        ctx.moveTo( s * 0.60, -s * 0.32);
        ctx.bezierCurveTo( s * 0.10, -s * 0.45, -s * 0.40, -s * 0.35, -s * 0.65, 0);
        ctx.stroke();

        // ── Eye ──────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(s * 0.68, -s * 0.20, s * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${hue + 160}, 70%, 20%, 0.95)`;
        ctx.beginPath(); ctx.arc(s * 0.70, -s * 0.20, s * 0.10, 0, Math.PI * 2); ctx.fill();

        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, s + 4, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth   = 0.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, g.visionRange, 0, Math.PI * 2); ctx.stroke();
        }
    }

    getSummary() {
        return {
            ...super.getSummary(),
            subtype:              'fish',
            hunger:               Math.floor((1 - this.energy / this.maxEnergy) * 100),
            reproductionCooldown: Math.max(0, Math.floor(this.reproductionCooldown)),
        };
    }
}
