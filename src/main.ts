import './styles.css';
import { save, onChange } from './game/state';
import { h, fmt } from './ui/dom';
import { stageScreen } from './ui/stage';
import { teamScreen } from './ui/team';
import { battleScreen } from './ui/battle';
import { heroesScreen, heroDetail } from './ui/heroes';
import { summonScreen } from './ui/summon';

import { setRouter, type Route } from './router';

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;

const bar = h('header', { class: 'topbar' });
const view = h('main', { class: 'view' });
const nav = h('nav', { class: 'tabs' });
app.append(bar, view, nav);

function renderBar() {
  bar.replaceChildren(
    h('span', { class: 'cur ruby', title: '루비' }, '◆ ', fmt(save.ruby)),
    h('span', { class: 'cur gold', title: '골드' }, '● ', fmt(save.gold)),
    h('span', { class: 'cur exp', title: '경험치' }, '▲ ', fmt(save.exp)),
  );
}
onChange(renderBar);

const TABS: [Route['name'], string][] = [['stage', '스테이지'], ['heroes', '영웅'], ['summon', '소환']];

function go(r: Route) {
  if (cleanup) cleanup();
  cleanup = undefined;
  view.replaceChildren();
  view.scrollTop = 0;
  const full = r.name === 'battle';
  app.classList.toggle('fullscreen', full);
  nav.replaceChildren(...TABS.map(([name, label]) => h('button', {
    class: 'tab', 'aria-current': (r.name === name || (r.name === 'hero' && name === 'heroes') || (r.name === 'team' && name === 'stage')) ? 'page' : null,
    onclick: () => go({ name } as Route),
  }, label)));
  if (r.name === 'stage') cleanup = stageScreen(view);
  else if (r.name === 'team') cleanup = teamScreen(view);
  else if (r.name === 'battle') cleanup = battleScreen(view);
  else if (r.name === 'heroes') cleanup = heroesScreen(view);
  else if (r.name === 'hero') cleanup = heroDetail(view, r.id);
  else if (r.name === 'summon') cleanup = summonScreen(view);
}

setRouter(go);
renderBar();
go(Object.keys(save.heroes).length ? { name: 'stage' } : { name: 'summon' });
