// ─── Animal ───────────────────────────────────────────────────────────────────
// Herbivore and Carnivore share this class. type ∈ 'herbivore'|'carnivore'.
// State machine: idle → seeking_food | fleeing | reproducing

const ANIMAL_STATES = { IDLE: 'idle', FOOD: 'food', FLEE: 'flee', MATE: 'mate' };

class Animal extends Living {
    constructor(x, y, type, genes = null) {
        const baseGenes = Genetics.defaultGenes({
            speed:            1.0 + Math.random() * 0.6,
            visionRange:      65  + Math.random() * 50,
            strength:         type === 'carnivore'
                                ? 1.2 + Math.random() * 0.6
                                : 0.8 + Math.random() * 0.4,
            size:             type === 'carnivore'
                                ? 1.1 + Math.random() * 0.4
                                : 0.9 + Math.random() * 0.4,
            reproductionRate: 0.4 + Math.random() * 0.35,
            metabolism:       0.8 + Math.random() * 0.4,
        });

        super(x, y, genes || baseGenes);

        this.type                = type;
        this.energy              = 70 + Math.random() * 50;
        this.maxEnergy           = 160;
        this.maxAge              = 350 + Math.random() * 250;
        this.reproductionCooldown = 80 + Math.random() * 40;
        this.state               = ANIMAL_STATES.IDLE;
        this.direction           = Math.random() * Math.PI * 2;
        this.target              = null;
        this.killCount           = 0;
        this.turnCooldown        = 0;

        // Visual
        this._renderR = 3 + (this.genes.size || 1) * 1.5;
    }

    // ─── Update ─────────────────────────────────────────────────────────
    update(dt, world, entities, grid) {
        this.age += dt;
        this.reproductionCooldown -= dt;
        this.turnCooldown -= dt;

        // BUG FIX: death check must run before any early return.
        // Previously animals on water tiles hit `return` before reaching the
        // death check at the bottom — making them immortal if edge-stuck.
        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            return;
        }

        const biome = world.getBiomeAt(this.x, this.y);

        if (!biome || biome.type === 'water') {
            // Small drain even on water — no free lunch for edge-huggers
            this.energy -= dt * 0.08;
            this._turnAround();
            this._move(world, 0.5);
            return;
        }

        // Energy drain — size, speed and biome affect cost
        const meta = this.genes.metabolism || 1.0;
        const bmul = this.biomeMultiplier(biome);
        // FIX: drain was too aggressive — reduced base 0.18→0.12, size coeff 0.06→0.04, speed coeff 0.04→0.025
        // Old formula killed animals in ~420 ticks even when eating normally
        const seasonDrain = window.SEASON ? (2.0 - window.SEASON.mult) : 1.0; // winter=1.55×, summer=1.0×, spring=0.9×
        const drain = dt * (0.12 + (this.genes.size || 1) * 0.04 + (this.genes.speed || 1) * 0.025)
                         * meta * seasonDrain / Math.max(0.1, bmul);
        this.energy -= drain;

        this.hunger = Math.max(0, Math.min(100, (1 - this.energy / this.maxEnergy) * 100));

        // Get nearby entities
        const nearby = grid
            ? grid.getNearby(this.x, this.y, this.genes.visionRange).filter(e => e.alive && e !== this)
            : entities.filter(e => e.alive && e !== this && this.distanceTo(e) < this.genes.visionRange);

        // Apply camouflage: predators with camouflage are harder to detect
        const visibleNearby = nearby.filter(e => {
            if (e instanceof Animal && e.genes.camouflage > 0.4) {
                return Math.random() > e.genes.camouflage * 0.5;
            }
            return true;
        });

        this._decide(dt, visibleNearby, entities, world);
        this._move(world, 1.0);

