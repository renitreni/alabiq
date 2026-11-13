#!/usr/bin/env python3
"""Generate ALABIQ brand asset versions from the official artwork.

Source: main-logo.png (JPEG 1536x1024, white background, rider mark + wordmark).
Original source file is NEVER modified.
"""
import os
from collections import deque
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/Users/renier.trenuela/www/ALABIQ"
SRC = os.path.join(ROOT, "main-logo.png")
PUBLIC = os.path.join(ROOT, "alabiq-web-main/frontend/public")
ASSETS = os.path.join(ROOT, "alabiq-web-main/frontend/assets")

RED = (230, 43, 37)        # ~#E62B25 from supplied artwork
ORANGE = (249, 115, 22)    # #F97316 existing brand orange
DARK_BG = (12, 16, 24)     # #0C1018 dark splash/portal bg


def load_source():
    return Image.open(SRC).convert("RGB")


def find_content_bbox(im, thresh=240):
    """bbox of pixels NOT near-white (content)."""
    gray = im.convert("L")
    mask = gray.point(lambda p: 255 if p < thresh else 0)
    return mask.getbbox()


def remove_outer_white(im, thresh=245):
    """Flood-fill near-white pixels connected to borders -> transparent.
    Preserves enclosed white details (helmet stripe, white 'A')."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    white = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if r >= thresh and g >= thresh and b >= thresh:
                white[y][x] = True
    visited = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y][x] and not visited[y][x]:
                visited[y][x] = True
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if white[y][x] and not visited[y][x]:
                visited[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and white[ny][nx] and not visited[ny][nx]:
                visited[ny][nx] = True
                dq.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
    # Decontaminate fringe: near-white edge pixels left by anti-aliasing
    # become transparent (a few erosion passes).
    for _ in range(4):
        kill = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                if r < 232 or g < 232 or b < 232:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        kill.append((x, y))
                        break
        if not kill:
            break
        for x, y in kill:
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
    return im


def trim_to_alpha(im, pad=8):
    """Crop tightly to non-transparent content with padding."""
    bbox = im.getchannel("A").getbbox()
    if bbox is None:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def make_transparent_icon():
    """Rider mark only, 512x512 transparent."""
    src = load_source()
    crop = src.crop((430, 220, 1100, 580))          # rider/delivery mark region
    bbox = find_content_bbox(crop)
    crop = crop.crop(bbox)
    icon = remove_outer_white(crop)
    icon = trim_to_alpha(icon, pad=4)
    # pad to square
    w, h = icon.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(icon, ((side - w) // 2, (side - h) // 2), icon)
    canvas = canvas.resize((512, 512), Image.LANCZOS)
    canvas.save(os.path.join(PUBLIC, "alabiq-icon.png"))
    return canvas


def make_full_lockup():
    """Full lockup (mark + wordmark + tagline), transparent bg."""
    src = load_source()
    bbox = find_content_bbox(src)
    crop = src.crop(bbox)
    lockup = remove_outer_white(crop)
    lockup = trim_to_alpha(lockup, pad=12)
    lockup.save(os.path.join(PUBLIC, "alabiq-logo-full.png"))
    return lockup


def make_dark_lockup(lockup):
    """Full lockup recolored for dark backgrounds."""
    px = lockup.load()
    out = lockup.copy()
    opx = out.load()
    for y in range(lockup.height):
        for x in range(lockup.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            # grayscale pixels (black/gray text & shapes) -> white.
            # JPEG-tinted blacks have low absolute chroma; brand reds/oranges
            # have chroma > ~100, so an absolute threshold is robust.
            if mx - mn < 45:
                opx[x, y] = (255, 255, 255, a)
    out.save(os.path.join(PUBLIC, "alabiq-logo-dark.png"))
    return out


def vgradient(size, c_top, c_bottom):
    w, h = size
    im = Image.new("RGB", size)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip(c_top, c_bottom))
        d.line([(0, y), (w, y)], fill=c)
    return im


def make_opaque_icon(icon, path, size, bg):
    """Opaque square icon: brand background + rider mark in maskable safe zone."""
    canvas = bg.convert("RGBA").resize((size, size))
    # safe zone ~80% of canvas, mark occupies ~72%
    mark = icon.resize((int(size * 0.72),) * 2, Image.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    canvas.convert("RGB").save(path.replace(".png", "") + ".png")
    return canvas


def make_splash(path, bg_rgb, lockup):
    """2732x2732 splash: bg color + centered lockup (max width 60%)."""
    size = 2732
    canvas = Image.new("RGBA", (size, size), bg_rgb + (255,))
    max_w = int(size * 0.6)
    ratio = max_w / lockup.width
    lu = lockup.resize((max_w, int(lockup.height * ratio)), Image.LANCZOS)
    canvas.alpha_composite(lu, ((size - lu.width) // 2, (size - lu.height) // 2))
    canvas.save(path)
    return canvas


def main():
    icon = make_transparent_icon()                    # alabiq-icon.png
    lockup = make_full_lockup()                       # alabiq-logo-full.png
    dark_lockup = make_dark_lockup(lockup)            # alabiq-logo-dark.png

    bg_grad = vgradient((512, 512), RED, ORANGE)
    make_opaque_icon(icon, os.path.join(PUBLIC, "favicon.png"), 512, bg_grad)
    make_opaque_icon(icon, os.path.join(PUBLIC, "alabiq-icon-maskable.png"), 512, bg_grad)

    white_bg = Image.new("RGB", (180, 180), (255, 255, 255))
    make_opaque_icon(icon, os.path.join(PUBLIC, "apple-touch-icon.png"), 180, white_bg)

    # Capacitor source assets (preserve exact existing dimensions)
    icon1024 = icon.resize((1024, 1024), Image.LANCZOS)
    icon1024.save(os.path.join(ASSETS, "icon-only.png"))
    icon1024.save(os.path.join(ASSETS, "icon-foreground.png"))
    bg1024 = vgradient((1024, 1024), RED, ORANGE)
    bg1024.convert("RGBA").save(os.path.join(ASSETS, "icon-background.png"))

    make_splash(os.path.join(ASSETS, "splash.png"), (255, 255, 255), lockup)
    make_splash(os.path.join(ASSETS, "splash-dark.png"), DARK_BG, dark_lockup)

    for f in ["alabiq-icon.png", "alabiq-logo-full.png", "alabiq-logo-dark.png",
              "favicon.png", "alabiq-icon-maskable.png", "apple-touch-icon.png"]:
        p = os.path.join(PUBLIC, f)
        print(p, Image.open(p).size, Image.open(p).mode)
    for f in ["icon-only.png", "icon-foreground.png", "icon-background.png",
              "splash.png", "splash-dark.png"]:
        p = os.path.join(ASSETS, f)
        print(p, Image.open(p).size, Image.open(p).mode)


if __name__ == "__main__":
    main()
