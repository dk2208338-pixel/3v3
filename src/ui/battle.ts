// Battle screen: runs the auto battle for the current stage and pays out rewards.
import { go } from '../router';
import { Battle } from '../game/battle';
import { gearName, stageEnemies, stageLabel, stageReward } from '../game/progression';
import { commit, heroStatsOf, randomGear, save } from '../game/state';
import { h, fmt } from './dom';

export function battleScreen(root: HTMLElement) {
  const stage = save.stage;
  const team = save.team.filter((id) => save.heroes[id]);
  if (!team.length) { go({ name: 'team' }); return; }

  const canvas = h('canvas', { class: 'arena', 'aria-label': '전투 화면' });
  const speedBtn = h('button', { class: 'btn small' }, '2배속');
  const skipBtn = h('button', { class: 'btn small' }, '건너뛰기');
  const result = h('div', { class: 'result', hidden: true });
  root.append(h('div', { class: 'battle-wrap' }, canvas,
    h('div', { class: 'battle-ctl' }, speedBtn, skipBtn), result));

  const battle = new Battle(
    canvas,
    team.map((id) => ({ id, level: save.heroes[id].level, stats: heroStatsOf(save.heroes[id]) })),
    stageEnemies(stage),
    { title: `스테이지 ${stageLabel(stage)}`, onEnd: (w) => finish(w === 'A') },
  );
  speedBtn.onclick = () => { battle.speed = battle.speed === 2 ? 1 : 2; speedBtn.textContent = `${battle.speed}배속`; };
  skipBtn.onclick = () => { skipBtn.disabled = true; battle.skip(); };
  battle.start();

  function finish(win: boolean) {
    skipBtn.disabled = true;
    if (win) {
      const r = stageReward(stage);
      save.gold += r.gold; save.exp += r.exp; save.ruby += r.ruby;
      const item = Math.random() < r.gearChance ? randomGear(stage) : null;
      save.stage = Math.max(save.stage, stage + 1);
      commit();
      result.replaceChildren(
        h('h2', { class: 'win' }, '승리'),
        h('p', { class: 'muted' }, `스테이지 ${stageLabel(stage)} 클리어`),
        h('ul', { class: 'rewards' },
          h('li', { class: 'gold' }, `● 골드 ${fmt(r.gold)}`),
          h('li', { class: 'exp' }, `▲ 경험치 ${fmt(r.exp)}`),
          h('li', { class: 'ruby' }, `◆ 루비 ${fmt(r.ruby)}`),
          item ? h('li', null, `장비: ${gearName(item)}`) : null),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => go({ name: 'stage' }) }, '나가기'),
          h('button', { class: 'btn primary', onclick: () => go({ name: 'battle' }) }, `다음: ${stageLabel(save.stage)}`)),
      );
    } else {
      result.replaceChildren(
        h('h2', { class: 'lose' }, '패배'),
        h('p', { class: 'muted' }, '영웅 레벨을 올리거나 장비를 바꿔서 다시 도전해 보세요.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => go({ name: 'heroes' }) }, '영웅 육성'),
          h('button', { class: 'btn primary', onclick: () => go({ name: 'battle' }) }, '다시 도전')),
      );
    }
    result.hidden = false;
  }

  return () => battle.stop();
}
