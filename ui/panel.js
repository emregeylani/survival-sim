// ─── UI Panel ────────────────────────────────────────────────────────────────

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
        const rect = this.canvas.getBoundingClientRect();
        const sx   = e.clientX - rect.left;
        const sy   = e.clientY - rect.top;

        // Convert screen → world coords
        const cam = window.camera || { scale: 1, tx: 0, ty: 0 };
        const mx  = (sx - cam.tx) / cam.scale;
        const my  = (sy - cam.ty) / cam.scale;

        if (Controls._pendingEvent) {
            Controls._firePendingEvent(mx, my);
            return;
        }

        let best = null, bestD = 18 * 18;
        for (const entity of this.sim.entities) {
            if (!entity.alive || entity instanceof Carcass) continue;
            const dx = entity.x - mx, dy = entity.y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD) { bestD = d2; best = entity; }
        }

        this.selectedEntity = best;

        if (!best) {
            const biome = this.sim.world.getBiomeAt(mx, my);
            this.renderBiomePanel(biome, mx, my);
        } else {
            this.renderPanel();
        }

        if (best) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'entity'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-entity'));
        }
    },

    renderPanel() {
        const panel = document.getElementById('entity-panel');
        const e     = this.selectedEntity;

        if (!e || !e.alive) {
            panel.innerHTML = `<div class="no-selection"><div class="no-sel-icon">◎</div><div>click an entity<br>to inspect</div></div>`;
            return;
        }

        const s     = e.getSummary();
        const type  = s.subtype || s.className.toLowerCase();
        const color = this._typeColor(type);

        // All 12 genes (9 original + 3 new)
        const geneKeys = [
            'speed','visionRange','strength','size',
            'reproductionRate','camouflage','metabolism',
            'coldResistance','heatResistance',
            'toxinResistance','nocturnalAdaptation','aquaticAdaptation',
        ].filter(k => s.genes[k] !== undefined);

        const traits      = Genetics.describe(s.genes);
        const energyPct   = Math.min(100, Math.floor(s.energy / s.maxEnergy * 100));
        const agePct      = Math.min(100, Math.floor(s.age / (e.maxAge || 800) * 100));
        const repCD       = s.reproductionCooldown !== undefined
            ? `<div class="stat-row"><span class="key">REPRO CD</span><span class="val">${s.reproductionCooldown}</span></div>` : '';
        const killRow     = s.killCount !== undefined
            ? `<div class="stat-row"><span class="key">KILLS</span><span class="val">${s.killCount}</span></div>` : '';
        const stateRow    = s.state
            ? `<div class="stat-row"><span class="key">STATE</span><span class="val">${s.state.toUpperCase()}</span></div>` : '';
        const lineageRow  = s.lineageId !== undefined
            ? `<div class="stat-row"><span class="key">LINEAGE</span><span class="val" style="color:hsl(${s.lineageId},60%,65%)">#${s.lineageId}</span></div>` : '';

        panel.innerHTML = `
            <div class="entity-header">
                <div class="entity-dot" style="background:${color}"></div>
                <span class="entity-type" style="color:${color}">${this._typeLabel(type)}</span>
                <span class="entity-id">#${s.id}</span>
            </div>

            <div class="bar-row">
                <div class="bar-label"><span>ENERGY</span><span>${energyPct}%</span></div>
                <div class="bar-track"><div class="bar-fill" style="width:${energyPct}%;background:${this._energyColor(energyPct)}"></div></div>
            </div>
            <div class="bar-row">
                <div class="bar-label"><span>AGE</span><span>${agePct}%</span></div>
                <div class="bar-track"><div class="bar-fill" style="width:${agePct}%;background:#6060c0"></div></div>
            </div>

            <div class="stat-row"><span class="key">AGE (TICKS)</span><span class="val">${s.age}</span></div>
            <div class="stat-row"><span class="key">GENERATION</span><span class="val" style="color:var(--accent)">${s.generation}</span></div>
            <div class="stat-row"><span class="key">CHILDREN</span><span class="val">${s.childCount}</span></div>
            <div class="stat-row"><span class="key">FITNESS</span><span class="val" style="color:var(--accent2)">${s.fitness}</span></div>
            ${stateRow}${killRow}${repCD}${lineageRow}

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
        const defs = {
            speed:               { min: 0.02, max: 0.20 },
            visionRange:         { min: 20,   max: 200 },
            strength:            { min: 0.3,  max: 3   },
            size:                { min: 0.5,  max: 3   },
            reproductionRate:    { min: 0.1,  max: 1   },
            camouflage:          { min: 0,    max: 1   },
            metabolism:          { min: 0.4,  max: 2   },
            coldResistance:      { min: 0.1,  max: 1   },
            heatResistance:      { min: 0.1,  max: 1   },
            toxinResistance:     { min: 0.0,  max: 1   },
            nocturnalAdaptation: { min: 0.0,  max: 1   },
            aquaticAdaptation:   { min: 0.0,  max: 1   },
        };
        const def     = defs[key] || { min: 0, max: 1 };
        const pct     = Math.max(0, Math.min(100, ((val - def.min) / (def.max - def.min)) * 100));
        const display = val > 10 ? Math.round(val) : val.toFixed(2);
        const label   = key.replace(/([A-Z])/g, ' $1').toLowerCase();
        // Colour new genes differently
        const isNew   = ['toxinResistance','nocturnalAdaptation','aquaticAdaptation'].includes(key);
        const barColor = isNew ? 'var(--accent2)' : 'var(--accent)';

        return `
            <div class="gene-row">
                <span class="gene-name">${label}</span>
                <div class="gene-bar-track">
                    <div class="gene-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                </div>
                <span class="gene-val">${display}</span>
            </div>`;
    },

    _typeColor(type) {
        return {
            plant:     '#38c968',
            herbivore: '#4a9eff',
            carnivore: '#ff4a3a',
            insect:    '#ffd040',
            scavenger: '#c878ff',
            bird:      '#40d4aa',
            carcass:   '#7a5030',
        }[type] || '#aaa';
    },

    _typeLabel(type) {
        return {
            plant:     'PLANT',
            herbivore: 'HERBIVORE',
            carnivore: 'CARNIVORE',
            insect:    'INSECT',
            scavenger: 'SCAVENGER',
            bird:      'BIRD',
            carcass:   'CARCASS',
        }[type] || type.toUpperCase();
    },

    _energyColor(pct) {
        if (pct > 60) return '#38c968';
        if (pct > 30) return '#ffd040';
        return '#ff4a3a';
    },

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
            wetland:   { label: 'WETLAND',    icon: '≈', color: '#2a9a70' },
            savanna:   { label: 'SAVANNA',    icon: '◇', color: '#c8a830' },
        };
        const meta     = BIOME_META[biome.type] || { label: biome.type.toUpperCase(), icon: '?', color: '#aaa' };
        const resPct   = Math.round((biome.resources || 0) * 100);
        const passStr  = biome.passable
            ? '<span style="color:#38c968">PASSABLE</span>'
            : '<span style="color:#ff4a3a">IMPASSABLE</span>';

        const r2 = 40 * 40;
        let plants = 0, herbs = 0, carns = 0, insects = 0, scavs = 0, birds = 0, carcasses = 0;
        for (const e of this.sim.entities) {
            if (!e.alive) continue;
            const dx = e.x - mx, dy = e.y - my;
            if (dx*dx + dy*dy > r2) continue;
            if      (e instanceof Carcass)   carcasses++;
            else if (e instanceof Plant)     plants++;
            else if (e instanceof Insect)    insects++;
            else if (e instanceof Scavenger) scavs++;
            else if (e instanceof Bird)      birds++;
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
                <div class="bar-track"><div class="bar-fill" style="width:${resPct}%;background:#38c968"></div></div>
            </div>

            <div class="stat-row"><span class="key">STATUS</span><span class="val">${passStr}</span></div>
            <div class="stat-row"><span class="key">ENERGY COST</span><span class="val">${(biome.energyCost||1).toFixed(1)}×</span></div>

            <div class="genes-section" style="margin-top:10px">
                <div class="section-title">NEARBY (r=40)</div>
                <div class="stat-row"><span class="key" style="color:#38c968">PLANTS</span><span class="val">${plants}</span></div>
                <div class="stat-row"><span class="key" style="color:#4a9eff">HERBIVORES</span><span class="val">${herbs}</span></div>
                <div class="stat-row"><span class="key" style="color:#ff4a3a">CARNIVORES</span><span class="val">${carns}</span></div>
                <div class="stat-row"><span class="key" style="color:#ffd040">INSECTS</span><span class="val">${insects}</span></div>
                <div class="stat-row"><span class="key" style="color:#c878ff">SCAVENGERS</span><span class="val">${scavs}</span></div>
                <div class="stat-row"><span class="key" style="color:#40d4aa">BIRDS</span><span class="val">${birds}</span></div>
                <div class="stat-row"><span class="key" style="color:#7a5030">CARCASSES</span><span class="val">${carcasses}</span></div>
            </div>`;
    },

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
