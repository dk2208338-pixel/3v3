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


def background_mask(a):
    mx = a.max(2); sat = mx - a.min(2)
    lo, hi = checker_colors(mx, sat)
    bglike = (sat <= 8) & (mx >= lo - 10) & (mx <= hi + 12)
    lab, n = nd.label(bglike)
    sizes = nd.sum(bglike, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool); keep[1:] = sizes > 40
    bg = keep[lab]
    # peel edge pixels that are checker grey mixed with a little colour (halo around hair)
    contam = ((sat >= 9) & (sat <= 30) & (mx >= lo - 22) & (mx <= hi + 22)) | ((sat <= 8) & (mx >= lo - 6) & (mx <= hi + 4))
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
    return frames, oy, sc.get('sc', {}), portrait


def build(sheet_id):
    a = np.array(Image.open(ROOT / f'assets/sheets/{sheet_id}.webp').convert('RGB')).astype(int)
    fg, (lo, hi), mx, sat = background_mask(a)
    frames, oys, scs, portrait = resolve(sheet_id)
    effect = set(CFG['effect_frames'])
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
        crops[k] = (Image.fromarray(rgba, 'RGBA'), int(np.median(feet)), int(oys.get(k, 0)), float(scs.get(k, 1)))
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
