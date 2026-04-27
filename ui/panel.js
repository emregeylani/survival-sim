// ─── UI Panel ────────────────────────────────────────────────────────────────
// Renders entity detail in the right panel when an entity is selected.

const UI = {
    selectedEntity: null,
    canvas:         null,
    sim:            null,

    init(canvas, sim) {
        this.canvas = canvas;
        this.sim    = sim;

        canvas.addEventListener('click', e => this._onCanvasClick(e));
    },

    _onCanvasClick(e) {
        const rect  = this.canvas.getBoundingClientRect();
        const mx    = e.clientX - rect.left;
        const my    = e.clientY - rect.top;

        // Check pending disaster placement
        if (Controls._pendingEvent) {
            Controls._firePendingEvent(mx, my);
            return;
        }

        // Find closest entity within 18px
        let best  = null;
        let bestD = 18 * 18;
        for (const entity of this.sim.entities) {
            if (!entity.alive) continue;
            const dx = entity.x - mx;
            const dy = entity.y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD) { bestD = d2; best = entity; }
        }

        this.selectedEntity = best;

        if (!best) {
            // No entity hit — show terrain info instead
            const biome = this.sim.world.getBiomeAt(mx, my);
            this.renderBiomePanel(biome, mx, my);
        } else {
            this.renderPanel();
        }

        // Switch to entity tab
        if (best) {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === 'entity');
            });
            document.querySelectorAll('.tab-content').forEach(t => {
                t.classList.toggle('active', t.id === 'tab-entity');
            });
        }
    },

    renderPanel() {
        const panel = document.getElementById('entity-panel');
        const e     = this.selectedEntity;

        if (!e || !e.alive) {
            panel.innerHTML = `
                <div class="no-selection">
                    <div class="no-sel-icon">◎</div>
                    <div>click an entity<br>to inspect</div>
                </div>`;
            return;
        }

        const s    = e.getSummary();
        const type = s.subtype || s.className.toLowerCase();
        const color = this._typeColor(type);

        const geneKeys = Object.keys(s.genes).filter(k =>
            ['speed','visionRange','strength','size','reproductionRate','camouflage','metabolism',
             'coldResistance','heatResistance'].includes(k));

        const traits = Genetics.describe(s.genes);

        const energyPct = Math.min(100, Math.floor(s.energy / s.maxEnergy * 100));
        const agePct    = Math.min(100, Math.floor(s.age / (e.maxAge || 800) * 100));

        const repCD = s.reproductionCooldown !== undefined
            ? `<div class="stat-row"><span class="key">REPRO CD</span><span class="val">${s.reproductionCooldown}</span></div>`
            : '';

        const killRow = s.killCount !== undefined
            ? `<div class="stat-row"><span class="key">KILLS</span><span class="val">${s.killCount}</span></div>`
            : '';

        const stateRow = s.state
            ? `<div class="stat-row"><span class="key">STATE</span><span class="val">${s.state.toUpperCase()}</span></div>`
            : '';

        panel.innerHTML = `
            <div class="entity-header">
                <div class="entity-dot" style="background:${color}"></div>
                <span class="entity-type" style="color:${color}">${this._typeLabel(type)}</span>
                <span class="entity-id">#${s.id}</span>
            </div>

            <div class="bar-row">
                <div class="bar-label"><span>ENERGY</span><span>${energyPct}%</span></div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${energyPct}%;background:${this._energyColor(energyPct)}"></div>
                </div>
            </div>
            <div class="bar-row">
                <div class="bar-label"><span>AGE</span><span>${agePct}%</span></div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${agePct}%;background:#6060c0"></div>
                </div>
            </div>

            <div class="stat-row"><span class="key">AGE (TICKS)</span><span class="val">${s.age}</span></div>
            <div class="stat-row"><span class="key">GENERATION</span><span class="val" style="color:var(--accent)">${s.generation}</span></div>
            <div class="stat-row"><span class="key">CHILDREN</span><span class="val">${s.childCount}</span></div>
            <div class="stat-row"><span class="key">FITNESS</span><span class="val" style="color:var(--accent2)">${s.fitness}</span></div>
            ${stateRow}
            ${killRow}
            ${repCD}

            <div class="genes-section">
                <div class="section-title">GENOME</div>
                ${geneKeys.map(k => this._geneRow(k, s.genes[k])).join('')}
            </div>

            ${traits.length > 0 ? `
            <div class="genes-section">
                <div class="section-title">TRAITS</div>
                <div class="traits-row">
                    ${traits.map(t => `<span class="trait-tag ${t.positive === true ? 'trait-pos' : t.positive === false ? 'trait-neg' : 'trait-neu'}">${t.label}</span>`).join('')}
                </div>
            </div>` : ''}
        `;
    },

    _geneRow(key, val) {
        const def     = { speed:{min:0.3,max:3}, visionRange:{min:20,max:200},
                          strength:{min:0.3,max:3}, size:{min:0.5,max:3},
                          reproductionRate:{min:0.1,max:1}, camouflage:{min:0,max:1},
                          metabolism:{min:0.4,max:2}, coldResistance:{min:0.1,max:1},
                          heatResistance:{min:0.1,max:1} }[key] || {min:0,max:1};
        const pct     = Math.max(0, Math.min(100, ((val - def.min) / (def.max - def.min)) * 100));
        const display = val > 10 ? Math.round(val) : val.toFixed(2);
        const label   = key.replace(/([A-Z])/g, ' $1').toLowerCase();

        return `
            <div class="gene-row">
                <span class="gene-name">${label}</span>
                <div class="gene-bar-track">
                    <div class="gene-bar-fill" style="width:${pct}%"></div>
                </div>
                <span class="gene-val">${display}</span>
            </div>`;
    },

    _typeColor(type) {
        return { plant:'#38c968', herbivore:'#4a9eff', carnivore:'#ff4a3a',
                 insect:'#ffd040' }[type] || '#aaa';
    },

    _typeLabel(type) {
        return { plant:'PLANT', herbivore:'HERBIVORE', carnivore:'CARNIVORE',
                 insect:'INSECT' }[type] || type.toUpperCase();
    },

    _energyColor(pct) {
        if (pct > 60) return '#38c968';
        if (pct > 30) return '#ffd040';
        return '#ff4a3a';
    },

    /** Show biome/terrain info when clicking empty space. */
    renderBiomePanel(biome, mx, my) {
        const panel = document.getElementById('entity-panel');
        if (!biome) {
            panel.innerHTML = `<div class="no-selection"><div class="no-sel-icon">◎</div><div>click an entity<br>to inspect</div></div>`;
            return;
        }

        const BIOME_META = {
            water:     { label: 'WATER',     icon: '≋', color: '#4a8fcc' },
            snow:      { label: 'SNOW',       icon: '❄', color: '#b8d8e8' },
            desert:    { label: 'DESERT',     icon: '◌', color: '#c8a040' },
            grassland: { label: 'GRASSLAND',  icon: '◈', color: '#38c968' },
            forest:    { label: 'FOREST',     icon: '◉', color: '#1d7a30' },
            volcanic:  { label: 'VOLCANIC',   icon: '⬟', color: '#d04020' },
            scorched:  { label: 'SCORCHED',   icon: '◆', color: '#906030' },
            frozen:    { label: 'FROZEN',     icon: '✦', color: '#80b8d0' },
            drought:   { label: 'DROUGHT',    icon: '◎', color: '#b08040' },
        };
        const meta  = BIOME_META[biome.type] || { label: biome.type.toUpperCase(), icon: '?', color: '#aaa' };
        const resPct = Math.round((biome.resources || 0) * 100);
        const passStr = biome.passable ? '<span style="color:#38c968">PASSABLE</span>' : '<span style="color:#ff4a3a">IMPASSABLE</span>';

        // Count nearby entities
        const entities = this.sim.entities;
        const r2 = 40 * 40;
        let plants = 0, herbs = 0, carns = 0, insects = 0;
        for (const e of entities) {
            if (!e.alive) continue;
            const dx = e.x - mx, dy = e.y - my;
            if (dx*dx + dy*dy > r2) continue;
            if (e instanceof Plant)  plants++;
            else if (e instanceof Insect) insects++;
            else if (e instanceof Animal) {
                if (e.type === 'herbivore') herbs++;
                else carns++;
            }
        }

        panel.innerHTML = `
            <div class="entity-header">
                <div class="entity-dot" style="background:${meta.color}"></div>
                <span class="entity-type" style="color:${meta.color}">${meta.icon} ${meta.label}</span>
                <span class="entity-id">TERRAIN</span>
            </div>

            <div class="bar-row">
                <div class="bar-label"><span>RESOURCES</span><span>${resPct}%</span></div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${resPct}%;background:#38c968"></div>
                </div>
            </div>

            <div class="stat-row"><span class="key">STATUS</span><span class="val">${passStr}</span></div>
            <div class="stat-row"><span class="key">ENERGY COST</span><span class="val">${(biome.energyCost||1).toFixed(1)}×</span></div>

            <div class="genes-section" style="margin-top:10px">
                <div class="section-title">NEARBY (r=40)</div>
                <div class="stat-row"><span class="key" style="color:#38c968">PLANTS</span><span class="val">${plants}</span></div>
                <div class="stat-row"><span class="key" style="color:#4a9eff">HERBIVORES</span><span class="val">${herbs}</span></div>
                <div class="stat-row"><span class="key" style="color:#ff4a3a">CARNIVORES</span><span class="val">${carns}</span></div>
                <div class="stat-row"><span class="key" style="color:#ffd040">INSECTS</span><span class="val">${insects}</span></div>
            </div>`;
    },

    /** Called every frame to refresh live values if panel is open. */
    tick() {
        if (!this.selectedEntity) return;
        if (!this.selectedEntity.alive) {
            this.selectedEntity = null;
            this.renderPanel();
            return;
        }
        this.renderPanel();
    },
};
