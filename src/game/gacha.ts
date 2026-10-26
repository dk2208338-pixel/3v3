// Character summon. Rates are shown in the summon screen (probability disclosure).
import { CHARS, type Rarity } from '../data';
import { addHero, commit, save } from './state';

export const RATES: Record<Rarity, number> = { SSR: 0.03, SR: 0.22, R: 0.75 };
export const PITY = 60; // SSR guaranteed on this pull if none before
export const COST_ONE = 300;
export const COST_TEN = 2700;
// duplicates turn into growth materials (no ascension system yet)
export const DUPE_REWARD: Record<Rarity, { gold: number; exp: number }> = {
  R: { gold: 3000, exp: 1500 },
  SR: { gold: 8000, exp: 4000 },
  SSR: { gold: 25000, exp: 12000 },
};

export interface PullResult { id: string; rarity: Rarity; isNew: boolean; dupe?: { gold: number; exp: number } }

function rollRarity(): Rarity {
  if (save.pity + 1 >= PITY) return 'SSR';
  const r = Math.random();
  if (r < RATES.SSR) return 'SSR';
  if (r < RATES.SSR + RATES.SR) return 'SR';
  return 'R';
}

function pickOf(rarity: Rarity) {
  let pool = CHARS.filter((c) => c.rarity === rarity);
  if (!pool.length) pool = CHARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function summon(count: 1 | 10): PullResult[] | null {
  const cost = count === 10 ? COST_TEN : COST_ONE;
  if (save.ruby < cost) return null;
  save.ruby -= cost;
  const out: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity();
    save.pulls++;
    save.pity = rarity === 'SSR' ? 0 : save.pity + 1;
    const c = pickOf(rarity);
    const isNew = addHero(c.id);
    const res: PullResult = { id: c.id, rarity: c.rarity, isNew };
    if (!isNew) {
      const d = DUPE_REWARD[c.rarity];
      save.gold += d.gold; save.exp += d.exp; res.dupe = d;
    }
    out.push(res);
  }
  commit();
  return out;
}
