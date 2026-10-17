"""Découpe une planche d'animation de coup (grille 4x4 sur fond transparent) en la planche `gold` de assets/fx/vfx/.

Usage : python tools/art/hitsheet_cut.py <planche.png> [assets/fx/vfx/gold.png]

La planche d'origine vient du créateur (16 cases de 1024 px, la première vide) : un éclat jaune en pointes (un grand éclair qui part
vers le haut, des éclats autour), puis des étincelles. On garde les 15 cases utiles, avec leur transparence, posées sur du noir
(l'effet s'ajoute à l'image : le noir reste transparent) et réduites à 448 px. Résultat : 4 colonnes, 15 images.
"""
import json, sys
from PIL import Image

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'assets/fx/vfx/gold.png'
im = Image.open(src).convert('RGBA')
T = im.width // 4                    # la case d'origine
S = 448                              # la case finale
box = (156, 121, 896, 861)           # la zone commune de l'effet dans une case de 1024 (carrée)
k = T / 1024
box = tuple(int(v * k) for v in box)
frames = []
for i in range(1, 16):
    r, c = divmod(i, 4)
    tile = im.crop((c * T, r * T, (c + 1) * T, (r + 1) * T))
    # posée sur du noir avec son canal alpha : c'est lui qui détoure l'effet (sans lui, on voit les couches de remplissage :
    # de gros globules)
    bg = Image.new('RGBA', tile.size, (0, 0, 0, 255))
    bg.alpha_composite(tile)
    frames.append(bg.convert('RGB').crop(box).resize((S, S), Image.LANCZOS))
cols = 4
rows = (len(frames) + cols - 1) // cols
sheet = Image.new('RGB', (cols * S, rows * S), (0, 0, 0))
for i, f in enumerate(frames):
    sheet.paste(f, ((i % cols) * S, (i // cols) * S))
sheet.save(out, optimize=True)
meta_path = out.rsplit('/', 1)[0] + '/vfx.json'
try:
    meta = json.load(open(meta_path))
    meta['gold'] = {'frames': len(frames), 'cols': cols, 'tile': [S, S], 'src': 'hitsheet_cut.py'}
    json.dump(meta, open(meta_path, 'w'), indent=1)
except FileNotFoundError:
    pass
print(out, sheet.size, len(frames), 'images')
