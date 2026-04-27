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
        this._analyticsEvery= 15;   // update chart every N ticks
        this._extinctTrack  = { herbivore: false, carnivore: false, insect: false, plant: false };
        this._lastCounts    = {};

        // Seasonal cycle
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

        const tryPlace = (type, count, factory) => {
            let placed = 0, tries = 0;
            while (placed < count && tries < count * 8) {
                tries++;
                const x = 12 + Math.random() * (W - 24);
                const y = 12 + Math.random() * (H - 24);
                if (!this.world.isPassable(x, y)) continue;
                const e = factory(x, y);
                this.entities.push(e);
                placed++;
            }
        };

        tryPlace('plant',      180, (x, y) => new Plant(x, y));
        tryPlace('herbivore',   50, (x, y) => new Animal(x, y, 'herbivore'));
        tryPlace('carnivore',    8, (x, y) => new Animal(x, y, 'carnivore')); // FIX: was 18, predator:prey ratio 1:6 is more realistic
        tryPlace('insect',      60, (x, y) => new Insect(x, y));
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
        this._extinctTrack = { herbivore: false, carnivore: false, insect: false, plant: false };
        this._grid         = new SpatialGrid(newWorld.width, newWorld.height, 80);
        Living._nextId     = 0;
        this._seasonIndex = 0;
        this._seasonTimer = 0;
        window.SEASON = this._makeSeason(0);
        this._updateSeasonUI();
        this._populate();
    }

    // ── Single Tick ──────────────────────────────────────────────────────
    _step() {
        this.tick++;
        const dt = 1;

        // Rebuild spatial grid each tick
        this._grid.clear();
        for (const e of this.entities) {
            if (e.alive) this._grid.add(e);
        }

        // Update all entities
        for (let i = 0; i < this.entities.length; i++) {
            const e = this.entities[i];
            if (e.alive) e.update(dt, this.world, this.entities, this._grid);
        }

        // Advance slow disasters
        Disasters.tick(dt, this.world, this.entities);

        // Seasonal cycle — flip every 500 ticks
        this._seasonTimer += dt;
        if (this._seasonTimer >= 500) {
            this._seasonTimer = 0;
            this._seasonIndex = (this._seasonIndex + 1) % 4;
            window.SEASON = this._makeSeason(this._seasonIndex);
            this._updateSeasonUI();
        }

        // Purge dead (keep array compact; do periodically)
        if (this.tick % 30 === 0) {
            this.entities = this.entities.filter(e => e.alive);
        }

        // Analytics & extinction tracking
        if (this.tick % this._analyticsEvery === 0) {
            this._updateAnalytics();
            this._reseedIfNeeded(); // FIX: prevent total plant collapse from starving everything
        }
    }

    // ── Reseeding ─────────────────────────────────────────────────────────
    // If plants drop critically low, scatter a seed wave. Simulates wind dispersal
    // / dormant seeds — realistic and prevents total ecosystem collapse.
    _reseedIfNeeded() {
        const plantCount = this.entities.filter(e => e instanceof Plant && e.alive).length;
        if (plantCount < 20) {
            const toAdd = 15;
            let placed  = 0;
            let tries   = 0;
            while (placed < toAdd && tries < toAdd * 10) {
                tries++;
                const x = 12 + Math.random() * (this.world.width  - 24);
                const y = 12 + Math.random() * (this.world.height - 24);
                if (!this.world.isPassable(x, y)) continue;
                const biome = this.world.getBiomeAt(x, y);
                if (!biome || biome.type === 'water' || biome.type === 'volcanic') continue;
                const p = new Plant(x, y);
                p.energy = 15; // sprout — fragile but alive
                this.entities.push(p);
                placed++;
            }
            if (placed > 0) {
                Analytics.logDisaster(`🌱 Seed Rain (+${placed} plants)`);
            }
        }
    }

    // ── Analytics ────────────────────────────────────────────────────────
    _updateAnalytics() {
        const counts = { plants: 0, herbivores: 0, carnivores: 0, insects: 0 };

        for (const e of this.entities) {
            if (!e.alive) continue;
            if (e instanceof Plant)  { counts.plants++;     }
            else if (e instanceof Insect) { counts.insects++;    }
            else if (e instanceof Animal) {
                if (e.type === 'herbivore') counts.herbivores++;
                else                        counts.carnivores++;
            }
        }
        this._lastCounts = counts;

        Analytics.update(this.tick, counts, this.entities);

        // Gene evolution tracking
        const liveAnimals = this.entities.filter(e => e instanceof Animal && e.alive);
        if (liveAnimals.length > 0) {
            const avgSpeed    = liveAnimals.reduce((s, a) => s + (a.genes.speed    || 1), 0) / liveAnimals.length;
            const avgStrength = liveAnimals.reduce((s, a) => s + (a.genes.strength || 1), 0) / liveAnimals.length;
            const maxGen      = liveAnimals.reduce((m, a) => Math.max(m, a.generation), 0);
            Analytics.updateGenes(this.tick, { avgSpeed, avgStrength, maxGen });
        }

        // Extinction detection
        this._checkExtinction('herbivore', counts.herbivores === 0);
        this._checkExtinction('carnivore', counts.carnivores === 0);
        this._checkExtinction('insect',    counts.insects    === 0);
        this._checkExtinction('plant',     counts.plants     === 0);
    }

    _checkExtinction(key, isZero) {
        if (isZero && !this._extinctTrack[key]) {
            this._extinctTrack[key] = true;
            Analytics.logExtinction(key.toUpperCase(), this.tick);
            this._showExtinctionAlert(key);
        } else if (!isZero && this._extinctTrack[key]) {
            this._extinctTrack[key] = false; // Recovered
        }
    }

    _showExtinctionAlert(key) {
        const COLORS = { herbivore: '#4a9eff', carnivore: '#ff4a3a', insect: '#ffd040', plant: '#38c968' };
        const overlay = document.getElementById('extinction-alert');
        if (!overlay) return;
        overlay.textContent  = `⚠ ${key.toUpperCase()} EXTINCT — T${this.tick}`;
        overlay.style.borderColor = COLORS[key] || '#ff4a3a';
        overlay.style.color       = COLORS[key] || '#ff4a3a';
        overlay.classList.add('show');
        this.paused = true;
        const playBtn = document.getElementById('btn-play-pause');
        if (playBtn) { playBtn.textContent = '▶ PLAY'; playBtn.classList.add('paused'); }
        setTimeout(() => {
            overlay.classList.remove('show');
            this.paused = false;
            if (playBtn) { playBtn.textContent = '⏸ PAUSE'; playBtn.classList.remove('paused'); }
        }, 2500);
    }

    // ── Season Helpers ───────────────────────────────────────────────────
    _makeSeason(index) {
        const SEASONS = [
            { name: 'SPRING', emoji: '🌱', mult: 1.1, tint: 'rgba(80,200,80,0.05)',    textColor: '#68d468' },
            { name: 'SUMMER', emoji: '☀',  mult: 1.0, tint: 'rgba(255,200,60,0.05)',   textColor: '#ffd040' },
            { name: 'AUTUMN', emoji: '🍂', mult: 0.75, tint: 'rgba(200,130,40,0.07)',  textColor: '#d07830' },
            { name: 'WINTER', emoji: '❄',  mult: 0.45, tint: 'rgba(80,140,220,0.10)', textColor: '#80b8e8' },
        ];
        return SEASONS[index];
    }

    _updateSeasonUI() {
        const s  = window.SEASON;
        const el = document.getElementById('stat-season');
        if (el) {
            el.textContent = `${s.emoji} ${s.name}`;
            el.style.color = s.textColor;
        }
    }

    // ── Render ───────────────────────────────────────────────────────────
    _render() {
        const ctx    = this.world.ctx;
        const sel    = UI.selectedEntity;

        this.world.render();

        // Draw all entities
        for (const e of this.entities) {
            if (!e.alive) continue;
            e.render(ctx, e === sel);
        }

        // Refresh entity panel live
        if (sel) UI.tick();
    }
}
