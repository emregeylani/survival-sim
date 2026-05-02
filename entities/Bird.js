// ─── Bird ─────────────────────────────────────────────────────────────────────
// Aerial predator. Feeds on Insects by default.
// Evolution hook: when genes.strength > 1.5, can dive-attack small herbivores
//   (size < 0.8) — this unlocks naturally through selection pressure.
//
// Key traits:
//   • Can fly over water tiles (brief crossings, higher drain)
//   • High speed + vision range by default
//   • nocturnalAdaptation reduces harsh-season drain

class Bird extends Living {
    constructor(x, y, genes = null) {
        super(x, y, genes || Genetics.defaultGenes({
            speed:              0.75 + Math.random() * 0.30,
            visionRange:        120 + Math.random() * 60,
            strength:           0.4  + Math.random() * 0.4,
            size:               0.55 + Math.random() * 0.30,
            reproductionRate:   0.28 + Math.random() * 0.20,
            metabolism:         0.65 + Math.random() * 0.30,
            nocturnalAdaptation:0.30 + Math.random() * 0.30,
            camouflage:         0.10 + Math.random() * 0.20,
            heatResistance:     0.35 + Math.random() * 0.25,
            coldResistance:     0.35 + Math.random() * 0.25,
            aquaticAdaptation:  0.15 + Math.random() * 0.20,
            toxinResistance:    0.10 + Math.random() * 0.15,
        }));

        this.energy              = 55 + Math.random() * 25;
        this.maxEnergy           = 110;
        this.maxAge              = 400 + Math.random() * 300;
        this.reproductionCooldown = 120 + Math.random() * 60;
        this.state               = 'idle';
        this.direction           = Math.random() * Math.PI * 2;
        this.target              = null;
        this.killCount           = 0;
        this.turnCooldown        = 0;
        this.lineageId           = Math.floor(Math.random() * 360);
        this._renderR            = 2.6 + (this.genes.size || 0.55) * 1.1;
    }

    update(dt, world, entities, grid) {
        this._entities = entities; // keep ref for fish carcass spawning
        this.age += dt;
        this.reproductionCooldown -= dt;
        this.turnCooldown -= dt;

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            return;
        }

        const biome = world.getBiomeAt(this.x, this.y);

        // Birds can cross water (flying) — costs more energy
        if (!biome || biome.type === 'water') {
            this.energy -= dt * 0.18;
            if (this.turnCooldown <= 0) {
                this.direction  += (Math.random() - 0.5) * 0.6;
                this.turnCooldown = 8;
            }
            this._move(world, true); // ignoreWater = true
            return;
        }

        const meta      = this.genes.metabolism || 1.0;
        // Nocturnal adaptation bonus during harsh seasons
        const isHarsh   = window.SEASON && window.SEASON.mult < 0.8;
        const noctBonus = isHarsh ? (this.genes.nocturnalAdaptation || 0.3) * 0.35 : 0;
        const seasonDrain = window.SEASON
            ? Math.max(0.5, (2.0 - window.SEASON.mult) - noctBonus)
            : 1.0;
        // Birds pay for speed — flight is expensive
        const drain = dt * (0.11 + (this.genes.size || 0.55) * 0.025 + (this.genes.speed || 2.0) * 0.020)
                         * meta * seasonDrain;
        this.energy -= drain;

        // Nearby lookup
        const nearby = grid
            ? grid.getNearby(this.x, this.y, this.genes.visionRange).filter(e => e.alive && e !== this)
            : entities.filter(e => e.alive && e !== this && this.distanceTo(e) < this.genes.visionRange);

        // Food sources: insects always, small herbivores if strength evolved enough, fish always
        const insects = nearby.filter(e => e instanceof Insect);
        const canHuntHerbivore = (this.genes.strength || 0.4) > 1.5;
        const smallHerbivores  = canHuntHerbivore
            ? nearby.filter(e => e instanceof Animal && e.type === 'herbivore' && (e.genes.size || 1) < 0.8)
            : [];
        // Birds can dive for fish regardless of water tile (they fly)
        const fishTargets = nearby.filter(e => e instanceof Fish);
        const foodTargets = [...insects, ...smallHerbivores, ...fishTargets];

        const hungry     = this.energy < this.maxEnergy * 0.75;
        const veryHungry = this.energy < this.maxEnergy * 0.45;

