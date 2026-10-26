// Hero roster and hero detail (level up, gear).
import { CHAR, CHARS } from '../data';
import { go } from '../router';
import {
  GEAR_MAX_LEVEL, GEAR_TIERS, MAX_LEVEL, SLOTS, SLOT_LABEL, enhanceCost, gearName, gearStats, levelCost, power,
  type Gear, type Slot,
} from '../game/progression';
import { canLevel, enhance, equip, heroStatsOf, levelUp, onChange, save, unequip, type Hero } from '../game/state';
import { atlasNow, drawFrame, loadAtlas } from '../game/sprites';
import { h, fmt, toast } from './dom';
import { portrait, rarityTag } from './common';

export function heroesScreen(root: HTMLElement) {
  const owned = Object.values(save.heroes).sort((a, b) => power(heroStatsOf(b)) - power(heroStatsOf(a)));
  const missing = CHARS.filter((c) => !save.heroes[c.id]);
  root.append(
    h('h1', { class: 'page-title' }, '영웅'),
    h('p', { class: 'muted' }, `보유 ${owned.length} / ${CHARS.length}`),
    h('div', { class: 'hero-grid' },
      ...owned.map((hero) => h('button', { class: 'hero-card', onclick: () => go({ name: 'hero', id: hero.id }) },
        portrait(hero.id, 72),
        h('span', { class: 'hc-name' }, CHAR[hero.id].name),
        h('span', { class: 'hc-lv' }, `Lv.${hero.level}`),
        h('span', { class: 'hc-pow' }, `전투력 ${fmt(power(heroStatsOf(hero)))}`))),
      ...missing.map((c) => h('div', { class: 'hero-card locked' },
        portrait(c.id, 72, 'dim'),
        h('span', { class: 'hc-name' }, c.name),
        h('span', { class: 'hc-lv' }, '미보유'))),
    ),
  );
}

export function heroDetail(root: HTMLElement, id: string) {
  const hero = save.heroes[id];
  if (!hero) { go({ name: 'heroes' }); return; }
  const c = CHAR[id];
  const stage = h('canvas', { class: 'hero-stage', width: 240, height: 160, 'aria-label': `${c.name} 대기 모습` });
  const body = h('div');
  root.append(
    h('button', { class: 'link', onclick: () => go({ name: 'heroes' }) }, '‹ 영웅 목록'),
    h('section', { class: 'hero-head' },
      stage,
      h('div', null,
        h('h1', { class: 'page-title' }, c.name),
        h('p', { class: 'tags' }, rarityTag(id), h('span', { class: 'tag' }, c.element), h('span', { class: 'tag' }, c.role)),
        h('p', { class: 'muted' }, `궁극기 · ${c.ult}`))),
    body,
  );

  // idle preview with the same breathing motion as in battle
  let raf = 0;
  loadAtlas(id).then(() => {
    const ctx = stage.getContext('2d')!;
    const loop = (t: number) => {
      const a = atlasNow(id)!;
      ctx.clearRect(0, 0, 240, 160);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#00000055'; ctx.beginPath(); ctx.ellipse(120, 148, 30, 7, 0, 0, 7); ctx.fill();
      drawFrame(ctx, a, 'st0', 120, 146, 1, 1.75, { sy: 1 + Math.sin(t / 420) * 0.018 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });

  const render = () => {
    const s = heroStatsOf(hero);
    const cost = levelCost(hero.level);
    body.replaceChildren(
      h('section', { class: 'card' },
        h('div', { class: 'row-between' },
          h('h2', null, `Lv.${hero.level}`, h('span', { class: 'muted' }, ` / ${MAX_LEVEL}`)),
          h('span', { class: 'pow' }, `전투력 ${fmt(power(s))}`)),
        h('dl', { class: 'stats' },
          stat('체력', fmt(s.hp)), stat('공격', fmt(s.atk)), stat('방어', fmt(s.def)),
          stat('속도', s.spd.toFixed(2)), stat('치명', `${Math.round(s.crit * 100)}%`)),
        hero.level >= MAX_LEVEL
          ? h('p', { class: 'muted' }, '최대 레벨이에요.')
          : h('div', { class: 'lvl' },
            h('span', { class: 'cost' },
              h('span', { class: save.gold >= cost.gold ? 'gold' : 'bad' }, `● ${fmt(cost.gold)}`),
              h('span', { class: save.exp >= cost.exp ? 'exp' : 'bad' }, `▲ ${fmt(cost.exp)}`)),
            h('button', { class: 'btn primary', disabled: !canLevel(hero), onclick: () => levelUp(hero, 1) }, '레벨업'),
            h('button', { class: 'btn', disabled: !canLevel(hero), onclick: () => levelUp(hero, 10) }, '+10')),
      ),
      h('section', { class: 'card' },
        h('h2', null, '장비'),
        ...SLOTS.map((slot) => gearSlot(hero, slot))),
    );
  };
  const off = onChange(render);
  render();
  return () => { cancelAnimationFrame(raf); off(); };
}

function stat(label: string, v: string) {
  return h('div', null, h('dt', null, label), h('dd', null, v));
}

function gearLine(g: Gear) {
  const gs = gearStats(g);
  const parts = [
    gs.atk && `공격 +${gs.atk}`, gs.hp && `체력 +${gs.hp}`, gs.def && `방어 +${gs.def}`,
    gs.crit && `치명 +${Math.round(gs.crit * 100)}%`, gs.spd && `속도 +${gs.spd.toFixed(2)}`,
  ].filter(Boolean);
  return h('span', { class: 'gear-line' },
    h('b', { style: `color:${GEAR_TIERS[g.tier].color}` }, `${gearName(g)} +${g.level}`), ' ', h('span', { class: 'muted' }, parts.join(' · ')));
}

function gearSlot(hero: Hero, slot: Slot) {
  const gid = hero.gear[slot];
  const g = save.gear.find((x) => x.id === gid);
  const wrap = h('div', { class: 'gear-slot' });
  const head = h('div', { class: 'row-between' }, h('span', { class: 'slot-name' }, SLOT_LABEL[slot]));
  wrap.append(head);
  if (g) {
    const cost = enhanceCost(g);
    wrap.append(gearLine(g), h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn small', disabled: g.level >= GEAR_MAX_LEVEL || save.gold < cost,
        onclick: () => { if (enhance(g)) toast(`${gearName(g)} +${g.level} 강화 성공`); },
      }, g.level >= GEAR_MAX_LEVEL ? '최대 강화' : `강화 ● ${fmt(cost)}`),
      h('button', { class: 'btn small', onclick: () => unequip(hero, slot) }, '해제')));
  }
  const options = save.gear.filter((x) => x.slot === slot && x.id !== gid)
    .sort((a, b) => b.tier - a.tier || b.level - a.level);
  const list = h('div', { class: 'gear-list', hidden: true }, ...(options.length ? options.map((o) =>
    h('div', { class: 'gear-opt' }, gearLine(o),
      o.owner ? h('span', { class: 'muted small' }, `${CHAR[o.owner]?.name ?? ''} 장착 중`) : null,
      h('button', { class: 'btn small', onclick: () => equip(hero, o) }, '장착'))) : [h('p', { class: 'muted' }, '가진 장비가 없어요. 스테이지와 방치 보상에서 얻을 수 있어요.')]));
  head.append(h('button', { class: 'link', onclick: () => { list.hidden = !list.hidden; } }, g ? `교체 (${options.length})` : `장착 (${options.length})`));
  wrap.append(list);
  return wrap;
}

