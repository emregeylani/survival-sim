// ─── Analytics ───────────────────────────────────────────────────────────────

const Analytics = {
    chart:         null,
    evolutionChart: null,
    history:       [],       // { tick, plants, herbivores, carnivores, insects }
    geneHistory:   [],       // { tick, avgSpeed, avgStrength, maxGen }
    hof:        {
        longestLived:   null,
        mostChildren:   null,
        highestFitness: null,
        topGen:         0,
    },
    disasters:  [],
    maxHistory: 120,      // data points kept

    init() {
        const ctx = document.getElementById('population-chart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels:   [],
                datasets: [
                    { label: 'Plants',     data: [], borderColor: '#38c968', backgroundColor: 'rgba(56,201,104,0.07)',  tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                    { label: 'Herbivores', data: [], borderColor: '#4a9eff', backgroundColor: 'rgba(74,158,255,0.07)',  tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                    { label: 'Carnivores', data: [], borderColor: '#ff4a3a', backgroundColor: 'rgba(255,74,58,0.07)',   tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                    { label: 'Insects',    data: [], borderColor: '#ffd040', backgroundColor: 'rgba(255,208,64,0.07)',  tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#4a7a8a',
                            font:  { size: 9, family: 'Courier New' },
                            boxWidth: 10,
                            padding: 6,
                        },
                    },
                },
                scales: {
                    x: {
                        ticks:  { color: '#2a5060', font: { size: 8 }, maxTicksLimit: 6 },
                        grid:   { color: '#0f2030' },
                        border: { color: '#1a3040' },
                    },
                    y: {
                        ticks:  { color: '#2a5060', font: { size: 8 }, maxTicksLimit: 5 },
                        grid:   { color: '#0f2030' },
                        border: { color: '#1a3040' },
                        min: 0,
                    },
                },
            },
        });
        this._initEvolutionChart();
    },

    _initEvolutionChart() {
        const ctx2 = document.getElementById('evolution-chart').getContext('2d');
        this.evolutionChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels:   [],
                datasets: [
                    { label: 'Avg Speed',    data: [], borderColor: '#00d4aa', backgroundColor: 'rgba(0,212,170,0.07)', tension: 0.4, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y' },
                    { label: 'Avg Strength', data: [], borderColor: '#ff9040', backgroundColor: 'rgba(255,144,64,0.07)', tension: 0.4, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y' },
                    { label: 'Max Gen',      data: [], borderColor: '#c878ff', backgroundColor: 'rgba(200,120,255,0.07)', tension: 0.4, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y2' },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        labels: { color: '#4a7a8a', font: { size: 9, family: 'Courier New' }, boxWidth: 10, padding: 6 },
                    },
                },
                scales: {
                    x:  { ticks: { color: '#2a5060', font: { size: 8 }, maxTicksLimit: 5 }, grid: { color: '#0f2030' }, border: { color: '#1a3040' } },
                    y:  { ticks: { color: '#2a5060', font: { size: 8 }, maxTicksLimit: 4 }, grid: { color: '#0f2030' }, border: { color: '#1a3040' }, min: 0, position: 'left', title: { display: true, text: 'gene avg', color: '#2a5060', font: { size: 8 } } },
                    y2: { ticks: { color: '#604080', font: { size: 8 }, maxTicksLimit: 4 }, grid: { display: false }, border: { color: '#1a3040' }, min: 0, position: 'right', title: { display: true, text: 'generation', color: '#604080', font: { size: 8 } } },
                },
            },
        });
    },

    /** Called by loop with gene averages each analytics tick. */
    updateGenes(tick, data) {
        this.geneHistory.push({ tick, ...data });
        if (this.geneHistory.length > this.maxHistory) this.geneHistory.shift();

        if (!this.evolutionChart) return;
        this.evolutionChart.data.labels = this.geneHistory.map(h => h.tick);
        this.evolutionChart.data.datasets[0].data = this.geneHistory.map(h => +(h.avgSpeed    || 0).toFixed(3));
        this.evolutionChart.data.datasets[1].data = this.geneHistory.map(h => +(h.avgStrength || 0).toFixed(3));
        this.evolutionChart.data.datasets[2].data = this.geneHistory.map(h => h.maxGen || 0);
        this.evolutionChart.update('none');
    },

    /**
     * Called by the simulation loop each N ticks with current population counts.
     */
    update(tick, counts, entities) {
        // Push to history
        this.history.push({ tick, ...counts });
        if (this.history.length > this.maxHistory) this.history.shift();

        // Update chart
        const labels = this.history.map(h => h.tick);
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = this.history.map(h => h.plants);
        this.chart.data.datasets[1].data = this.history.map(h => h.herbivores);
        this.chart.data.datasets[2].data = this.history.map(h => h.carnivores);
        this.chart.data.datasets[3].data = this.history.map(h => h.insects);
        this.chart.update('none');

        // Update stats bar
        document.getElementById('stat-tick').textContent       = tick;
        document.getElementById('stat-plants').textContent     = counts.plants;
        document.getElementById('stat-herbivores').textContent = counts.herbivores;
        document.getElementById('stat-carnivores').textContent = counts.carnivores;
        document.getElementById('stat-insects').textContent    = counts.insects;

        // Hall of fame
        this._updateHOF(entities, tick);
        document.getElementById('stat-maxgen').textContent = this.hof.topGen;
    },

    _updateHOF(entities, tick) {
        for (const e of entities) {
            if (!e.alive) continue;

            if (!this.hof.longestLived || e.age > this.hof.longestLived.age) {
                this.hof.longestLived = { age: Math.floor(e.age), type: e.constructor.name, id: e.id };
            }
            if (!this.hof.mostChildren || e.childCount > this.hof.mostChildren.count) {
                this.hof.mostChildren = { count: e.childCount, type: e.constructor.name, id: e.id };
            }
            const fit = Genetics.fitness(e);
            if (!this.hof.highestFitness || fit > this.hof.highestFitness.score) {
                this.hof.highestFitness = { score: fit, type: e.constructor.name, id: e.id };
            }
            if (e.generation > this.hof.topGen) {
                this.hof.topGen = e.generation;
            }
        }

        const hofEl = document.getElementById('hof-content');
        if (hofEl) {
            const row = (key, val) => `
                <div class="hof-row">
                    <span class="hof-key">${key}</span>
                    <span class="hof-val">${val}</span>
                </div>`;
            hofEl.innerHTML = (this.hof.longestLived
                ? row('Oldest Alive',    `${this.hof.longestLived.type} #${this.hof.longestLived.id} (age ${this.hof.longestLived.age})`)
                : '') +
                (this.hof.mostChildren
                ? row('Most Children',   `${this.hof.mostChildren.type} #${this.hof.mostChildren.id} (${this.hof.mostChildren.count})`)
                : '') +
                (this.hof.highestFitness
                ? row('Best Fitness',    `${this.hof.highestFitness.type} #${this.hof.highestFitness.id} (${this.hof.highestFitness.score})`)
                : '') +
                row('Peak Generation',  this.hof.topGen);
        }
    },

    /**
     * Log an extinction event to the UI panel.
     */
    logExtinction(label, tick) {
        const extEl = document.getElementById('ext-content');
        if (!extEl) return;
        const row = document.createElement('div');
        row.className   = 'ext-row';
        row.textContent = `T${tick} — ${label} EXTINCT`;
        extEl.prepend(row);
        document.getElementById('stat-extinct').textContent =
            parseInt(document.getElementById('stat-extinct').textContent || 0) + 1;
    },

    logDisaster(label) {
        this.disasters.push(label);
    },

    reset() {
        this.history     = [];
        this.geneHistory = [];
        this.hof      = { longestLived: null, mostChildren: null, highestFitness: null, topGen: 0 };
        this.disasters = [];
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets.forEach(d => d.data = []);
            this.chart.update('none');
        }
        if (this.evolutionChart) {
            this.evolutionChart.data.labels = [];
            this.evolutionChart.data.datasets.forEach(d => d.data = []);
            this.evolutionChart.update('none');
        }
        document.getElementById('ext-content').innerHTML = '<span class="dim">no extinctions yet</span>';
        document.getElementById('stat-extinct').textContent = '0';
        document.getElementById('hof-content').innerHTML = '';
    },
};
