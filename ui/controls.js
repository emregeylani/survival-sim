// ─── Controls ────────────────────────────────────────────────────────────────

const Controls = {
    sim:           null,
    _pendingEvent: null,
    _pendingBtn:   null,

    init(sim) {
        this.sim = sim;
        this._bindTabs();
        this._bindTime();
        this._bindEvents();
    },

    _bindTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
            });
        });
    },

    _bindTime() {
        const playPause = document.getElementById('btn-play-pause');
        playPause.addEventListener('click', () => {
            this.sim.paused = !this.sim.paused;
            playPause.textContent = this.sim.paused ? '▶ PLAY' : '⏸ PAUSE';
            playPause.classList.toggle('paused', this.sim.paused);
        });
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // simSpeed controls dt multiplier; ticksPerFrame stays at 1
                window.SIM_PARAMS.simSpeed = parseFloat(btn.dataset.speed);
            });
        });
    },

    _bindEvents() {
        document.querySelectorAll('.event-btn').forEach(btn => {
            btn.addEventListener('click', () => this._onEventBtn(btn));
        });
    },

    _onEventBtn(btn) {
        const type = btn.dataset.event;
        if (type === 'iceage') {
            Disasters.triggerIceAge(window.world, this.sim.entities);
            this._flashBtn(btn); Analytics.logDisaster('Ice Age'); return;
        }
        if (type === 'drought') {
            Disasters.triggerDrought(window.world, this.sim.entities);
            this._flashBtn(btn); Analytics.logDisaster('Drought'); return;
        }
        if (this._pendingEvent === type) { this._clearPending(); return; }
        this._clearPending();
        this._pendingEvent = type;
        this._pendingBtn   = btn;
        btn.classList.add('pending');
        const msg = document.getElementById('canvas-overlay-msg');
        msg.textContent = type === 'meteor' ? '☄  CLICK TO AIM METEOR STRIKE' : '🌋  CLICK TO PLACE VOLCANO';
        msg.classList.add('show');
    },

    _firePendingEvent(mx, my) {
        const type = this._pendingEvent;
        if (type === 'meteor') {
            Disasters.triggerMeteor(window.world, this.sim.entities, mx, my);
            Analytics.logDisaster('Meteor Strike');
        } else if (type === 'volcano') {
            Disasters.triggerVolcano(window.world, this.sim.entities, mx, my);
            Analytics.logDisaster('Volcano');
        }
        this._flashBtn(this._pendingBtn);
        this._clearPending();
    },

    _clearPending() {
        this._pendingEvent = null;
        if (this._pendingBtn) { this._pendingBtn.classList.remove('pending'); this._pendingBtn = null; }
        document.getElementById('canvas-overlay-msg').classList.remove('show');
    },

    _flashBtn(btn) {
        btn.style.background = 'rgba(255,90,60,0.5)';
        setTimeout(() => btn.style.background = '', 400);
    },
};

// ── Params Panel ─────────────────────────────────────────────────────────────
const Params = {
    init(sim, world) {
        const bind = (id, key, transform = parseFloat) => {
            const el  = document.getElementById(id);
            const val = document.getElementById(id + '-val');
            if (!el) return;
            el.addEventListener('input', () => {
                const v = transform(el.value);
                SIM_PARAMS[key] = v;
                if (val) val.textContent = v.toFixed ? v.toFixed(2) : v;
            });
        };

        bind('p-mutation',   'mutationRate');
        bind('p-spread',     'plantSpread');
        bind('p-maxherb',    'maxHerbivores',  parseInt);
        bind('p-maxcarn',    'maxCarnivores',  parseInt);
        bind('p-maxplant',   'maxPlants',      parseInt);
        bind('p-maxscav',    'maxScavengers',  parseInt);
        bind('p-maxbird',    'maxBirds',       parseInt);
        bind('p-matingrange','maxMatingRange', parseInt);

        document.getElementById('btn-restart').addEventListener('click', () => {
            const seed = parseInt(document.getElementById('p-seed').value) || 42;
            SIM_PARAMS.seed = seed;
            const canvas = document.getElementById('sim-canvas');
            window.world  = new World(canvas, seed);
            window.sim.restart(window.world);
            Analytics.reset();
            UI.selectedEntity = null;
            UI.renderPanel();
        });
    },
};
