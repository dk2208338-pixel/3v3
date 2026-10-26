// Navigation entry point shared by screens; main.ts installs the implementation.
export type Route =
  | { name: 'stage' } | { name: 'team' } | { name: 'battle' }
  | { name: 'heroes' } | { name: 'hero'; id: string } | { name: 'summon' };

let impl: (r: Route) => void = () => {};
export const setRouter = (fn: (r: Route) => void) => { impl = fn; };
export const go = (r: Route) => impl(r);
