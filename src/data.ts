// Static game data: the character roster (from data/characters.csv) and design tables.
import csvText from '../data/characters.csv?raw';

export type Rarity = 'R' | 'SR' | 'SSR';
export type Role = '탱커' | '전사' | '원거리';

export interface CharDef {
  id: string;
  name: string;
  ult: string;
  rarity: Rarity;
  element: string;
  role: Role;
  color: string;
}

export const RARITY: Record<Rarity, { label: string; color: string; mult: number }> = {
  R: { label: '일반', color: '#8fb3d9', mult: 1 },
  SR: { label: '희귀', color: '#c77dff', mult: 1.15 },
  SSR: { label: '전설', color: '#ffc94d', mult: 1.3 },
};

export const ROLE_BASE: Record<Role, { hp: number; atk: number; def: number; spd: number }> = {
  탱커: { hp: 520, atk: 24, def: 14, spd: 0.9 },
  전사: { hp: 420, atk: 30, def: 10, spd: 1.0 },
  원거리: { hp: 340, atk: 34, def: 7, spd: 1.05 },
};

const ELEMENT_COLOR: Record<string, string> = {
  물: '#7fd3ff', 번개: '#ffd84d', 바람: '#c9f0ff', 음파: '#ffbf3f', 불: '#ff8a3d', 무속: '#ff6a9a',
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
  });
}

export const CHARS: CharDef[] = parseCsv(csvText).map((r) => ({
  id: r.id,
  name: r.name,
  ult: r.ult_name || '궁극기',
  rarity: (r.rarity as Rarity) in RARITY ? (r.rarity as Rarity) : 'R',
  element: r.element,
  role: (r.role as Role) in ROLE_BASE ? (r.role as Role) : '전사',
  color: ELEMENT_COLOR[r.element] ?? '#ffffff',
}));

export const CHAR: Record<string, CharDef> = Object.fromEntries(CHARS.map((c) => [c.id, c]));
