// ─── World ───────────────────────────────────────────────────────────────────
// Generates and renders the biome map. Handles terrain queries and modifications.

const BIOMES = {
    water:     { resources: 0.00, energyCost: 0.0, color: [15,  35,  60],  passable: false },
    snow:      { resources: 0.25, energyCost: 1.4, color: [190, 215, 230], passable: true  },
    desert:    { resources: 0.20, energyCost: 1.3, color: [120, 95,  35],  passable: true  },
    grassland: { resources: 0.70, energyCost: 1.0, color: [40,  80,  25],  passable: true  },
    forest:    { resources: 1.00, energyCost: 0.9, color: [20,  55,  18],  passable: true  },
    volcanic:  { resources: 0.05, energyCost: 2.0, color: [60,  20,  10],  passable: true  },
    scorched:  { resources: 0.05, energyCost: 1.8, color: [50,  35,  10],  passable: true  },
    frozen:    { resources: 0.10, energyCost: 1.8, color: [160, 200, 220], passable: true  },
    drought:   { resources: 0.08, energyCost: 1.5, color: [130, 100, 40],  passable: true  },
};

class World {
    constructor(canvas, seed = 42) {
        this.canvas   = canvas;
        this.ctx      = canvas.getContext('2d');
        this.width    = canvas.width;
        this.height   = canvas.height;
        this.seed     = seed;
        this.tileSize = 7;
        this.cols     = Math.ceil(this.width  / this.tileSize);
        this.rows     = Math.ceil(this.height / this.tileSize);

        // Flat array of biome type strings
        this.tiles    = new Array(this.cols * this.rows);

        // Cached background image
        this._bgCanvas = document.createElement('canvas');
        this._bgCanvas.width  = this.width;
        this._bgCanvas.height = this.height;
        this._bgCtx    = this._bgCanvas.getContext('2d');
        this._bgDirty  = true;

        this._noiseSeed = seed;
        this.generate();
    }

    // ── Noise ─────────────────────────────────────────────────────────────
    _rand(x, y) {
        const n = Math.sin(x * 127.1 + y * 311.7 + this._noiseSeed * 17.3) * 43758.5453;
        return n - Math.floor(n);
    }

    _noise(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi,       yf = y - yi;
        const a = this._rand(xi,   yi);
        const b = this._rand(xi+1, yi);
        const c = this._rand(xi,   yi+1);
        const d = this._rand(xi+1, yi+1);
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v;
    }

    _octaveNoise(x, y, octaves = 4) {
        let val = 0, amp = 1, freq = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            val += this._noise(x * freq, y * freq) * amp;
            max  += amp;
            amp  *= 0.5;
            freq *= 2;
        }
        return val / max;
    }

    // ── Generation ────────────────────────────────────────────────────────
    generate() {
        for (let ty = 0; ty < this.rows; ty++) {
            for (let tx = 0; tx < this.cols; tx++) {
                const nx = tx / this.cols;
                const ny = ty / this.rows;
                this.tiles[ty * this.cols + tx] = this._determineBiome(nx, ny);
            }
        }
        this._bgDirty = true;
    }

    _determineBiome(nx, ny) {
        const elev   = this._octaveNoise(nx * 3.5, ny * 3.5, 5);
        const moist  = this._octaveNoise(nx * 2.0 + 10, ny * 2.0 + 10, 4);
        const temp   = this._octaveNoise(nx * 1.5 + 20, ny * 1.5 + 20, 3);

        // Water — low elevation areas
        if (elev < 0.30) return 'water';

        // Polar zones — top strip
        if (ny < 0.12 || (ny < 0.20 && temp < 0.35)) return 'snow';

        // Volcanic — seeded hotspots in lower half
        const vHeat = this._noise(nx * 5 + 50, ny * 5 + 50);
        if (ny > 0.72 && nx > 0.55 && vHeat > 0.72) return 'volcanic';

        // Desert — hot & dry
        if (moist < 0.30 && temp > 0.60) return 'desert';

        // Forest — moist elevated
        if (moist > 0.58 && elev > 0.50) return 'forest';

        return 'grassland';
    }

    // ── Accessors ─────────────────────────────────────────────────────────
    getBiomeAt(px, py) {
        const tx = Math.floor(px / this.tileSize);
        const ty = Math.floor(py / this.tileSize);
        if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return null;
        const type = this.tiles[ty * this.cols + tx];
        return { type, ...BIOMES[type] };
    }

    isPassable(px, py) {
        const b = this.getBiomeAt(px, py);
        return b && b.passable;
    }

    /**
     * Apply a disaster to a circular area, replacing tiles with newType.
     * radius is in world pixels.
     */
    applyDisasterArea(cx, cy, radius, newType) {
        const tx0 = Math.max(0, Math.floor((cx - radius) / this.tileSize));
        const tx1 = Math.min(this.cols - 1, Math.ceil((cx + radius) / this.tileSize));
        const ty0 = Math.max(0, Math.floor((cy - radius) / this.tileSize));
        const ty1 = Math.min(this.rows - 1, Math.ceil((cy + radius) / this.tileSize));
        const r2  = (radius / this.tileSize) ** 2;

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                const d2 = (tx - cx / this.tileSize) ** 2 + (ty - cy / this.tileSize) ** 2;
                if (d2 <= r2) {
                    this.tiles[ty * this.cols + tx] = newType;
                }
            }
        }
        this._bgDirty = true;
    }

    /**
     * Gradually shift all passable tiles toward newType (for ice age / drought).
     * fraction ∈ [0,1] — portion of tiles to convert this call.
     */
    spreadDisaster(newType, fraction = 0.005, onlyBiomes = null) {
        const total = this.cols * this.rows;
        const toChange = Math.floor(total * fraction);
        for (let i = 0; i < toChange; i++) {
            const idx = Math.floor(Math.random() * total);
            const cur = this.tiles[idx];
            if (BIOMES[cur]?.passable) {
                if (!onlyBiomes || onlyBiomes.includes(cur)) {
                    this.tiles[idx] = newType;
                }
            }
        }
        this._bgDirty = true;
    }

    // ── Rendering ─────────────────────────────────────────────────────────
    _rebuildBackground() {
        const ctx = this._bgCtx;
        const ts  = this.tileSize;

        for (let ty = 0; ty < this.rows; ty++) {
            for (let tx = 0; tx < this.cols; tx++) {
                const biome = BIOMES[this.tiles[ty * this.cols + tx]];
                const [r, g, b] = biome.color;
                // Slight per-tile brightness variation for texture
                const v = (this._rand(tx, ty) - 0.5) * 12;
                ctx.fillStyle = `rgb(${r+v|0},${g+v|0},${b+v|0})`;
                ctx.fillRect(tx * ts, ty * ts, ts, ts);
            }
        }
        this._bgDirty = false;
    }

    /** Draw background to main canvas. Call once per frame before entities. */
    render() {
        if (this._bgDirty) this._rebuildBackground();
        this.ctx.drawImage(this._bgCanvas, 0, 0);
        // Subtle seasonal colour tint over the terrain
        if (window.SEASON && window.SEASON.tint) {
            this.ctx.fillStyle = window.SEASON.tint;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
    }
}
