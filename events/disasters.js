// ─── Disasters ───────────────────────────────────────────────────────────────
// User-triggered environmental catastrophes.

const Disasters = {
    // Active slow disasters (ice age, drought) state
    _iceAgeActive:   false,
    _droughtActive:  false,
    _iceAgeTimer:    0,
    _droughtTimer:   0,

    /**
     * Call each tick to advance gradual disasters.
     */
    tick(dt, world, entities) {
        if (this._iceAgeActive) {
            this._iceAgeTimer -= dt;
            world.spreadDisaster('frozen', 0.003, ['grassland', 'forest', 'desert']);
            if (this._iceAgeTimer <= 0) {
                this._iceAgeActive = false;
                this._setIndicator('');
            }
        }
        if (this._droughtActive) {
            this._droughtTimer -= dt;
            world.spreadDisaster('drought', 0.002, ['grassland', 'forest']);
            if (this._droughtTimer <= 0) {
                this._droughtActive = false;
                this._setIndicator('');
            }
        }
    },

    // ── Meteor ──────────────────────────────────────────────────────────
    // User clicks canvas after activating → strike at click point.
    triggerMeteor(world, entities, cx, cy) {
        const radius = 60 + Math.random() * 60;

        // Kill entities in blast radius
        for (const e of entities) {
            const dx = e.x - cx, dy = e.y - cy;
            if (dx*dx + dy*dy <= radius*radius) {
                e.alive = false;
            }
        }

        // Scar terrain
        world.applyDisasterArea(cx, cy, radius, 'scorched');

        // Flash effect on canvas
        this._flashEffect(world.ctx, world.width, world.height, cx, cy, radius, '#ff8030');
        this._log(`☄ METEOR STRIKE at (${cx|0}, ${cy|0}) r=${radius|0}`);
    },

    // ── Volcano ─────────────────────────────────────────────────────────
    triggerVolcano(world, entities, cx, cy) {
        const radius = 40 + Math.random() * 40;

        for (const e of entities) {
            const dx = e.x - cx, dy = e.y - cy;
            if (dx*dx + dy*dy <= (radius * 0.6) ** 2) e.alive = false;
        }

        world.applyDisasterArea(cx, cy, radius,        'volcanic');
        world.applyDisasterArea(cx, cy, radius * 0.5,  'volcanic');

        this._flashEffect(world.ctx, world.width, world.height, cx, cy, radius, '#ff4010');
        this._log(`🌋 VOLCANO at (${cx|0}, ${cy|0})`);
    },

    // ── Ice Age ──────────────────────────────────────────────────────────
    triggerIceAge(world, entities) {
        this._iceAgeActive = true;
        this._iceAgeTimer  = 800; // ticks
        this._setIndicator('❄ ICE AGE IN PROGRESS');
        this._log('❄ ICE AGE BEGINS');
    },

    // ── Drought ──────────────────────────────────────────────────────────
    triggerDrought(world, entities) {
        this._droughtActive = true;
        this._droughtTimer  = 600;
        this._setIndicator('☀ DROUGHT IN PROGRESS');

        // Immediately damage all plants
        for (const e of entities) {
            if (e instanceof Plant) e.energy *= 0.4;
        }
        this._log('☀ DROUGHT BEGINS — plants weakened');
    },

    // ── Helpers ──────────────────────────────────────────────────────────
    _flashEffect(ctx, W, H, cx, cy, r, color) {
        // Draw expanding ring (immediate visual)
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.5);
        grad.addColorStop(0,   color.replace(')', ', 0.8)').replace('rgb', 'rgba'));
        grad.addColorStop(0.5, color.replace(')', ', 0.3)').replace('rgb', 'rgba'));
        grad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
        ctx.fill();
    },

    _setIndicator(msg) {
        const el = document.getElementById('event-indicator');
        if (el) el.textContent = msg;
    },

    _log(msg) {
        if (window.sim) {
            window.sim.extinctionLog.push({ tick: window.sim.tick, msg, disaster: true });
        }
    },

    isActive() {
        return this._iceAgeActive || this._droughtActive;
    },
};
