// ─── Animal ───────────────────────────────────────────────────────────────────
// Herbivore and Carnivore share this class. type ∈ 'herbivore'|'carnivore'.
// State machine: idle → seeking_food | fleeing | reproducing
//
// Changes vs original:
//   • Spawns a Carcass on death — feeds Scavengers
//   • lineageId: inherited from parent; colour shifts by lineage for speciation visual
//   • Mating distance limit (SIM_PARAMS.maxMatingRange) — enables geographic isolation

const ANIMAL_STATES = { IDLE: 'idle', FOOD: 'food', FLEE: 'flee', MATE: 'mate' };

class Animal extends Living {
    constructor(x, y, type, genes = null) {
        const baseGenes = Genetics.defaultGenes({
            speed:            0.25 + Math.random() * 0.15,
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

        this.type                 = type;
        this.energy               = 70 + Math.random() * 50;
        this.maxEnergy            = 160;
        this.maxAge               = 350 + Math.random() * 250;
        this.reproductionCooldown = 80 + Math.random() * 40;
        this.state                = ANIMAL_STATES.IDLE;
        this.direction            = Math.random() * Math.PI * 2;
        this.target               = null;
        this.killCount            = 0;
        this.turnCooldown         = 0;

        this._renderR             = 3 + (this.genes.size || 1) * 1.5;
    }

    // ─── Update ─────────────────────────────────────────────────────────
    update(dt, world, entities, grid) {
        this.age += dt;
        this.reproductionCooldown -= dt;
        this.turnCooldown -= dt;

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            this._spawnCarcass(entities);
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
        const noctBonus   = isHarsh ? (this.genes.nocturnalAdaptation || 0.3) * 0.3 : 0;
        const seasonDrain = window.SEASON
            ? Math.max(0.5, (2.0 - window.SEASON.mult) - noctBonus)
            : 1.0;
        const drain = dt * (0.12 + (this.genes.size || 1) * 0.04 + (this.genes.speed || 1) * 0.025)
                         * meta * seasonDrain / Math.max(0.1, bmul);
        this.energy -= drain;

        this.hunger = Math.max(0, Math.min(100, (1 - this.energy / this.maxEnergy) * 100));

        const nearby = grid
            ? grid.getNearby(this.x, this.y, this.genes.visionRange).filter(e => e.alive && e !== this)
            : entities.filter(e => e.alive && e !== this && this.distanceTo(e) < this.genes.visionRange);

        // Camouflage: predators harder to detect
        const visibleNearby = nearby.filter(e => {
            if (e instanceof Animal && e.genes.camouflage > 0.4) {
                return Math.random() > e.genes.camouflage * 0.5;
            }
            return true;
        });

        this._decide(dt, visibleNearby, entities, world);
        this._move(world, 1.0);

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            this._spawnCarcass(entities);
        }
    }

    // ─── Carcass Spawn ───────────────────────────────────────────────────
    _spawnCarcass(entities) {
        if (this._carcassSpawned) return; // prevent double-spawn
        this._carcassSpawned = true;
        const carcassEnergy = Math.max(12, (this.genes.size || 1) * 22 + 8);
        entities.push(new Carcass(this.x, this.y, carcassEnergy));
    }

    // ─── AI State Machine ────────────────────────────────────────────────
    _decide(dt, nearby, entities, world) {
        const threats = nearby.filter(e =>
            e instanceof Animal && e.type === 'carnivore' &&
            ((this.type === 'herbivore') ||
             (this.type === 'carnivore' && e.genes.strength > this.genes.strength * 1.25))
        );

        let foodTargets;
        if (this.type === 'herbivore') {
            foodTargets = nearby.filter(e => e instanceof Plant && e.energy > 8);
        } else {
            foodTargets = nearby.filter(e =>
                (e instanceof Animal && e.type === 'herbivore') || e instanceof Insect
            );
        }

        const mates = (this.reproductionCooldown <= 0 && this.energy > 75)
            ? nearby.filter(e =>
                e instanceof Animal &&
                e.type === this.type &&
                e.energy > 65 &&
                e.reproductionCooldown <= 0 &&
                // ── Mating range limit — geographic isolation / speciation ──
                this.distanceTo(e) < (window.SIM_PARAMS?.maxMatingRange || 180))
            : [];

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
            const myStr     = this.genes.strength   || 1;
            const theirStr  = target.genes.strength || 1;
            const mySize    = this.genes.size        || 1;
            const theirSize = target.genes.size       || 1;
            const winChance = 0.5 + (myStr * mySize - theirStr * theirSize) * 0.25;
            if (Math.random() < Math.max(0.1, Math.min(0.95, winChance))) {
                this.energy = Math.min(this.maxEnergy, this.energy + 55);
                target.alive = false;
                target._spawnCarcass(entities); // spawn immediately so scavengers can find it this tick
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

        const child = new Animal(
            this.x + (Math.random() - 0.5) * 18,
            this.y + (Math.random() - 0.5) * 18,
            this.type,
            Genetics.mutate(Genetics.crossover(this.genes, mate.genes))
        );
        child.generation = Math.max(this.generation, mate.generation) + 1;
        child.parentId   = this.id;
        child.energy     = 55;
        // Lineage inheritance — very rare new lineage split
        child.lineageId  = Math.random() < 0.005
            ? Math.floor(Math.random() * 360)
            : this.lineageId;

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
        const g     = this.genes;
        const ratio = this.energy / this.maxEnergy;
        const s     = 4.5 + (g.size || 1) * 2.8;   // base radius, size-scaled
        const isH   = this.type === 'herbivore';

        // Lineage-tinted hue within species colour band
        const hue = isH
            ? 195 + ((this.lineageId || 0) % 45)   // 195-240 blue band
            : (350 + ((this.lineageId || 0) % 30)) % 360; // 350-20 red band
        const sat = 55 + (isH ? (g.speed || 0.3) : (g.strength || 1)) * 18;
        const lit  = 32 + ratio * 30;

        const fill   = `hsl(${hue},${sat}%,${lit}%)`;
        const stroke = `hsl(${hue},${sat}%,${Math.min(85, lit + 28)}%)`;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction);

        if (isH) {
            // Herbivore: rounded teardrop — blunt back, tapered nose
            ctx.fillStyle   = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth   = 1.0;
            ctx.beginPath();
            ctx.moveTo( s * 1.35,  0);               // nose
            ctx.bezierCurveTo( s * 1.0, -s * 0.85,  -s * 0.6, -s * 1.0,  -s * 0.9,  0);
            ctx.bezierCurveTo(-s * 0.6,  s * 1.0,    s * 1.0,  s * 0.85,  s * 1.35,  0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Small ear nubs
            ctx.fillStyle = stroke;
            ctx.beginPath(); ctx.ellipse(-s * 0.55, -s * 0.82, s * 0.22, s * 0.38, -0.4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(-s * 0.55,  s * 0.82, s * 0.22, s * 0.38,  0.4, 0, Math.PI * 2); ctx.fill();

        } else {
            // Carnivore: angular predator — broad shoulders, narrow snout
            ctx.fillStyle   = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth   = 1.1;
            ctx.beginPath();
            ctx.moveTo( s * 1.55,  0);               // snout tip
            ctx.lineTo( s * 0.35, -s * 0.75);        // top-front shoulder
            ctx.lineTo(-s * 1.05, -s * 0.90);        // top-rear
            ctx.lineTo(-s * 1.25,  0);               // tail
            ctx.lineTo(-s * 1.05,  s * 0.90);        // bottom-rear
            ctx.lineTo( s * 0.35,  s * 0.75);        // bottom-front shoulder
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Fang marks
            ctx.fillStyle = `hsla(${hue},70%,85%,0.7)`;
            ctx.beginPath(); ctx.ellipse(s * 1.2, -s * 0.18, s * 0.12, s * 0.22, 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(s * 1.2,  s * 0.18, s * 0.12, s * 0.22, -0.2, 0, Math.PI * 2); ctx.fill();
        }

        // Eye
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(s * 0.52, -s * 0.36, s * 0.20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isH ? 'rgba(0,80,200,0.9)' : 'rgba(200,20,0,0.9)';
        ctx.beginPath(); ctx.arc(s * 0.56, -s * 0.36, s * 0.12, 0, Math.PI * 2); ctx.fill();

        // State indicator dot (small, on body centre)
        if (this.state !== ANIMAL_STATES.IDLE) {
            ctx.fillStyle = this.state === ANIMAL_STATES.FLEE ? 'rgba(255,80,60,0.85)'
                          : this.state === ANIMAL_STATES.FOOD ? 'rgba(255,210,40,0.85)'
                          : 'rgba(0,212,170,0.85)';
            ctx.beginPath(); ctx.arc(-s * 0.15, 0, s * 0.28, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, s + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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
