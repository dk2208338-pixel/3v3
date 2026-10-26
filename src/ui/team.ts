// KOF-style team select: pick up to three heroes for 선봉 / 중견 / 대장.
import { CHAR } from '../data';
import { go } from '../router';
import { power, stageLabel } from '../game/progression';
import { commit, heroStatsOf, save } from '../game/state';
import { h, fmt } from './dom';
import { enemyPower, enemyRow, myTeamPower, portrait } from './common';

const ROLE = ['선봉', '중견', '대장'];

export function teamScreen(root: HTMLElement) {
  const pick: string[] = save.team.filter((id) => save.heroes[id]).slice(0, 3);

  const render = () => {
    const heroes = Object.values(save.heroes).sort((a, b) => power(heroStatsOf(b)) - power(heroStatsOf(a)));
    const need = Math.min(3, heroes.length);
    root.replaceChildren(
      h('div', { class: 'row-between' },
        h('button', { class: 'link', onclick: () => go({ name: 'stage' }) }, '‹ 스테이지'),
        h('span', { class: 'muted' }, `스테이지 ${stageLabel(save.stage)}`)),
      h('section', { class: 'slots' }, ...ROLE.map((label, i) => {
        const id = pick[i];
        return h('button', {
          class: `slot${id ? ' filled' : ''}`, 'aria-label': id ? `${label} ${CHAR[id].name} 빼기` : `${label} 비어 있음`,
          onclick: () => { if (id) { pick.splice(i, 1); render(); } },
        },
        h('span', { class: 'slot-label' }, label),
        id ? portrait(id, 84) : h('span', { class: 'slot-empty' }, '?'),
        h('span', { class: 'slot-name' }, id ? `${CHAR[id].name} Lv.${save.heroes[id].level}` : '선택'));
      })),
      h('dl', { class: 'versus' },
        h('div', null, h('dt', null, '내 팀'), h('dd', null, fmt(myTeamPower(pick)))),
        h('div', null, h('dt', null, '상대'), h('dd', null, fmt(enemyPower(save.stage))))),
      enemyRow(save.stage),
      h('h2', { class: 'section-title' }, '영웅 선택'),
      h('div', { class: 'select-grid' }, ...heroes.map((hero) => {
        const n = pick.indexOf(hero.id);
        return h('button', {
          class: `pick${n >= 0 ? ' on' : ''}`, 'aria-pressed': String(n >= 0),
          onclick: () => {
            if (n >= 0) pick.splice(n, 1);
            else if (pick.length < 3) pick.push(hero.id);
            render();
          },
        },
        portrait(hero.id, 64),
        n >= 0 ? h('span', { class: 'pick-no' }, ROLE[n]) : null,
        h('span', { class: 'pick-name' }, CHAR[hero.id].name),
        h('span', { class: 'pick-lv' }, `Lv.${hero.level}`));
      })),
      h('div', { class: 'sticky-cta' },
        h('button', {
          class: 'btn primary', disabled: pick.length < need || !need,
          onclick: () => { save.team = [...pick]; commit(); go({ name: 'battle' }); },
        }, pick.length < need ? `${need - pick.length}명 더 골라 주세요` : '전투 시작')),
    );
  };
  render();
}
