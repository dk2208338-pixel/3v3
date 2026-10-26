// Campaign home: next stage, enemy preview, idle (AFK) chest.
import { go } from '../router';
import { GEAR_TIERS, IDLE_CAP_MS, gearName, isBoss, stageLabel } from '../game/progression';
import { claimIdle, idlePending, resetSave, save } from '../game/state';
import { h, fmt, toast } from './dom';
import { enemyPower, enemyRow, myTeamPower } from './common';

export function stageScreen(root: HTMLElement) {
  const s = save.stage;
  const owned = Object.keys(save.heroes).length;

  const idleBox = h('section', { class: 'card idle' });
  const renderIdle = () => {
    const p = idlePending();
    const hh = Math.floor(p.ms / 3600000), mm = Math.floor((p.ms % 3600000) / 60000);
    const full = p.ms >= IDLE_CAP_MS;
    idleBox.replaceChildren(
      h('div', { class: 'row-between' },
        h('h2', null, '방치 보상'),
        h('span', { class: full ? 'muted warn' : 'muted' }, `${hh}시간 ${mm}분 / 최대 12시간`)),
      h('div', { class: 'loot' },
        h('span', { class: 'gold' }, '● ', fmt(p.gold)),
        h('span', { class: 'exp' }, '▲ ', fmt(p.exp)),
        h('span', null, `장비 ${p.gear}개`)),
      h('button', {
        class: 'btn', disabled: p.gold + p.exp === 0,
        onclick: () => {
          const r = claimIdle();
          toast(`골드 ${fmt(r.gold)} · 경험치 ${fmt(r.exp)}${r.items.length ? ` · ${r.items.map(gearName).join(', ')}` : ''} 획득`);
          renderIdle();
        },
      }, '보상 받기'),
    );
  };
  renderIdle();
  const timer = setInterval(renderIdle, 1000);

  const mine = myTeamPower(save.team), theirs = enemyPower(s);
  let confirmReset = false;
  const resetBtn = h('button', {
    class: 'link',
    onclick: () => {
      if (!confirmReset) { confirmReset = true; resetBtn.textContent = '한 번 더 누르면 모든 진행이 지워져요'; return; }
      resetSave(); go({ name: 'summon' });
    },
  }, '개발용: 저장 데이터 초기화');

  root.append(
    h('section', { class: 'card stage-card' },
      h('div', { class: 'row-between' },
        h('p', { class: 'eyebrow' }, `챕터 ${Math.floor(s / 10) + 1}`),
        isBoss(s) ? h('span', { class: 'boss' }, '보스') : null),
      h('h1', { class: 'stage-no' }, `스테이지 ${stageLabel(s)}`),
      h('p', { class: 'muted' }, '상대 팀'),
      enemyRow(s),
      h('dl', { class: 'versus' },
        h('div', null, h('dt', null, '내 팀 전투력'), h('dd', null, fmt(mine))),
        h('div', null, h('dt', null, '상대 전투력'), h('dd', { class: mine >= theirs ? 'good' : 'bad' }, fmt(theirs)))),
      owned
        ? h('button', { class: 'btn primary', onclick: () => go({ name: 'team' }) }, '팀 편성 후 전투')
        : h('button', { class: 'btn primary', onclick: () => go({ name: 'summon' }) }, '먼저 영웅을 소환하세요'),
    ),
    idleBox,
    h('section', { class: 'card' },
      h('h2', null, '장비 드롭'),
      h('p', { class: 'muted' }, `지금 스테이지에서는 ${GEAR_TIERS[Math.min(4, Math.floor(s / 12))].label} 등급까지 나와요. 12스테이지마다 한 단계씩 올라가요.`)),
    h('div', { class: 'footer-note' }, resetBtn),
  );
  return () => clearInterval(timer);
}