        if (this.energy <= 0 || this.age > this.maxAge) this.alive = false;
    }

    // ─── AI State Machine ────────────────────────────────────────────────
    _decide(dt, nearby, entities, world) {
        // Determine threats: carnivores threatening herbivores, stronger carnivores threatening weaker ones
        const threats = nearby.filter(e =>
            e instanceof Animal && e.type === 'carnivore' &&
            ((this.type === 'herbivore') ||
             (this.type === 'carnivore' && e.genes.strength > this.genes.strength * 1.25))
        );

        // Food sources
        let foodTargets;
        if (this.type === 'herbivore') {
            foodTargets = nearby.filter(e => e instanceof Plant && e.energy > 8);
        } else {
            foodTargets = nearby.filter(e =>
                (e instanceof Animal && e.type === 'herbivore') || e instanceof Insect
            );
        }

        // Potential mates
        // FIX: reproduction threshold lowered 90→75 — old threshold was rarely reachable given drain rates
        const mates = (this.reproductionCooldown <= 0 && this.energy > 75)
            ? nearby.filter(e =>
                e instanceof Animal &&
                e.type === this.type &&
                e.energy > 65 &&
                e.reproductionCooldown <= 0)
            : [];

        // Priority: flee > eat (when very hungry) > mate > idle
        const veryHungry = this.energy < this.maxEnergy * 0.45;
        const hungry     = this.energy < this.maxEnergy * 0.70;

        if (threats.length > 0) {
            this.state = ANIMAL_STATES.FLEE;
            const threat = this._closest(threats);
            const dx = this.x - threat.x;
            const dy = this.y - threat.y;
            this.direction = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
            this.target = null;

        } else if ((veryHungry || hungry) && foodTargets.length > 0) {
            this.state  = ANIMAL_STATES.FOOD;
            this.target = this._closest(foodTargets);
            if (this.target) {
                this.direction = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                if (this.dist2(this.target) < 9 * 9) {
                    this._eat(this.target, entities);
                }
            }

        } else if (mates.length > 0) {
            this.state  = ANIMAL_STATES.MATE;
            const mate  = mates[0];
            this.direction = Math.atan2(mate.y - this.y, mate.x - this.x);
            if (this.dist2(mate) < 12 * 12) {
                this._reproduce(mate, entities);
            }

        } else {
            this.state = ANIMAL_STATES.IDLE;
            if (this.turnCooldown <= 0) {
                this.direction += (Math.random() - 0.5) * 0.7;
                this.turnCooldown = 10 + Math.random() * 15;
            }
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

    // ─── Eat ────────────────────────────────────────────────────────────
    _eat(target, entities) {
        if (target instanceof Plant) {
            const gain = Math.min(target.energy, 22);
            this.energy = Math.min(this.maxEnergy, this.energy + gain);
            target.energy -= gain;
            if (target.energy <= 0) target.alive = false;

        } else if (target instanceof Insect) {
            this.energy = Math.min(this.maxEnergy, this.energy + 30);
            target.alive = false;
            this.killCount++;

        } else if (target instanceof Animal) {
            // Hunt check — strength advantage required
            const myStr    = this.genes.strength   || 1;
            const theirStr = target.genes.strength || 1;
            const mySize   = this.genes.size        || 1;
            const theirSize= target.genes.size       || 1;
            // Bigger + stronger wins; some randomness
            const winChance = 0.5 + (myStr * mySize - theirStr * theirSize) * 0.25;
            if (Math.random() < Math.max(0.1, Math.min(0.95, winChance))) {
                this.energy = Math.min(this.maxEnergy, this.energy + 55);
                target.alive = false;
                this.killCount++;
            }
        }
    }

    // ─── Reproduce ──────────────────────────────────────────────────────
    _reproduce(mate, entities) {
        const maxPop = this.type === 'herbivore'
            ? (window.SIM_PARAMS?.maxHerbivores || 300)
            : (window.SIM_PARAMS?.maxCarnivores || 100);

        const currentPop = entities.filter(e => e instanceof Animal && e.type === this.type).length;
        if (currentPop >= maxPop) return;

        const childGenes = Genetics.crossover(this.genes, mate.genes);
        const mutated    = Genetics.mutate(childGenes);

        const child = new Animal(
            this.x + (Math.random() - 0.5) * 18,
            this.y + (Math.random() - 0.5) * 18,
            this.type,
            mutated
        );
        child.generation = Math.max(this.generation, mate.generation) + 1;
        child.parentId   = this.id;
        child.energy     = 55;

        // FIX: energy cost lowered 28→20, cooldown reduced — was too punishing and killed parents post-birth
        this.energy -= 20;
        mate.energy  -= 20;
        this.reproductionCooldown = 70 + Math.random() * 30;
        mate.reproductionCooldown = 70 + Math.random() * 30;
        this.childCount++;

        entities.push(child);
    }

    // ─── Move ────────────────────────────────────────────────────────────
    _move(world, speedMult) {
        const spd = (this.genes.speed || 1) * speedMult
                  * (this.state === ANIMAL_STATES.FLEE ? 1.6 : 1.0);
        let nx = this.x + Math.cos(this.direction) * spd;
        let ny = this.y + Math.sin(this.direction) * spd;

        // Clamp to world
        nx = Math.max(5, Math.min(world.width  - 5, nx));
        ny = Math.max(5, Math.min(world.height - 5, ny));

        if (world.isPassable(nx, ny)) {
            this.x = nx; this.y = ny;
        } else {
            this._turnAround();
        }
    }

    _turnAround() {
        this.direction += Math.PI + (Math.random() - 0.5) * 0.8;
    }

    // ─── Render ─────────────────────────────────────────────────────────
    render(ctx, isSelected) {
        const r     = this._renderR;
        const ratio = this.energy / this.maxEnergy;

        let hue, sat;
        if (this.type === 'herbivore') {
            hue = 210; sat = 55 + (this.genes.speed || 1) * 15;
        } else {
            hue = 4;   sat = 60 + (this.genes.strength || 1) * 12;
        }
        const lit = 28 + ratio * 36;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction); // arrow always points in movement direction

        // Arrow / chevron shape — nose at +x, tail at -x
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
        ctx.beginPath();
        ctx.moveTo( r * 1.55,  0);           // nose tip
        ctx.lineTo(-r * 0.75, -r * 0.95);    // left tail wing
        ctx.lineTo(-r * 0.25,  0);            // tail notch (gives chevron indent)
        ctx.lineTo(-r * 0.75,  r * 0.95);    // right tail wing
        ctx.closePath();
        ctx.fill();

        // State colour fill on body centre
        if (this.state !== ANIMAL_STATES.IDLE) {
            ctx.fillStyle = this.state === ANIMAL_STATES.FLEE ? 'rgba(255,80,60,0.75)'
                          : this.state === ANIMAL_STATES.FOOD ? 'rgba(255,210,40,0.75)'
                          : 'rgba(0,212,170,0.75)'; // mate
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 3, 0, Math.PI * 2);
            ctx.stroke();

            // Vision ring
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
            subtype:              this.type,
            hunger:               Math.floor((1 - this.energy / this.maxEnergy) * 100),
            state:                this.state,
            killCount:            this.killCount,
            reproductionCooldown: Math.max(0, Math.floor(this.reproductionCooldown)),
        };
    }
}