        if ((hungry || veryHungry) && foodTargets.length > 0) {
            this.state  = 'food';
            this.target = this._closest(foodTargets);
            if (this.target) {
                this.direction = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                if (this.dist2(this.target) < 9 * 9) {
                    if (this.target instanceof Insect) {
                        this.energy = Math.min(this.maxEnergy, this.energy + 24);
                        this.target.alive = false;
                        this.killCount++;

                    } else if (this.target instanceof Fish) {
                        // Fish have camouflage — harder to catch
                        const camouflage = this.target.genes.camouflage || 0.3;
                        const catchChance = Math.max(0.15, 0.75 - camouflage * 0.55);
                        if (Math.random() < catchChance) {
                            this.energy = Math.min(this.maxEnergy, this.energy + 38);
                            this.target.alive = false;
                            this.target._spawnCarcass(this._entities || entities);
                            this.killCount++;
                        }

                    } else if (this.target instanceof Animal) {
                        // Dive attack: harder the bigger the prey
                        const sizeAdv  = (this.genes.strength || 0.4) / Math.max(0.5, this.target.genes.size || 1);
                        const winChance = Math.min(0.75, 0.2 + sizeAdv * 0.25);
                        if (Math.random() < winChance) {
                            this.energy = Math.min(this.maxEnergy, this.energy + 42);
                            this.target.alive = false;
                            this.killCount++;
                        }
                    }
                }
            }

        } else {
            // Mate or wander
            const mates = (this.reproductionCooldown <= 0 && this.energy > 72)
                ? nearby.filter(e =>
                    e instanceof Bird &&
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
                    this.direction  += (Math.random() - 0.5) * 0.95;
                    this.turnCooldown = 7 + Math.random() * 12;
                }
            }
        }

        this._move(world, false);

        if (this.energy <= 0 || this.age > this.maxAge) this.alive = false;
    }

    _reproduce(mate, entities) {
        const maxPop     = window.SIM_PARAMS?.maxBirds || 100;
        const currentPop = entities.filter(e => e instanceof Bird).length;
        if (currentPop >= maxPop) return;

        const child = new Bird(
            this.x + (Math.random() - 0.5) * 18,
            this.y + (Math.random() - 0.5) * 18,
            Genetics.mutate(Genetics.crossover(this.genes, mate.genes))
        );
        child.generation = Math.max(this.generation, mate.generation) + 1;
        child.parentId   = this.id;
        child.lineageId  = Math.random() < 0.005
            ? Math.floor(Math.random() * 360)
            : this.lineageId;
        child.energy     = 45;

        this.energy -= 22;
        mate.energy  -= 22;
        this.reproductionCooldown = 105 + Math.random() * 55;
        mate.reproductionCooldown = 105 + Math.random() * 55;
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

    _move(world, ignoreWater) {
        const spd = this.genes.speed || 0.75;
        this._reflectMove(world, spd, 0.35, ignoreWater);
    }

    render(ctx, isSelected) {
        const g     = this.genes;
        const ratio = this.energy / this.maxEnergy;
        const s     = 3.5 + (g.size || 0.55) * 2.0;
        const hue   = 158 + ((this.lineageId || 0) % 45);
        const lit   = 30 + ratio * 28;

        const fill   = `hsl(${hue}, 52%, ${lit}%)`;
        const stroke = `hsl(${hue}, 60%, ${Math.min(82, lit + 30)}%)`;
        const canHuntHerbivore = (g.strength || 0.4) > 1.5;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction);

        // ── Wings (swept back) ─────────────────────────────────────────
        const wingAlpha = 0.55 + ratio * 0.30;
        ctx.fillStyle   = `hsla(${hue}, 45%, ${lit + 12}%, ${wingAlpha})`;
        ctx.strokeStyle = `hsla(${hue}, 55%, ${lit + 25}%, ${wingAlpha + 0.1})`;
        ctx.lineWidth   = 0.7;

        // Top wing — swept back and up
        ctx.beginPath();
        ctx.moveTo( s * 0.40,  0);
        ctx.lineTo( s * 1.80, -s * 1.10);
        ctx.lineTo(-s * 0.20, -s * 0.50);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Bottom wing — mirror
        ctx.beginPath();
        ctx.moveTo( s * 0.40,  0);
        ctx.lineTo( s * 1.80,  s * 1.10);
        ctx.lineTo(-s * 0.20,  s * 0.50);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // ── Body ───────────────────────────────────────────────────────
        ctx.fillStyle   = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = 1.0;
        ctx.beginPath();
        ctx.moveTo( s * 1.70,  0);           // beak tip
        ctx.lineTo( s * 0.55, -s * 0.42);   // head top
        ctx.lineTo(-s * 0.30, -s * 0.38);   // back top
        ctx.lineTo(-s * 1.15,  0);           // tail tip
        ctx.lineTo(-s * 0.30,  s * 0.38);   // back bottom
        ctx.lineTo( s * 0.55,  s * 0.42);   // head bottom
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // ── Predator accent (sharp beak highlight if Dive Hunter) ──────
        if (canHuntHerbivore) {
            ctx.fillStyle = `hsla(30, 80%, 65%, 0.65)`;
            ctx.beginPath();
            ctx.moveTo(s * 1.70,  0);
            ctx.lineTo(s * 1.20, -s * 0.20);
            ctx.lineTo(s * 1.20,  s * 0.20);
            ctx.closePath();
            ctx.fill();
        }

        // ── Eye ────────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(s * 0.68, -s * 0.18, s * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,180,120,0.95)';
        ctx.beginPath(); ctx.arc(s * 0.70, -s * 0.18, s * 0.09, 0, Math.PI * 2); ctx.fill();

        // ── State dot ─────────────────────────────────────────────────
        if (this.state !== 'idle') {
            ctx.fillStyle = this.state === 'food' ? 'rgba(255,210,40,0.85)' : 'rgba(0,212,170,0.85)';
            ctx.beginPath(); ctx.arc(-s * 0.1, 0, s * 0.24, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, s + 5, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth   = 0.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, g.visionRange, 0, Math.PI * 2); ctx.stroke();
        }
    }

    getSummary() {
        return {
            ...super.getSummary(),
            subtype:              'bird',
            hunger:               Math.floor((1 - this.energy / this.maxEnergy) * 100),
            state:                this.state,
            killCount:            this.killCount,
            reproductionCooldown: Math.max(0, Math.floor(this.reproductionCooldown)),
        };
    }
}
