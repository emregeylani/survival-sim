// ─── Insect ───────────────────────────────────────────────────────────────────

class Insect extends Living {
    constructor(x, y, genes = null) {
        super(x, y, genes || Genetics.defaultGenes({
            speed:            1.5 + Math.random() * 0.8,
            visionRange:      35  + Math.random() * 20,
            strength:         0.3,
            size:             0.5,
            reproductionRate: 0.75,
            metabolism:       0.8,
        }));
        this.energy              = 50 + Math.random() * 20;
        this.maxEnergy           = 75;
        this.maxAge              = 80 + Math.random() * 80;
        this.reproductionCooldown = 0;
        this.direction           = Math.random() * Math.PI * 2;
        this.turnTimer           = 0;
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        this.reproductionCooldown -= dt;

        // BUG FIX: same immortal-on-water issue as Animal — check death first
        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
            return;
        }

        const biome = world.getBiomeAt(this.x, this.y);
        if (!biome || biome.type === 'water') {
            this.energy -= dt * 0.06;
            this._bounce();
            return;
        }

        const bmul = this.biomeMultiplier(biome);
        const meta = this.genes.metabolism || 1.0;
        this.energy -= dt * 0.25 * meta / Math.max(0.1, bmul);

        // Random turn
        this.turnTimer -= dt;
        if (this.turnTimer <= 0) {
            this.direction += (Math.random() - 0.5) * 1.2;
            this.turnTimer = 8 + Math.random() * 12;
        }

        // Seek plants when hungry
        if (this.energy < this.maxEnergy * 0.7) {
            const nearby = grid
                ? grid.getNearby(this.x, this.y, this.genes.visionRange)
                : entities;

            let closestPlant = null;
            let minD2 = this.genes.visionRange ** 2;
            for (const e of nearby) {
                if (e instanceof Plant && e.alive && e.energy > 5) {
                    const d2 = this.dist2(e);
                    if (d2 < minD2) { minD2 = d2; closestPlant = e; }
                }
            }

            if (closestPlant) {
                this.direction = Math.atan2(closestPlant.y - this.y, closestPlant.x - this.x);
                if (minD2 < 6 * 6) {
                    const gain = Math.min(closestPlant.energy, 12);
                    this.energy = Math.min(this.maxEnergy, this.energy + gain);
                    closestPlant.energy -= gain;
                    if (closestPlant.energy <= 0) closestPlant.alive = false;
                }
            }
        }

        // Reproduce
        if (this.energy > 55 && this.reproductionCooldown <= 0) {
            const insectCount = entities.filter(e => e instanceof Insect).length;
            if (insectCount < 200 && Math.random() < 0.03 * (this.genes.reproductionRate || 0.75)) {
                const child = new Insect(
                    this.x + (Math.random() - 0.5) * 12,
                    this.y + (Math.random() - 0.5) * 12,
                    Genetics.mutate(this.genes)
                );
                child.generation = this.generation + 1;
                child.parentId   = this.id;
                this.energy -= 18;
                this.reproductionCooldown = 25;
                this.childCount++;
                entities.push(child);
            }
        }

        this._move(world);

        if (this.energy <= 0 || this.age > this.maxAge) this.alive = false;
    }

    _bounce() {
        this.direction += Math.PI + (Math.random() - 0.5) * 0.8;
    }

    _move(world) {
        const spd = this.genes.speed;
        let nx = this.x + Math.cos(this.direction) * spd;
        let ny = this.y + Math.sin(this.direction) * spd;
        nx = Math.max(4, Math.min(world.width  - 4, nx));
        ny = Math.max(4, Math.min(world.height - 4, ny));
        if (world.isPassable(nx, ny)) {
            this.x = nx; this.y = ny;
        } else {
            this._bounce();
        }
    }

    render(ctx, isSelected) {
        const alpha = 0.55 + (this.energy / this.maxEnergy) * 0.45;
        ctx.fillStyle = `rgba(255, 210, 30, ${alpha})`;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction); // diamond oriented along movement
        // Small teardrop diamond: wider at front, narrow tail
        ctx.beginPath();
        ctx.moveTo( 2.6,  0);    // nose
        ctx.lineTo( 0,   -1.5);  // top
        ctx.lineTo(-1.6,  0);    // tail
        ctx.lineTo( 0,    1.5);  // bottom
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getSummary() {
        return {
            ...super.getSummary(),
            subtype: 'insect',
            hunger:  Math.floor((1 - this.energy / this.maxEnergy) * 100),
        };
    }
}
