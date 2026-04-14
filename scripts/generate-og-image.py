#!/usr/bin/env python3
"""
Generates public/og-image.png (1200x630) for ChurchOpsHub social sharing.
Run: python3 scripts/generate-og-image.py
Requires: pip install Pillow
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

# Brand colors
NAVY       = (27,  42,  74)
NAVY_LIGHT = (38,  58,  100)   # subtle highlight for background depth
TEAL       = (42,  125, 110)
TEAL_DIM   = (30,  90,  80)
GOLD       = (212, 168, 67)
WHITE      = (255, 255, 255)
OFF_WHITE  = (240, 238, 230)
MUTED      = (160, 175, 200)

# ── Background ────────────────────────────────────────────────────────────────
img  = Image.new('RGB', (W, H), NAVY)
draw = ImageDraw.Draw(img)

# Subtle radial-ish gradient suggestion: lighter circle behind the icon area
for r in range(260, 0, -1):
    t = r / 260
    c = tuple(int(NAVY[i] + (NAVY_LIGHT[i] - NAVY[i]) * (1 - t)) for i in range(3))
    draw.ellipse([W - 340 - r, H//2 - r, W - 340 + r, H//2 + r], fill=c)

# ── Left teal accent bar ───────────────────────────────────────────────────────
draw.rectangle([0, 0, 10, H], fill=TEAL)

# ── Fonts ─────────────────────────────────────────────────────────────────────
FONT_PATH = '/System/Library/Fonts/HelveticaNeue.ttc'
try:
    font_label    = ImageFont.truetype(FONT_PATH, 22,  index=1)  # bold small
    font_heading  = ImageFont.truetype(FONT_PATH, 82,  index=1)  # bold large
    font_tagline  = ImageFont.truetype(FONT_PATH, 36,  index=0)  # regular
    font_url      = ImageFont.truetype(FONT_PATH, 26,  index=1)  # bold small
except Exception:
    font_label   = ImageFont.load_default()
    font_heading = ImageFont.load_default()
    font_tagline = ImageFont.load_default()
    font_url     = ImageFont.load_default()

# ── Text block (left-aligned, vertically centered in left 640px) ─────────────
TEXT_X = 72
TEXT_MID_Y = H // 2   # 315

# Label: "CHURCH OPERATIONS" in teal
label = "CHURCH OPERATIONS HUB"
draw.text((TEXT_X, TEXT_MID_Y - 120), label, font=font_label, fill=TEAL)

# Teal rule under label
rule_y = TEXT_MID_Y - 88
draw.rectangle([TEXT_X, rule_y, TEXT_X + 480, rule_y + 3], fill=TEAL)

# Heading: "ChurchOpsHub"
draw.text((TEXT_X, TEXT_MID_Y - 82), "ChurchOpsHub", font=font_heading, fill=WHITE)

# Tagline
tagline = "Inventory · Maintenance · Operations"
draw.text((TEXT_X, TEXT_MID_Y + 48), tagline, font=font_tagline, fill=MUTED)

# URL
draw.text((TEXT_X, TEXT_MID_Y + 130), "churchopshub.com", font=font_url, fill=TEAL)

# ── Icon (right side, centered around 920, 315) ───────────────────────────────
# Scaled from the 64x64 SVG favicon at ~7× scale.
# SVG arc centers and radii scaled to OG coords:
#   SVG center = (32, 32) → OG icon center = (920, 315)
#   scale = 7

def svg_to_og(sx, sy, scale=7, cx=1010, cy=315, svg_cx=32, svg_cy=32):
    return (cx + (sx - svg_cx) * scale, cy + (sy - svg_cy) * scale)

scale = 7

# ── Big teal arc (left-facing C, center at SVG 22,30 r=20) ──────────────────
arc1_cx, arc1_cy = svg_to_og(22, 30)
arc1_r = 20 * scale  # 140
arc1_w = round(5.5 * scale)  # 38
draw.arc(
    [arc1_cx - arc1_r, arc1_cy - arc1_r, arc1_cx + arc1_r, arc1_cy + arc1_r],
    start=40, end=320, fill=TEAL, width=arc1_w,
)

# ── Inner gold arc (center at SVG 26,29 r=12) ────────────────────────────────
arc2_cx, arc2_cy = svg_to_og(26, 29)
arc2_r = 12 * scale  # 84
arc2_w = round(3 * scale)  # 21
draw.arc(
    [arc2_cx - arc2_r, arc2_cy - arc2_r, arc2_cx + arc2_r, arc2_cy + arc2_r],
    start=40, end=320, fill=GOLD, width=arc2_w,
)

# ── Teal center dot (SVG 36,29 r=4.5) ────────────────────────────────────────
dot_cx, dot_cy = svg_to_og(36, 29)
dot_r = round(4.5 * scale)
draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=TEAL)

# ── Gold accent dots (SVG 46,16 and 46,42 r=3.5) ─────────────────────────────
for svg_x, svg_y in [(46, 16), (46, 42)]:
    gx, gy = svg_to_og(svg_x, svg_y)
    gr = round(3.5 * scale)
    draw.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=GOLD)

# ── Save ──────────────────────────────────────────────────────────────────────
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'og-image.png')
img.save(os.path.abspath(out), 'PNG', optimize=True)
print(f"✓ og-image.png ({W}×{H})")
