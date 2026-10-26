// 3v3 simultaneous auto battle: simulation + canvas rendering.
import { CHAR } from '../data';
import type { Stats } from './progression';
import { atlasNow, drawFrame, loadAtlas } from './sprites';

export interface UnitSpec { id: string; level: number; stats: Stats }
type Side = 'A' | 'B';

const W = 360, H = 640, HUD = 96;
const SCALE = 1.2;
const RX = 40, RY = 46; // personal space ellipse at the feet
const YMIN = 400, YMAX = 600;
const SLOTS: Record<Side, [number, number][]> = {
  A: [[118, 505], [64, 445], [64, 575]],
  B: [[242, 505], [296, 445], [296, 575]],
};

type Step = [frame: string, dur: number, ev?: { hit?: number; kb?: number; heavy?: boolean; proj?: string; mult?: number; big?: boolean; cine?: boolean; cineEnd?: boolean }];
const ACT: Record<string, { range: number; steps: Step[] }> = {
  jab: { range: 48, steps: [['st2', 0.07], ['p2', 0.08], ['p3', 0.1, { hit: 0.55, kb: 4 }], ['p4', 0.13, { hit: 0.75, kb: 8 }], ['st0', 0.14]] },
  kick: { range: 56, steps: [['st1', 0.09], ['kick', 0.17, { hit: 1.05, kb: 14, heavy: true }], ['k2', 0.12], ['st0', 0.14]] },
  skill: { range: 1e9, steps: [['sk0', 0.2], ['sk1', 0.08, { proj: 'sproj', mult: 1.5 }], ['sk1', 0.26], ['st0', 0.14]] },
  ult: { range: 1e9, steps: [['u0', 0.55, { cine: true }], ['ring', 0.7], ['u1', 0.45, { cineEnd: true }], ['u2', 0.35, { proj: 'ballbig', mult: 3, big: true }], ['st0', 0.3]] },
};

interface Unit {
  side: Side; i: number; id: string; level: number; name: string; color: string; ultName: string;
  maxHp: number; hp: number; atk: number; def: number; spd: number; crit: number;
  gauge: number; x: number; y: number; hx: number; dir: number;
  st: 'enter' | 'idle' | 'approach' | 'act' | 'ko'; f: string; at: number; rt: number;
  cd: number; skillCd: number; plan: string; act: string | null; step: number; stepT: number;
  hurtT: number; whiteT: number; koT: number; kdir: number; gone: boolean; target: Unit | null;
}
interface Proj { o: Unit; id: string; k: string; x: number; y: number; tgt: Unit; dir: number; v: number; mult: number; big: boolean; dead?: boolean }

export interface BattleOptions {
  title: string;
  onEnd: (winner: Side) => void;
}

