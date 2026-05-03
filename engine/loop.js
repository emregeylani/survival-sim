// ─── Simulation Loop ─────────────────────────────────────────────────────────

class SimulationLoop {
    constructor(world) {
        this.world          = world;
        this.entities       = [];
        this.tick           = 0;
        this.paused         = false;
        this.ticksPerFrame  = 3;
        this.extinctionLog  = [];
        this._grid          = new SpatialGrid(world.width, world.height, 80);
        this._raf           = null;
        this._analyticsEvery= 15;
        this._extinctTrack  = {
            herbivore: false, carnivore: false,
            insect: false,    plant: false,
            scavenger: false, bird: false,
            fish: false,
        };
        this._lastCounts    = {};

        this._seasonIndex = 0;
        this._seasonTimer = 0;
        window.SEASON = this._makeSeason(0);

        this._populate();
    }

    // ── Initial Population ───────────────────────────────────────────────
    _populate() {
        this.entities = [];
        const W = this.world.width;
        const H = this.world.height;

        const tryPlace = (count, factory) => {
            let placed = 0, tries = 0;
            while (placed < count && tries < count * 8) {
                tries++;
                const x = 12 + Math.random() * (W - 24);
                const y = 12 + Math.random() * (H - 24);
                if (!this.world.isPassable(x, y)) continue;
                this.entities.push(factory(x, y));
                placed++;
            }
        };

        tryPlace(180, (x, y) => new Plant(x, y));
        tryPlace(50,  (x, y) => new Animal(x, y, 'herbivore'));
        tryPlace(8,   (x, y) => new Animal(x, y, 'carnivore'));
        tryPlace(60,  (x, y) => new Insect(x, y));
        tryPlace(14,  (x, y) => new Scavenger(x, y));
        tryPlace(18,  (x, y) => new Bird(x, y));

        // Fish — place specifically in water tiles
        let fishPlaced = 0, fishTries = 0;
        while (fishPlaced < 25 && fishTries < 500) {
            fishTries++;
            const x = 12 + Math.random() * (W - 24);
            const y = 12 + Math.random() * (H - 24);
            const b = this.world.getBiomeAt(x, y);
            if (b && b.type === 'water') {
                this.entities.push(new Fish(x, y));
                fishPlaced++;
            }
        }
    }

