// ─── Carcass ──────────────────────────────────────────────────────────────────
// Left behind when an Animal dies. Scavengers can consume it.
// Decays over time — energy fades, then entity is removed.

class Carcass extends Living {
    constructor(x, y, energyValue) {
        super(x, y, {});
        this.energy    = Math.max(12, energyValue);
        this.maxEnergy = this.energy;
        this.maxAge    = 180 + Math.random() * 120; // ticks until rot
        this._decayRate = this.energy / this.maxAge; // energy drains linearly
    }

    update(dt, world, entities, grid) {
        this.age    += dt;
        this.energy -= dt * this._decayRate;

        if (this.energy <= 0 || this.age > this.maxAge) {
            this.alive = false;
        }
    }

    render(ctx, isSelected) {
        const ratio = Math.max(0, this.energy / this.maxEnergy);
        const alpha = 0.25 + ratio * 0.55;
        const r     = 1.5 + ratio * 1.5;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = alpha;

        // Small brown X
        ctx.strokeStyle = `rgb(${160 + ratio * 30 | 0}, ${90 + ratio * 30 | 0}, 40)`;
        ctx.lineWidth = 1.2;
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
            ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
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
