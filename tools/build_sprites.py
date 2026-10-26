"""Turn Gemini sprite sheets (fake checkerboard background) into game atlases.

  assets/sheets/<id>.webp + tools/sheet_layouts.json  ->  public/sprites/<id>.png + <id>.json, public/portraits/<id>.png

Needs: pip install pillow numpy scipy
Usage: python3 tools/build_sprites.py [id ...]   (no ids = every sheet in the layout file)
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / 'tools/sheet_layouts.json').read_text())
OUT = ROOT / 'public/sprites'


def checker_colors(mx, sat):
    """The two grey values of the painted checkerboard (most common neutral greys)."""
    h = np.bincount(mx[sat <= 6].ravel(), minlength=256)
    peaks = []
    for _ in range(2):
        p = int(h.argmax()); peaks.append(p); h[max(0, p - 12):p + 13] = 0
    return sorted(peaks)


def fit_axis(profile):
    """Cell size and offset of the checker along one axis (strongest periodic edges).

    Sheets use ~5.9px or ~11.7px cells. A 5.9 grid also scores well at 11.7 (every other edge),
    and an 11.7 grid scores half at 5.9, so the larger size wins only when clearly stronger.
    """
    n = len(profile)
    def best_in(sizes):
        best = (-1.0, 0.0, 0.0)
        for size in sizes:
            for off in np.arange(0, size, 0.25):
                idx = np.round(np.arange(off, n - 1, size)).astype(int)
                score = profile[idx].mean()
                if score > best[0]: best = (score, size, off)
        return best
    small = best_in(np.arange(5.5, 6.4, 0.005))
    large = best_in(np.arange(11.0, 12.8, 0.005))
    pick = large if large[0] > 1.5 * small[0] else small
    return pick[1], pick[2]


def background_mask(a, mode=None):
    """mode: 'flat' or 'grid' from the sheet config; by default light checkers use the plain
    grey flood fill (cleanest) and dark checkers the grid model (keeps black clothes)."""
    if mode is None:
        mx = a.max(2); sat = mx - a.min(2)
        mode = 'flat' if checker_colors(mx, sat)[0] >= 60 else 'grid'
    return (flat_mask if mode == 'flat' else grid_mask)(a)


def flat_mask(a):
    """True where the pixel belongs to a character/effect (checker greys removed by flood fill)."""
    mx = a.max(2); sat = mx - a.min(2)
    lo, hi = checker_colors(mx, sat)
    bglike = (sat <= 8) & (mx >= lo - 10) & (mx <= hi + 12)
    lab, n = nd.label(bglike)
    sizes = nd.sum(bglike, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool); keep[1:] = sizes > 40
    bg = keep[lab]
    contam = ((sat >= 9) & (sat <= 30) & (mx >= lo - 22) & (mx <= hi + 22)) | ((sat <= 8) & (mx >= lo - 6) & (mx <= hi + 4))
    for _ in range(2):
        bg |= (~bg) & nd.binary_dilation(bg) & contam
    fg = nd.binary_opening(~bg, iterations=1)
    return fg, (lo, hi), mx, sat


def grid_mask(a):
    """True where the pixel belongs to a character/effect.

    Gemini paints the checkerboard on a regular grid, so we predict the grey every pixel
    *should* have and only call it background where it matches. This keeps dark clothes
    that happen to share the dark checker grey.
    """
    mx = a.max(2); sat = mx - a.min(2)
    lo, hi = checker_colors(mx, sat)
    L = mx.astype(float); neu = sat <= 8
    gx = np.abs(np.diff(L, axis=1)) * (neu[:, 1:] & neu[:, :-1])
    gy = np.abs(np.diff(L, axis=0)) * (neu[1:] & neu[:-1])
    sx, ox = fit_axis(gx.sum(0)); sy, oy = fit_axis(gy.sum(1))
    H, W = mx.shape
    cx = np.floor((np.arange(W) - ox) / sx).astype(int); cy = np.floor((np.arange(H) - oy) / sy).astype(int)
    parity = (cy[:, None] + cx[None, :]) & 1
    # which parity is the light grey
    m0 = neu & (parity == 0)
    light0 = np.median(mx[m0 & (mx >= lo - 10) & (mx <= hi + 12)]) > (lo + hi) / 2
    expect = np.where((parity == 0) == light0, hi, lo)
    # pixels next to a cell edge are blurred between the two greys
    fx = (np.arange(W) - ox) / sx; fy = (np.arange(H) - oy) / sy
    ex = np.minimum(fx - np.floor(fx), np.ceil(fx) - fx) * sx < 1.2
    ey = np.minimum(fy - np.floor(fy), np.ceil(fy) - fy) * sy < 1.2
    edge = ey[:, None] | ex[None, :]
    match = (sat <= 10) & ((np.abs(mx - expect) <= 9) | (edge & (mx >= lo - 6) & (mx <= hi + 6)))
    seed = nd.uniform_filter(match.astype(float), 7) >= 0.9
    bg = nd.binary_propagation(seed, mask=match)
    # checker pockets enclosed by limbs or glows: matching areas bigger than one cell
    lab, n = nd.label(match & ~bg)
    if n:
        sz = nd.sum(np.ones_like(lab), lab, range(1, n + 1))
        big = np.zeros(n + 1, bool); big[1:] = sz >= 1.3 * sx * sy
        bg |= big[lab]
    # peel edge pixels that are checker grey mixed with a little colour (halo around hair)
    contam = ((sat >= 9) & (sat <= 30) & (mx >= lo - 22) & (mx <= hi + 22)) | ((sat <= 8) & (np.abs(mx - expect) <= 6))
    for _ in range(2):
        bg |= (~bg) & nd.binary_dilation(bg) & contam
    fg = nd.binary_opening(~bg, iterations=1)
    return fg, (lo, hi), mx, sat


def resolve(sheet_id):
    sc = CFG['sheets'][sheet_id]
    chain, name = [], sc['layout']
    while name:
        lay = CFG['layouts'][name]; chain.append(lay); name = lay.get('base')
    frames, oy, portrait = {}, {}, None
    for lay in reversed(chain):
        frames.update(lay['frames']); oy.update(lay.get('oy', {})); portrait = lay.get('portrait', portrait)
    frames.update(sc.get('frames', {})); oy.update(sc.get('oy', {}))
    return frames, oy, sc.get('sc', {}), sc.get('portrait', portrait)


def build(sheet_id):
    a = np.array(Image.open(ROOT / f'assets/sheets/{sheet_id}.webp').convert('RGB')).astype(int)
    fg, (lo, hi), mx, sat = background_mask(a, CFG['sheets'][sheet_id].get('mask'))
    frames, oys, scs, portrait = resolve(sheet_id)
    effect = set(CFG['effect_frames'])
    body_scale = float(CFG['sheets'][sheet_id].get('scale', 1))  # sheets that draw the character bigger
    crops = {}
    for k, (x0, y0, x1, y1) in frames.items():
        al = fg[y0:y1, x0:x1].copy()
        if k in effect:  # checker showing through inside glows
            m = mx[y0:y1, x0:x1]; s = sat[y0:y1, x0:x1]
            al &= ~((s <= 8) & ((abs(m - lo) <= 7) | (abs(m - hi) <= 6)))
        lab, n = nd.label(nd.binary_dilation(al, iterations=2))
        if n > 1:  # drop specks
            sz = nd.sum(al, lab, range(1, n + 1)); big = np.zeros(n + 1, bool); big[1:] = sz >= max(25, sz.max() * 0.03); al &= big[lab]
        ys, xs = np.nonzero(al)
        if not len(ys):
            print(f'  ! {sheet_id}.{k}: empty frame, skipped'); continue
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgba = np.dstack([a[y0:y1, x0:x1], al * 255]).astype(np.uint8)[by0:by1, bx0:bx1]
        feet = np.nonzero(al[by0:by1, bx0:bx1][-12:])[1]
        crops[k] = (Image.fromarray(rgba, 'RGBA'), int(np.median(feet)), int(oys.get(k, 0)), float(scs.get(k, 1)) * body_scale)
    px0, py0, px1, py1 = portrait
    crops['portrait'] = (Image.fromarray(a[py0:py1, px0:px1].astype(np.uint8)).convert('RGBA'), 0, 0, 1.0)
    (ROOT / 'public/portraits').mkdir(parents=True, exist_ok=True)
    crops['portrait'][0].convert('RGB').save(ROOT / f'public/portraits/{sheet_id}.png', optimize=True)
    # shelf-pack into one atlas
    W = 1024; x = y = row = 0; place = {}
    for k, (im, *_r) in sorted(crops.items(), key=lambda kv: -kv[1][0].height):
        if x + im.width > W: x = 0; y += row + 2; row = 0
        place[k] = (x, y); x += im.width + 2; row = max(row, im.height)
    atlas = Image.new('RGBA', (W, y + row), (0, 0, 0, 0)); meta = {}
    for k, (im, ax, oy, s) in crops.items():
        px, py = place[k]; atlas.paste(im, (px, py))
        meta[k] = {'x': px, 'y': py, 'w': im.width, 'h': im.height, 'ax': ax, 'oy': oy, 'sc': s}
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / f'{sheet_id}.png', optimize=True)
    (OUT / f'{sheet_id}.json').write_text(json.dumps({'frames': meta}, separators=(',', ':')))
    print(f'  {sheet_id}: {len(meta)} frames, atlas {atlas.width}x{atlas.height}, checker greys {lo}/{hi}')


if __name__ == '__main__':
    ids = sys.argv[1:] or list(CFG['sheets'])
    for i in ids: build(i)