    // ── Main Loop ────────────────────────────────────────────────────────
    start() {
        const loop = () => {
            if (!this.paused) {
                for (let i = 0; i < this.ticksPerFrame; i++) {
                    this._step();
                }
            }
            this._render();
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    restart(newWorld) {
        this.world         = newWorld;
        this.tick          = 0;
        this.extinctionLog = [];
        this._extinctTrack = {
            herbivore: false, carnivore: false,
            insect: false,    plant: false,
            scavenger: false, bird: false,
            fish: false,
        };
        this._grid        = new SpatialGrid(newWorld.width, newWorld.height, 80);
        Living._nextId    = 0;
        this._seasonIndex = 0;
        this._seasonTimer = 0;
        window.SEASON     = this._makeSeason(0);
        this._updateSeasonUI();
        this._populate();
    }

    // ── Single Tick ──────────────────────────────────────────────────────
    _step() {
        this.tick++;
        const dt = 1 * (window.SIM_PARAMS?.simSpeed ?? 0.25);

        this._grid.clear();
        for (const e of this.entities) {
            if (e.alive) this._grid.add(e);
        }

        for (let i = 0; i < this.entities.length; i++) {
            const e = this.entities[i];
            if (e.alive) e.update(dt, this.world, this.entities, this._grid);
        }

        Disasters.tick(dt, this.world, this.entities);

        this._seasonTimer += dt;
        if (this._seasonTimer >= 500) {
            this._seasonTimer = 0;
            this._seasonIndex = (this._seasonIndex + 1) % 4;
            window.SEASON     = this._makeSeason(this._seasonIndex);
            this._updateSeasonUI();
        }

        if (this.tick % 30 === 0) {
            this.entities = this.entities.filter(e => e.alive);
        }

        if (this.tick % this._analyticsEvery === 0) {
            this._updateAnalytics();
            this._reseedIfNeeded();
        }
    }

    // ── Reseeding ─────────────────────────────────────────────────────────
    _reseedIfNeeded() {
        const plantCount = this.entities.filter(e => e instanceof Plant && e.alive).length;
        if (plantCount < 20) {
            let placed = 0, tries = 0;
            while (placed < 15 && tries < 150) {
                tries++;
                const x = 12 + Math.random() * (this.world.width  - 24);
                const y = 12 + Math.random() * (this.world.height - 24);
                if (!this.world.isPassable(x, y)) continue;
                const biome = this.world.getBiomeAt(x, y);
                if (!biome || biome.type === 'water' || biome.type === 'volcanic') continue;
                const p = new Plant(x, y);
                p.energy = 15;
                this.entities.push(p);
                placed++;
            }
            if (placed > 0) Analytics.logDisaster(`🌱 Seed Rain (+${placed} plants)`);
        }

        // Emergency scavenger rescue — tiny minimum floor
        const scavCount = this.entities.filter(e => e instanceof Scavenger && e.alive).length;
        if (scavCount < 3) {
            let placed = 0, tries = 0;
            while (placed < 4 && tries < 80) {
                tries++;
                const x = 12 + Math.random() * (this.world.width  - 24);
                const y = 12 + Math.random() * (this.world.height - 24);
                if (!this.world.isPassable(x, y)) continue;
                this.entities.push(new Scavenger(x, y));
                placed++;
            }
        }

        // Emergency Fish reseed — confined to water so can't recolonise naturally
        const fishCount = this.entities.filter(e => e instanceof Fish && e.alive).length;
        if (fishCount < 5) {
            let placed = 0, tries = 0;
            while (placed < 8 && tries < 400) {
                tries++;
                const x = 12 + Math.random() * (this.world.width  - 24);
                const y = 12 + Math.random() * (this.world.height - 24);
                const b = this.world.getBiomeAt(x, y);
                if (b && b.type === 'water') {
                    this.entities.push(new Fish(x, y));
                    placed++;
                }
            }
        }
    }

    // ── Analytics ────────────────────────────────────────────────────────
    _updateAnalytics() {
        const counts = {
            plants: 0, herbivores: 0, carnivores: 0,
            insects: 0, scavengers: 0, birds: 0, carcasses: 0, fish: 0,
        };

        let speedSum = 0, strengthSum = 0, maxGen = 0, animalCount = 0;

        for (const e of this.entities) {
            if (!e.alive) continue;

            if (e instanceof Carcass)        counts.carcasses++;
            else if (e instanceof Plant)     counts.plants++;
            else if (e instanceof Insect)    counts.insects++;
            else if (e instanceof Scavenger) counts.scavengers++;
            else if (e instanceof Bird)      counts.birds++;
            else if (e instanceof Fish)      counts.fish++;
            else if (e instanceof Animal) {
                if (e.type === 'herbivore') counts.herbivores++;
                else                        counts.carnivores++;
            }

            if (!(e instanceof Plant) && !(e instanceof Carcass) && e.genes?.speed) {
                speedSum    += e.genes.speed    || 1;
                strengthSum += e.genes.strength || 1;
                if (e.generation > maxGen) maxGen = e.generation;
                animalCount++;
            }
        }

        this._lastCounts = counts;
        Analytics.update(this.tick, counts, this.entities);

        if (animalCount > 0) {
            Analytics.updateGenes(this.tick, {
                avgSpeed:    speedSum    / animalCount,
                avgStrength: strengthSum / animalCount,
                maxGen,
            });
        }

        this._checkExtinction('herbivore', counts.herbivores === 0);
        this._checkExtinction('carnivore', counts.carnivores === 0);
        this._checkExtinction('insect',    counts.insects    === 0);
        this._checkExtinction('plant',     counts.plants     === 0);
        this._checkExtinction('scavenger', counts.scavengers === 0);
        this._checkExtinction('bird',      counts.birds      === 0);
        this._checkExtinction('fish',      counts.fish       === 0);
    }

    _checkExtinction(key, isZero) {
        if (isZero && !this._extinctTrack[key]) {
            this._extinctTrack[key] = true;
            Analytics.logExtinction(key.toUpperCase(), this.tick);
            this._showExtinctionAlert(key);
        } else if (!isZero && this._extinctTrack[key]) {
            this._extinctTrack[key] = false;
        }
    }

    _showExtinctionAlert(key) {
        // No overlay, no pause — info goes to the extinction log in the analytics panel
    }

    // ── Season Helpers ───────────────────────────────────────────────────
    _makeSeason(index) {
        const SEASONS = [
            { name: 'SPRING', emoji: '🌱', mult: 1.1,  tint: 'rgba(80,200,80,0.05)',   textColor: '#68d468' },
            { name: 'SUMMER', emoji: '☀',  mult: 1.0,  tint: 'rgba(255,200,60,0.05)',  textColor: '#ffd040' },
            { name: 'AUTUMN', emoji: '🍂', mult: 0.75, tint: 'rgba(200,130,40,0.07)',  textColor: '#d07830' },
            { name: 'WINTER', emoji: '❄',  mult: 0.45, tint: 'rgba(80,140,220,0.10)', textColor: '#80b8e8' },
        ];
        return SEASONS[index];
    }

    _updateSeasonUI() {
        const s  = window.SEASON;
        const el = document.getElementById('stat-season');
        if (el) { el.textContent = `${s.emoji} ${s.name}`; el.style.color = s.textColor; }
    }

    // ── Render ───────────────────────────────────────────────────────────
    _render() {
        const ctx = this.world.ctx;
        const sel = UI.selectedEntity;
        const cam = window.camera || { scale: 1, tx: 0, ty: 0 };

        // Clear full canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#060c12';
        ctx.fillRect(0, 0, this.world.width, this.world.height);

        // Apply camera
        ctx.save();
        ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.tx, cam.ty);

        // Layer order: world → carcasses → plants → moving entities
        this.world.render();

        for (const e of this.entities) {
            if (e.alive && e instanceof Carcass) e.render(ctx, e === sel);
        }
        for (const e of this.entities) {
            if (e.alive && e instanceof Plant) e.render(ctx, e === sel);
        }
        for (const e of this.entities) {
            if (!e.alive) continue;
            if (!(e instanceof Carcass) && !(e instanceof Plant)) {
                e.render(ctx, e === sel);
            }
        }

        ctx.restore();

        if (sel) UI.tick();
    }
}
