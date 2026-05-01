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
        this.maxAge       = 2000 + Math.random() * 1000;
        this.spreadTimer  = 40 + Math.random() * 60;
        this.renderSize   = 2.5 + Math.random() * 1.5;
        // Random rotation for visual variety
        this._rot         = Math.random() * Math.PI * 2;
    }

    update(dt, world, entities, grid) {
        this.age += dt;
        const biome = world.getBiomeAt(this.x, this.y);

        if (!biome || biome.type === 'water') { this.alive = false; return; }

        if (biome.type === 'volcanic') {
            this.energy -= dt * 4;
        } else {
            const bmul       = this.biomeMultiplier(biome);
            const seasonMult = (window.SEASON && window.SEASON.mult) || 1.0;
            const grow       = dt * this.genes.growthRate * (biome.resources || 0.5) * bmul * seasonMult;
            this.energy      = Math.min(this.maxEnergy, this.energy + grow);
        }

        this.spreadTimer -= dt;
        if (this.spreadTimer <= 0) {
            this.spreadTimer  = 50 + Math.random() * 80;
            const spreadChance = (window.SIM_PARAMS?.plantSpread || 0.3) * 0.2;
            if (this.energy > 40 && Math.random() < spreadChance) this._spread(world, entities);
        }

        if (this.age > this.maxAge || this.energy <= 0) this.alive = false;
    }

    _spread(world, entities) {
        const maxPlants  = window.SIM_PARAMS?.maxPlants || 500;
        const plantCount = entities.filter(e => e instanceof Plant).length;
        if (plantCount >= maxPlants) return;

        const angle = Math.random() * Math.PI * 2;
        const dist  = 15 + Math.random() * 35;
        const nx    = this.x + Math.cos(angle) * dist;
        const ny    = this.y + Math.sin(angle) * dist;

        if (nx < 5 || ny < 5 || nx > world.width - 5 || ny > world.height - 5) return;
        const biome = world.getBiomeAt(nx, ny);
        if (!biome || biome.type === 'water' || biome.type === 'volcanic' || biome.resources < 0.1) return;

        let nearby = 0;
        for (const e of entities) {
            if (e instanceof Plant && e.dist2({x:nx,y:ny}) < 18*18) {
                if (++nearby >= 4) return;
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
        const s     = this.renderSize * (0.6 + ratio * 0.8); // grows with health

        // Colour: young=lime, healthy=rich green, dying=olive
        const gr = Math.floor(110 + ratio * 110);
        const rr = Math.floor(10  + ratio * 30);
        const fillColor   = `rgb(${rr},${gr},${Math.floor(rr * 0.4)})`;
        const strokeColor = `rgba(0,${Math.floor(gr * 0.4)},0,0.6)`;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._rot);

        if (ratio > 0.55) {
            // Mature: 3-leaf star
            for (let i = 0; i < 3; i++) {
                ctx.save();
                ctx.rotate((i / 3) * Math.PI * 2);
                ctx.fillStyle   = fillColor;
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth   = 0.7;
                ctx.beginPath();
                ctx.ellipse(0, -s * 0.85, s * 0.55, s * 0.9, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
            // Stem dot
            ctx.fillStyle = `rgb(${rr + 10},${Math.floor(gr * 0.55)},10)`;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
            ctx.fill();

        } else if (ratio > 0.25) {
            // Growing: simple cross with rounded ends
            const hw = s * 0.32;
            ctx.fillStyle   = fillColor;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth   = 0.7;
            ctx.beginPath();
            ctx.roundRect(-hw, -s, hw * 2, s * 2, hw * 0.8);
            ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(-s, -hw, s * 2, hw * 2, hw * 0.8);
            ctx.fill(); ctx.stroke();

        } else {
            // Seedling: single small oval
            ctx.fillStyle   = `rgba(${rr + 20},${gr - 20},0,0.75)`;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth   = 0.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 0.55, s * 0.9, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        }

        ctx.restore();
    }

    getSummary() {
        return { ...super.getSummary(), subtype: 'plant' };
    }
}
