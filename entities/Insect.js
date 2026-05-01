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
        this.energy               = 50 + Math.random() * 20;
        this.maxEnergy            = 75;
        this.maxAge               = 80 + Math.random() * 80;
        this.reproductionCooldown = 0;
        this.direction            = Math.random() * Math.PI * 2;
        this.turnTimer            = 0;
        // Wing flap phase for visual variety
        this._flapPhase = Math.random() * Math.PI * 2;
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        this.reproductionCooldown -= dt;
        this._flapPhase += dt * 0.25;

        if (this.energy <= 0 || this.age > this.maxAge) { this.alive = false; return; }

        const biome = world.getBiomeAt(this.x, this.y);
        if (!biome || biome.type === 'water') {
            this.energy -= dt * 0.06;
            this._bounce();
            return;
        }

        const bmul = this.biomeMultiplier(biome);
        const meta = this.genes.metabolism || 1.0;
        this.energy -= dt * 0.25 * meta / Math.max(0.1, bmul);

        this.turnTimer -= dt;
        if (this.turnTimer <= 0) {
            this.direction += (Math.random() - 0.5) * 1.2;
            this.turnTimer  = 8 + Math.random() * 12;
        }

        if (this.energy < this.maxEnergy * 0.7) {
            const nearby = grid
                ? grid.getNearby(this.x, this.y, this.genes.visionRange)
                : entities;

            let closestPlant = null, minD2 = this.genes.visionRange ** 2;
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

    _bounce() { this.direction += Math.PI + (Math.random() - 0.5) * 0.8; }

    _move(world) {
        const spd = this.genes.speed;
        let nx = this.x + Math.cos(this.direction) * spd;
        let ny = this.y + Math.sin(this.direction) * spd;
        nx = Math.max(4, Math.min(world.width  - 4, nx));
        ny = Math.max(4, Math.min(world.height - 4, ny));
        if (world.isPassable(nx, ny)) { this.x = nx; this.y = ny; }
        else this._bounce();
    }

    render(ctx, isSelected) {
        const ratio    = this.energy / this.maxEnergy;
        const flap     = Math.abs(Math.sin(this._flapPhase)); // 0-1
        const wingOpen = 0.35 + flap * 0.65;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.direction);

        // Wings (two ellipses, symmetrical)
        const ww = 3.8, wh = 2.4;
        const wingAlpha = 0.35 + ratio * 0.30;
        ctx.fillStyle = `rgba(255, 235, 100, ${wingAlpha})`;
        ctx.strokeStyle = `rgba(200, 160, 0, ${wingAlpha + 0.15})`;
        ctx.lineWidth = 0.5;

        // Top wing
        ctx.save();
        ctx.rotate(-wingOpen * 0.55);
        ctx.beginPath();
        ctx.ellipse(-0.5, -wh * 0.4, ww, wh, -0.3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Bottom wing
        ctx.save();
        ctx.rotate(wingOpen * 0.55);
        ctx.beginPath();
        ctx.ellipse(-0.5, wh * 0.4, ww, wh, 0.3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Body — elongated oval, amber-yellow
        const br = Math.floor(220 + ratio * 35);
        const bg = Math.floor(150 + ratio * 40);
        ctx.fillStyle   = `rgb(${br}, ${bg}, 20)`;
        ctx.strokeStyle = `rgba(120, 80, 0, 0.8)`;
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.5, 3.2, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Head dot
        ctx.fillStyle = `rgb(180, 110, 10)`;
        ctx.beginPath();
        ctx.arc(0, -3.5, 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getSummary() {
        return { ...super.getSummary(), subtype: 'insect', hunger: Math.floor((1 - this.energy / this.maxEnergy) * 100) };
    }
}
