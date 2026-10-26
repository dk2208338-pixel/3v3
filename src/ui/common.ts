// Shared bits used by several screens.
import { CHAR, RARITY } from '../data';
import { power, stageEnemies } from '../game/progression';
import { heroStatsOf, save } from '../game/state';
import { portraitUrl } from '../game/sprites';
import { h } from './dom';

export function portrait(id: string, size = 56, extra = '') {
  const c = CHAR[id];
  return h('img', {
    class: `portrait ${extra}`, src: portraitUrl(id), alt: c.name, width: size, height: size,
    style: `--rar:${RARITY[c.rarity].color};width:${size}px;height:${size}px`,
  });
}

export function rarityTag(id: string) {
  const r = RARITY[CHAR[id].rarity];
  return h('span', { class: 'rtag', style: `--rar:${r.color}` }, r.label);
}

export function myTeamPower(ids: string[]) {
  return ids.reduce((s, id) => s + (save.heroes[id] ? power(heroStatsOf(save.heroes[id])) : 0), 0);
}

export function enemyPower(stage: number) {
  return stageEnemies(stage).reduce((s, e) => s + power(e.stats), 0);
}

export function enemyRow(stage: number) {
  return h('div', { class: 'enemy-row' }, ...stageEnemies(stage).map((e) =>
    h('div', { class: 'mini' }, portrait(e.id, 48), h('span', null, `Lv.${e.level}`))));
}
