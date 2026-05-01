// ─── Carcass ──────────────────────────────────────────────────────────────────
// Left behind when an Animal dies. Scavengers can consume it.
// Decays over time — energy fades, then entity is removed.

class Carcass extends Living {
    constructor(x, y, energyValue) {
        super(x, y, {});
        this.energy    = Math.max(12, energyValue);
        this.maxEnergy = this.energy;
        this.maxAge    = 180 + Math.random() * 120;
        this._decayRate = this.energy / this.maxAge;
        // Scavengers can only feed within this window (ticks after death)
        this.freshWindow = 140 + Math.random() * 60; // ~140-200 ticks fresh
    }

    update(dt, world, entities, grid) {
        this.age    += dt;
        this.energy -= dt * this._decayRate;

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
        }
    }

    render(ctx, isSelected) {
        const ratio   = Math.max(0, this.energy / this.maxEnergy);
        const fresh   = this.age < this.freshWindow;
        const freshR  = Math.max(0, 1 - this.age / this.freshWindow); // 1→0 as it goes stale
        const alpha   = 0.30 + ratio * 0.55;
        const r       = 2.2 + ratio * 2.0;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = alpha;

        // Outer glow ring when fresh (edible)
        if (fresh && freshR > 0.1) {
            ctx.strokeStyle = `rgba(200, 160, 80, ${freshR * 0.45})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Brown X cross
        const col = fresh
            ? `rgb(${180 + freshR * 40 | 0}, ${100 + freshR * 40 | 0}, 45)`
            : `rgb(90, 65, 35)`;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-r, -r); ctx.lineTo(r, r);
        ctx.moveTo( r, -r); ctx.lineTo(-r, r);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getSummary() {
        return {
            ...super.getSummary(),
            subtype: 'carcass',
        };
    }
}