export class Battle {
  private ctx: CanvasRenderingContext2D;
  private units: Unit[] = [];
  private projs: Proj[] = [];
  private fx: { x: number; y: number; t: number; c: string; r: number }[] = [];
  private texts: { x: number; y: number; v: string; c: string; s: number; t: number }[] = [];
  private shake = 0; private flash = 0;
  private cine: { u: Unit; t: number } | null = null;
  private over: Side | null = null; private overT = 0; private ended = false;
  private last = 0; private raf = 0; private T = 0;
  speed = 2;
  paused = false;
  private stars = Array.from({ length: 36 }, () => [Math.random() * W, 100 + Math.random() * 150, Math.random()]);
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement, a: UnitSpec[], b: UnitSpec[], private opts: BattleOptions) {
    this.ctx = canvas.getContext('2d')!;
    a.forEach((s, i) => this.units.push(this.mk('A', i, s)));
    b.forEach((s, i) => this.units.push(this.mk('B', i, s)));
  }

  async start() {
    await Promise.all(this.units.map((u) => loadAtlas(u.id)));
    this.fit();
    addEventListener('resize', this.fit);
    this.last = performance.now();
    const loop = (now: number) => {
      const raw = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        const dt = raw * (this.ultOn() ? 1 : this.speed); // ultimates always play at 1x
        this.T += dt;
        this.update(dt, raw);
      }
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); removeEventListener('resize', this.fit); }

  /** Resolve the rest of the fight instantly. */
  skip() {
    let guard = 0;
    while (!this.over && guard++ < 20000) { this.cine = null; this.update(1 / 30, 1 / 30); }
    this.overT = 99; this.update(0, 0);
  }

  private fit = () => {
    const r = this.canvas.getBoundingClientRect();
    const d = Math.min(3, devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * d));
    this.canvas.height = Math.max(1, Math.round(r.width * d * (H / W)));
  };

  private mk(side: Side, i: number, s: UnitSpec): Unit {
    const c = CHAR[s.id];
    const [hx, y] = SLOTS[side][i];
    return {
      side, i, id: s.id, level: s.level, name: c.name, color: c.color, ultName: c.ult,
      maxHp: s.stats.hp, hp: s.stats.hp, atk: s.stats.atk, def: s.stats.def, spd: s.stats.spd, crit: s.stats.crit,
      gauge: Math.random() * 30, x: side === 'A' ? hx - 160 : hx + 160, y, hx, dir: side === 'A' ? 1 : -1,
      st: 'enter', f: 'st1', at: Math.random() * 3, rt: Math.random() * 6, cd: 0.5 + Math.random() * 0.6, skillCd: 1.5 + Math.random() * 2.5,
      plan: 'jab', act: null, step: 0, stepT: 0, hurtT: 0, whiteT: 0, koT: 0, kdir: 1, gone: false, target: null,
    };
  }

  private active = (u: Unit) => !u.gone && u.st !== 'ko';
  private enemiesOf = (u: Unit) => this.units.filter((e) => e.side !== u.side && this.active(e));
  private ultOn = () => this.units.some((u) => u.act === 'ult' && !u.gone) || this.projs.some((p) => p.big);

  private pickTarget(u: Unit): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const e of this.enemiesOf(u)) {
      if (e.st === 'enter') continue;
      const d = Math.abs(e.x - u.x) + Math.abs(e.y - u.y) * 3;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private damage(att: Unit, def: Unit, mult: number, o: { kb?: number; heavy?: boolean; big?: boolean } = {}) {
    if (!this.active(def)) return;
    const crit = Math.random() < att.crit;
    const d = Math.max(1, Math.round((att.atk * mult * (0.9 + Math.random() * 0.2) - def.def * 0.5) * (crit ? 1.6 : 1)));
    def.hp = Math.max(0, def.hp - d);
    def.whiteT = 0.12;
    att.gauge = Math.min(100, att.gauge + 8 * mult);
    def.gauge = Math.min(100, def.gauge + 5);
    const dir = Math.sign(def.x - att.x) || att.dir;
    if (o.kb) def.x = clamp(def.x + dir * o.kb, 14, W - 14);
    if (o.heavy || o.big) def.hurtT = o.big ? 0.55 : 0.3;
    else if (def.st !== 'act') def.hurtT = Math.max(def.hurtT, 0.12);
    this.shake = Math.max(this.shake, o.big ? 9 : o.heavy ? 3 : 1.5);
    if (o.big) this.flash = 0.2;
    this.texts.push({ x: def.x, y: def.y - 92, v: crit ? `${d}!` : String(d), c: crit ? '#ffd84d' : '#fff', s: o.big ? 24 : crit ? 19 : 15, t: 0 });
    this.fx.push({ x: def.x - dir * 5, y: def.y - 40, t: 0, c: att.color, r: o.big ? 36 : o.heavy ? 18 : 11 });
    if (def.hp <= 0) {
      def.st = 'ko'; def.koT = 0; def.act = null; def.kdir = dir;
      if (this.cine?.u === def) this.cine = null;
    }
  }

  private choose(u: Unit) {
    if (u.gauge >= 100) return 'ult';
    if (u.skillCd <= 0 && Math.random() < 0.55) { u.skillCd = 3.5 + Math.random() * 2; return 'skill'; }
    return Math.random() < 0.6 ? 'jab' : 'kick';
  }

  private startAct(u: Unit, name: string) {
    u.act = name; u.step = -1; u.st = 'act';
    if (name === 'ult') u.gauge = 0;
    this.nextStep(u);
  }

  private nextStep(u: Unit) {
    u.step++;
    const s = ACT[u.act!].steps[u.step];
    if (!s) {
      u.act = null; u.st = 'idle'; u.cd = (1.15 / u.spd) * (0.8 + Math.random() * 0.4);
      if (this.cine?.u === u) this.cine = null;
      return;
    }
    u.f = s[0]; u.stepT = s[1];
    const e = s[2];
    if (!e) return;
    if (e.cine) this.cine = { u, t: 0 };
    if (e.cineEnd && this.cine?.u === u) this.cine = null;
    const t = u.target && this.active(u.target) ? u.target : this.pickTarget(u);
    if (e.hit && t && Math.abs(t.x - u.x) <= ACT[u.act!].range + 14 && Math.abs(t.y - u.y) <= 30) this.damage(u, t, e.hit, e);
    if (e.proj && t) this.projs.push({ o: u, id: u.id, k: e.proj, x: u.x + u.dir * 22, y: u.y, tgt: t, dir: u.dir, v: e.big ? 260 : 320, mult: e.mult ?? 1, big: !!e.big });
  }

  private update(dt: number, raw: number) {
    if (this.over) {
      this.overT += raw;
      if (this.overT > 1.8 && !this.ended) { this.ended = true; this.opts.onEnd(this.over); }
      return;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt);
    if (this.cine) this.cine.t += dt;
    for (const u of this.units) {
      if (u.gone) continue;
      if (this.cine && this.cine.u !== u && u.st !== 'ko') continue;
      u.at += dt; u.rt += raw; u.whiteT = Math.max(0, u.whiteT - dt);
      if (u.st === 'ko') {
        u.koT += dt;
        if (u.koT < 0.4) u.x = clamp(u.x + u.kdir * dt * 110, -40, W + 40);
        if (u.koT > 1.5) {
          u.gone = true;
          if (!this.units.some((m) => m.side === u.side && !m.gone)) { this.over = u.side === 'A' ? 'B' : 'A'; this.overT = 0; }
        }
        continue;
      }
      if (u.hurtT > 0) { u.hurtT -= dt; if (u.st !== 'act') { if (u.hurtT > 0.15) u.f = 'hurt'; continue; } }
      if (u.st === 'enter') {
        u.x += Math.sign(u.hx - u.x) * 150 * dt; u.f = 'st1';
        if (Math.abs(u.x - u.hx) < 4) { u.x = u.hx; u.st = 'idle'; }
        continue;
      }
      if (u.st === 'act') { u.stepT -= dt; if (u.stepT <= 0) this.nextStep(u); continue; }
      u.f = 'st0';
      if (this.cine) continue;
      const t = u.target && this.active(u.target) && u.target.st !== 'enter' ? u.target : (u.target = this.pickTarget(u));
      if (!t) continue;
      u.dir = Math.sign(t.x - u.x) || u.dir;
      u.skillCd -= dt; u.cd -= dt;
      if (u.st === 'idle' && u.cd <= 0) { u.plan = this.choose(u); u.st = 'approach'; }
      if (u.st === 'approach') {
        const r = ACT[u.plan].range, dx = Math.abs(t.x - u.x), dy = t.y - u.y;
        const needX = dx > r, needY = r < 1e8 && Math.abs(dy) > 14;
        if (needX || needY) {
          if (needX) u.x += u.dir * Math.min(150 * dt, dx - r);
          if (needY) u.y += Math.sign(dy) * Math.min(90 * dt, Math.abs(dy) - 10);
          u.f = 'st1';
        } else this.startAct(u, u.plan);
      }
    }
    this.separate();
    for (const p of this.projs) {
      if (this.cine && this.cine.u !== p.o) continue;
      if (!this.active(p.tgt)) { const n = this.pickTarget(p.o); if (n) p.tgt = n; else { p.dead = true; continue; } }
      const tt = p.tgt;
      p.dir = Math.sign(tt.x - p.x) || p.dir;
      p.x += p.dir * p.v * dt;
      p.y += (tt.y - p.y) * Math.min(1, dt * 6);
      if (Math.abs(tt.x - p.x) <= 10) {
        p.dead = true;
        if (p.big) {
          for (const e of this.enemiesOf(p.o)) if (Math.abs(e.x - tt.x) < 60 && Math.abs(e.y - tt.y) < 70) this.damage(p.o, e, e === tt ? p.mult : p.mult * 0.6, { kb: 24, big: true });
        } else this.damage(p.o, tt, p.mult, { kb: 10, heavy: true });
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
    for (const e of this.fx) e.t += dt;
    this.fx = this.fx.filter((e) => e.t < 0.35);
    for (const e of this.texts) e.t += dt;
    this.texts = this.texts.filter((e) => e.t < 0.9);
  }

  /** Minimum distance: overlapping personal-space ellipses are pushed apart. */
  private separate() {
    const live = this.units.filter(this.active);
    for (let it = 0; it < 4; it++)
      for (let i = 0; i < live.length; i++)
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          let dx = (b.x - a.x) / RX, dy = (b.y - a.y) / RY;
          let d = Math.hypot(dx, dy);
          if (d >= 1) continue;
          if (d < 1e-4) { dx = a.side === 'A' ? 1 : -1; dy = 0; d = 1e-4; }
          const push = (1 - d) / d;
          const fa = this.cine?.u === a ? 0 : this.cine?.u === b ? 1 : 0.5, fb = 1 - fa;
          a.x -= dx * push * RX * fa; a.y -= dy * push * RY * fa;
          b.x += dx * push * RX * fb; b.y += dy * push * RY * fb;
        }
    for (const u of live) { u.x = clamp(u.x, 14, W - 14); u.y = clamp(u.y, YMIN, YMAX); }
  }

  // ---------- drawing ----------
  private render() {
    const ctx = this.ctx, k = this.canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const sx = this.shake && !this.reduce ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake && !this.reduce ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    this.drawStage();
    if (this.cine) { ctx.fillStyle = `rgba(5,6,20,${Math.min(0.68, this.cine.t * 3)})`; ctx.fillRect(0, HUD, W, H); }
    const c = this.cine?.u;
    const list = this.units.filter((u) => !u.gone).sort((a, b) => (a === c ? 1e4 : 0) + a.y - ((b === c ? 1e4 : 0) + b.y));
    for (const u of list) this.drawUnit(u);
    for (const p of this.projs) {
      const a = atlasNow(p.id); if (!a) continue;
      const f = a.frames[p.k]; if (!f) continue;
      const s = SCALE * 0.75;
      drawFrame(ctx, a, p.k, p.x, p.y - 38 + f.h * s / 2, p.dir, s);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2.5;
    for (const e of this.fx) {
      const q = e.t / 0.35;
      ctx.strokeStyle = e.c; ctx.globalAlpha = 1 - q;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + q), 0, 7); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const an = i * 0.785 + e.r;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(an) * e.r * q, e.y + Math.sin(an) * e.r * q);
        ctx.lineTo(e.x + Math.cos(an) * e.r * (q + 0.6), e.y + Math.sin(an) * e.r * (q + 0.6));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const e of this.texts) {
      ctx.globalAlpha = 1 - e.t / 0.9;
      ctx.font = `${e.s}px "Black Han Sans", sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#000';
      const y = e.y - e.t * 30;
      ctx.strokeText(e.v, e.x, y); ctx.fillStyle = e.c; ctx.fillText(e.v, e.x, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (this.flash) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 1.6})`; ctx.fillRect(0, HUD, W, H); }
    this.drawHud();
    if (this.cine) {
      const u = this.cine.u;
      ctx.font = '26px "Black Han Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.fillStyle = u.color;
      ctx.strokeText(u.ultName, W / 2, 140); ctx.fillText(u.ultName, W / 2, 140);
      ctx.font = '12px "IBM Plex Sans KR", sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(`${u.name}의 궁극기`, W / 2, 160);
    }
    if (this.over) {
      ctx.fillStyle = '#000b'; ctx.fillRect(0, H / 2 - 34, W, 64);
      ctx.font = '32px "Black Han Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = this.over === 'A' ? '#ffd84d' : '#ff6b6b';
      ctx.fillText(this.over === 'A' ? '승리' : '패배', W / 2, H / 2 + 10);
    }
  }

  private drawStage() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, HUD, 0, 380);
    g.addColorStop(0, '#141a3d'); g.addColorStop(1, '#3b2b5c');
    ctx.fillStyle = g; ctx.fillRect(0, HUD, W, 290);
    for (const [x, y, s] of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * Math.abs(Math.sin(this.T * 0.8 + s * 9))})`;
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
    ctx.fillStyle = '#f3e9c6'; ctx.beginPath(); ctx.arc(258, 160, 13, 0, 7); ctx.fill();
    for (let i = 0; i < W; i += 24) {
      const h = 50 + ((i * 37) % 70);
      ctx.fillStyle = '#231a3f'; ctx.fillRect(i, 380 - h, 20, h);
      for (let y = 380 - h + 8; y < 372; y += 11) if (((i + y) * 13) % 7 < 2) { ctx.fillStyle = '#ffcf6b55'; ctx.fillRect(i + 5, y, 3, 4); }
    }
    const fl = ctx.createLinearGradient(0, 380, 0, H);
    fl.addColorStop(0, '#3a3156'); fl.addColorStop(1, '#151126');
    ctx.fillStyle = fl; ctx.fillRect(0, 380, W, H - 380);
    ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 30, 380); ctx.lineTo(W / 2 + i * 95, H); ctx.stroke(); }
    for (const y of [420, 470, 530, 600]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = '#ffffff30'; ctx.beginPath(); ctx.moveTo(0, 380.5); ctx.lineTo(W, 380.5); ctx.stroke();
  }

  private drawUnit(u: Unit) {
    const a = atlasNow(u.id); if (!a) return;
    const ctx = this.ctx;
    let rot = 0, alpha = 1;
    if (u.st === 'ko') { rot = u.kdir * Math.min(1, u.koT / 0.4) * 1.35; alpha = u.koT > 0.9 ? Math.max(0, 1 - (u.koT - 0.9) / 0.6) : 1; }
    const moving = u.st === 'approach' || u.st === 'enter';
    const bob = moving && !this.reduce ? -Math.abs(Math.sin(u.rt * 9)) * 2 : 0;
    const breath = u.st === 'idle' && !this.reduce ? 1 + Math.sin(u.rt * 2.4) * 0.018 : 1;
    ctx.fillStyle = '#00000066';
    ctx.beginPath(); ctx.ellipse(u.x, u.y + 2, 17 * SCALE, 4.5 * SCALE, 0, 0, 7); ctx.fill();
    drawFrame(ctx, a, u.st === 'ko' ? 'hurt' : u.f, u.x, u.y + bob, u.dir, SCALE, { alpha, white: u.whiteT > 0 ? 0.85 : 0, rot, sy: breath });
  }

  private drawHud() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0d1c'; ctx.fillRect(0, 0, W, HUD);
    ctx.strokeStyle = '#2c3360'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HUD - 0.5); ctx.lineTo(W, HUD - 0.5); ctx.stroke();
    for (const side of ['A', 'B'] as Side[]) {
      const L = side === 'A';
      this.units.filter((u) => u.side === side).forEach((m) => {
        const y = 8 + m.i * 29, px = L ? 8 : W - 32, bx = L ? 38 : W - 166;
        const dead = m.gone || m.st === 'ko';
        const a = atlasNow(m.id);
        ctx.globalAlpha = dead ? 0.3 : 1;
        if (a) { const f = a.frames.portrait; ctx.drawImage(a.img, f.x, f.y, f.w, f.h, px, y, 24, 24); }
        ctx.strokeStyle = m.color; ctx.strokeRect(px + 0.5, y + 0.5, 23, 23);
        ctx.font = '11px "Black Han Sans", sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = L ? 'left' : 'right';
        ctx.fillText(`${m.name} Lv.${m.level}`, L ? bx : bx + 128, y + 9);
        bar(ctx, bx, y + 13, 128, 6, m.hp / m.maxHp, m.hp / m.maxHp > 0.3 ? '#5be38a' : '#ff5d5d', !L);
        bar(ctx, bx, y + 21, 128, 2.5, m.gauge / 100, m.gauge >= 100 ? '#fff' : m.color, !L);
        ctx.globalAlpha = 1;
        if (dead) { ctx.strokeStyle = '#ff5d5d'; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + 24, y + 24); ctx.stroke(); }
      });
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = '18px "Black Han Sans", sans-serif'; ctx.fillText('VS', W / 2, 50);
    ctx.font = '11px "IBM Plex Sans KR", sans-serif'; ctx.fillStyle = '#9aa0c4'; ctx.fillText(this.opts.title, W / 2, 68);
  }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, c: string, rev: boolean) {
  ctx.fillStyle = '#000a'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1020'; ctx.fillRect(x, y, w, h);
  const vw = w * clamp(v, 0, 1);
  ctx.fillStyle = c;
  if (rev) ctx.fillRect(x + w - vw, y, vw, h); else ctx.fillRect(x, y, vw, h);
}
