// Player save: currencies, owned heroes, gear inventory, campaign progress. Stored in localStorage.
import { CHARS } from '../data';
import {
  GEAR_MAX_LEVEL, IDLE_CAP_MS, MAX_LEVEL, enhanceCost, heroStats, idleRate, levelCost, rollGearTier, type Gear, type Slot,
} from './progression';

export interface Hero {
  id: string;
  level: number;
  gear: Partial<Record<Slot, number>>; // gear ids
}

export interface Save {
  v: 1;
  ruby: number;
  gold: number;
  exp: number;
  heroes: Record<string, Hero>;
  gear: Gear[];
  nextGearId: number;
  stage: number; // index of the next stage to clear
  idleSince: number;
  pity: number;
  pulls: number;
  team: string[];
}

const KEY = '3v3-save-v1';
const DEV_RUBY = 100_000;

function fresh(): Save {
  return {
    v: 1, ruby: DEV_RUBY, gold: 5000, exp: 3000, heroes: {}, gear: [], nextGearId: 1,
    stage: 0, idleSince: Date.now(), pity: 0, pulls: 0, team: [],
  };
}

export let save: Save = load();

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save;
      if (s.v === 1) {
        // drop heroes whose character was removed from the CSV
        for (const id of Object.keys(s.heroes)) if (!CHARS.some((c) => c.id === id)) delete s.heroes[id];
        s.team = s.team.filter((id) => s.heroes[id]);
        return s;
      }
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return fresh();
}

const listeners = new Set<() => void>();
export function onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }

export function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function resetSave() { save = fresh(); commit(); }

export function heroGear(h: Hero): Gear[] {
  return Object.values(h.gear).map((gid) => save.gear.find((g) => g.id === gid)).filter((g): g is Gear => !!g);
}
export function heroStatsOf(h: Hero) { return heroStats(h.id, h.level, heroGear(h)); }

export function addHero(id: string): boolean {
  if (save.heroes[id]) return false;
  save.heroes[id] = { id, level: 1, gear: {} };
  return true;
}

export function canLevel(h: Hero) {
  const c = levelCost(h.level);
  return h.level < MAX_LEVEL && save.gold >= c.gold && save.exp >= c.exp;
}
export function levelUp(h: Hero, times = 1) {
  let n = 0;
  while (n < times && canLevel(h)) {
    const c = levelCost(h.level);
    save.gold -= c.gold; save.exp -= c.exp; h.level++; n++;
  }
  if (n) commit();
  return n;
}

export function addGear(slot: Slot, tier: number): Gear {
  const g: Gear = { id: save.nextGearId++, slot, tier, level: 0 };
  save.gear.push(g);
  return g;
}
export function randomGear(stage: number): Gear {
  const slots: Slot[] = ['weapon', 'armor', 'acc'];
  return addGear(slots[Math.floor(Math.random() * 3)], rollGearTier(stage));
}

export function equip(h: Hero, g: Gear) {
  if (g.owner && save.heroes[g.owner]) delete save.heroes[g.owner].gear[g.slot];
  const prev = h.gear[g.slot];
  if (prev) { const pg = save.gear.find((x) => x.id === prev); if (pg) delete pg.owner; }
  h.gear[g.slot] = g.id; g.owner = h.id;
  commit();
}
export function unequip(h: Hero, slot: Slot) {
  const gid = h.gear[slot];
  const g = save.gear.find((x) => x.id === gid);
  if (g) delete g.owner;
  delete h.gear[slot];
  commit();
}
export function enhance(g: Gear) {
  const c = enhanceCost(g);
  if (g.level >= GEAR_MAX_LEVEL || save.gold < c) return false;
  save.gold -= c; g.level++; commit();
  return true;
}

// ---- idle chest ----
export function idlePending(now = Date.now()) {
  const ms = Math.min(IDLE_CAP_MS, Math.max(0, now - save.idleSince));
  const min = ms / 60000;
  const r = idleRate(save.stage);
  return { ms, gold: Math.floor(min * r.goldPerMin), exp: Math.floor(min * r.expPerMin), gear: Math.floor(min / r.gearEveryMin) };
}
export function claimIdle() {
  const p = idlePending();
  save.gold += p.gold; save.exp += p.exp;
  const gear = Array.from({ length: p.gear }, () => randomGear(save.stage));
  save.idleSince = Date.now();
  commit();
  return { ...p, items: gear };
}
