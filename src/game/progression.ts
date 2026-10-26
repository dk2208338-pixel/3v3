// Numbers that drive growth: hero stats, level costs, gear, stages and rewards.
import { CHAR, CHARS, RARITY, ROLE_BASE } from '../data';

export const MAX_LEVEL = 100;

export type Slot = 'weapon' | 'armor' | 'acc';
export const SLOTS: Slot[] = ['weapon', 'armor', 'acc'];
export const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', acc: '장신구' };
export const GEAR_TIERS = [
  { label: '일반', color: '#b8bfd8' },
  { label: '고급', color: '#6fdc8c' },
  { label: '희귀', color: '#5aa9ff' },
  { label: '영웅', color: '#c77dff' },
  { label: '전설', color: '#ffc94d' },
];
export const GEAR_MAX_LEVEL = 20;

export interface Gear {
  id: number;
  slot: Slot;
  tier: number;
  level: number;
  owner?: string; // hero id wearing it
}

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
}

export function gearStats(g: Gear): Partial<Stats> {
  const k = 1 + 0.1 * g.level;
  if (g.slot === 'weapon') return { atk: Math.round((8 + g.tier * 8) * k) };
  if (g.slot === 'armor') return { hp: Math.round((60 + g.tier * 60) * k), def: Math.round((3 + g.tier * 3) * k) };
  return { crit: +((0.02 + g.tier * 0.02) * k).toFixed(3), spd: +((0.02 + g.tier * 0.015) * k).toFixed(3) };
}

export function gearName(g: Gear) {
  return `${GEAR_TIERS[g.tier].label} ${SLOT_LABEL[g.slot]}`;
}

export function enhanceCost(g: Gear) {
  return Math.floor(200 * (g.tier + 1) * Math.pow(g.level + 1, 1.4));
}

export function heroStats(id: string, level: number, gear: Gear[] = []): Stats {
  const c = CHAR[id];
  const b = ROLE_BASE[c.role];
  const m = RARITY[c.rarity].mult * (1 + 0.09 * (level - 1));
  const s: Stats = { hp: Math.round(b.hp * m), atk: Math.round(b.atk * m), def: Math.round(b.def * m), spd: b.spd + 0.002 * level, crit: 0.1 };
  for (const g of gear) {
    const gs = gearStats(g);
    s.hp += gs.hp ?? 0; s.atk += gs.atk ?? 0; s.def += gs.def ?? 0; s.spd += gs.spd ?? 0; s.crit += gs.crit ?? 0;
  }
  return s;
}

export function power(s: Stats) {
  return Math.round(s.hp * 0.25 + s.atk * 4 + s.def * 3 + (s.spd - 1) * 300 + s.crit * 400);
}

export function levelCost(level: number) {
  return { gold: Math.floor(60 * Math.pow(level, 1.7)) + 40, exp: Math.floor(50 * Math.pow(level, 1.6)) + 30 };
}

// ---- stages ----
export function stageLabel(s: number) {
  return `${Math.floor(s / 10) + 1}-${(s % 10) + 1}`;
}
export const isBoss = (s: number) => s % 10 === 9;

function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EnemyUnit { id: string; level: number; stats: Stats }

export function stageEnemies(s: number): EnemyUnit[] {
  const r = rng(s * 7919 + 13);
  const pool = [...CHARS];
  const level = Math.min(MAX_LEVEL, 1 + Math.floor(s * 1.25) + (isBoss(s) ? 3 : 0));
  const out: EnemyUnit[] = [];
  for (let i = 0; i < 3; i++) {
    const c = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const st = heroStats(c.id, level);
    // early stages are softer so a fresh level-1 team can win
    const k = Math.min(1, 0.7 + s * 0.006) * (isBoss(s) ? 1.15 : 1);
    st.hp = Math.round(st.hp * k); st.atk = Math.round(st.atk * k); st.def = Math.round(st.def * k);
    out.push({ id: c.id, level, stats: st });
  }
  return out;
}

export function stageReward(s: number) {
  return { gold: 200 + s * 60, exp: 150 + s * 45, ruby: isBoss(s) ? 300 : 30, gearChance: isBoss(s) ? 1 : 0.35 };
}

export function rollGearTier(s: number, r = Math.random) {
  // better tiers unlock as the campaign goes on
  const top = Math.min(4, Math.floor(s / 12));
  let t = 0;
  while (t < top && r() < 0.45) t++;
  return t;
}

// ---- idle (AFK) rewards ----
export const IDLE_CAP_MS = 12 * 3600 * 1000;
export function idleRate(s: number) {
  return { goldPerMin: 10 + s * 3, expPerMin: 8 + s * 2.5, gearEveryMin: 60 };
}
