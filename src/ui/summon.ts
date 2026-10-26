// Character summon (gacha) with published rates and pity counter.
import { CHAR, CHARS, RARITY, type Rarity } from '../data';
import { go } from '../router';
import { COST_ONE, COST_TEN, PITY, RATES, summon, type PullResult } from '../game/gacha';
import { save } from '../game/state';
import { h, fmt, toast } from './dom';
import { portrait } from './common';

export function summonScreen(root: HTMLElement) {
  const results = h('div', { class: 'pull-results' });
  const pity = h('p', { class: 'muted' });
  const renderPity = () => { pity.textContent = `전설 확정까지 ${PITY - save.pity}회 · 누적 ${fmt(save.pulls)}회`; };

  const pull = (n: 1 | 10) => {
    const r = summon(n);
    if (!r) { toast('루비가 부족해요.'); return; }
    renderPity();
    showResults(results, r);
  };

  const order: Rarity[] = ['SSR', 'SR', 'R'];
  root.append(
    h('section', { class: 'banner' },
      h('p', { class: 'eyebrow' }, '상시 소환'),
      h('h1', null, '영웅 소환'),
      h('p', null, `${CHARS.length}명의 영웅 중에서 소환해요.`)),
    h('div', { class: 'btn-row wide' },
      h('button', { class: 'btn', onclick: () => pull(1) }, '1회 소환', h('small', null, `◆ ${fmt(COST_ONE)}`)),
      h('button', { class: 'btn primary', onclick: () => pull(10) }, '10회 소환', h('small', null, `◆ ${fmt(COST_TEN)}`))),
    pity,
    results,
    h('details', { class: 'card rates' },
      h('summary', null, '확률 정보'),
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, '등급'), h('th', null, '확률'), h('th', null, '영웅'))),
        h('tbody', null, ...order.map((r) => {
          const pool = CHARS.filter((c) => c.rarity === r);
          return h('tr', null,
            h('td', { style: `color:${RARITY[r].color}` }, RARITY[r].label),
            h('td', null, `${(RATES[r] * 100).toFixed(1)}%`),
            h('td', null, pool.length ? pool.map((c) => `${c.name} ${(RATES[r] / pool.length * 100).toFixed(2)}%`).join(', ') : '-'));
        }))),
      h('p', { class: 'muted small' }, `${PITY}회째 소환까지 전설이 나오지 않으면 그 회차는 전설이 확정돼요. 이미 가진 영웅이 나오면 골드와 경험치로 바뀌어요.`)),
  );
  renderPity();
}

function showResults(box: HTMLElement, r: PullResult[]) {
  box.replaceChildren(...r.map((p, i) => h('button', {
    class: `pull r-${p.rarity.toLowerCase()}`, style: `animation-delay:${i * 70}ms;--rar:${RARITY[p.rarity].color}`,
    onclick: () => p.isNew || save.heroes[p.id] ? go({ name: 'hero', id: p.id }) : undefined,
  },
  portrait(p.id, 60),
  h('span', { class: 'pull-name' }, CHAR[p.id].name),
  p.isNew ? h('span', { class: 'new' }, 'NEW') : h('span', { class: 'dupe' }, `● ${fmt(p.dupe!.gold)}`))));
}
