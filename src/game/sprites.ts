// Loads per-character sprite atlases built by tools/build_sprites.py.

export interface Frame { x: number; y: number; w: number; h: number; ax: number; oy: number; sc: number }

export interface Atlas {
  img: HTMLImageElement;
  white: HTMLCanvasElement; // same atlas filled white, for hit flashes
  frames: Record<string, Frame>;
}

const cache = new Map<string, Promise<Atlas>>();
const ready = new Map<string, Atlas>();
const base = import.meta.env.BASE_URL;

export function loadAtlas(id: string): Promise<Atlas> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const [meta, img] = await Promise.all([
        fetch(`${base}sprites/${id}.json`).then((r) => r.json() as Promise<{ frames: Record<string, Frame> }>),
        new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = `${base}sprites/${id}.png`;
        }),
      ]);
      const white = document.createElement('canvas');
      white.width = img.width; white.height = img.height;
      const g = white.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#fff';
      g.fillRect(0, 0, img.width, img.height);
      const a = { img, white, frames: meta.frames };
      ready.set(id, a);
      return a;
    })();
    cache.set(id, p);
  }
  return p;
}

export const atlasNow = (id: string) => ready.get(id);
export const portraitUrl = (id: string) => `${base}portraits/${id}.png`;

/** Draw one frame with its feet at (x, y). dir = 1 faces right, -1 faces left. */
export function drawFrame(
  ctx: CanvasRenderingContext2D, a: Atlas, key: string, x: number, y: number, dir: number, scale: number,
  o: { alpha?: number; white?: number; rot?: number; sy?: number } = {},
) {
  const f = a.frames[key];
  if (!f) return;
  const s = scale * f.sc;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(dir * s, s * (o.sy ?? 1));
  ctx.drawImage(a.img, f.x, f.y, f.w, f.h, -f.ax, -f.h + f.oy, f.w, f.h);
  if (o.white) {
    ctx.globalAlpha = (o.alpha ?? 1) * o.white;
    ctx.drawImage(a.white, f.x, f.y, f.w, f.h, -f.ax, -f.h + f.oy, f.w, f.h);
  }
  ctx.restore();
}
