# Faire un nouveau perso : la recette (tirée de Kerrian, 17 oct. 2026)

Kerrian a pris une après-midi entière et **95 crédits Meshy** (dont 60 perdus en essais). Avec ce qui suit, le même résultat
se fait en **1 à 2 h** et pour **environ 35 crédits**, en 4 validations du créateur. Ce fichier dit ce qui a marché, ce qui a
raté, et l'ordre à suivre.

## En bref : le chemin qui marche

| # | Étape | Outil | Coût | Validation du créateur |
|---|-------|-------|------|------------------------|
| 1 | Photos de la personne (face, profil, 3/4 dos, visage de près) | vidéo ou photos du créateur → `tools/art/friends/<id>/` (non publié) | gratuit | — |
| 2 | Image du perso, de face, en A-pose | Codex, `tools/art/<id>.sh` (modèle : `tools/art/kerrian.sh`) | gratuit | **oui** : style, tenue, ressemblance |
| 3 | Modèle 3D haute définition | **site de Meshy** (pas l'API, voir plus bas), export FBX texturé | ~30 crédits | **oui** : le modèle sous 4 côtés |
| 4 | Version de jeu : 40 000 triangles, tête plus dense, normal map cuite | Blender, `tools/art/meshy_decimate.py` | gratuit | — |
| 5 | Squelette | `meshy.py rig <id> --file <40k.glb>` | 5 crédits | **oui** (le coût) |
| 6 | Modèle du jeu + clips d'un perso existant | `meshy_pack.py <id>`, `model_clips.py <source> <id>` | gratuit | — |
| 7 | Branchement dans le jeu | tables listées plus bas | gratuit | **oui** : en match |

## 1. Les photos

- Une courte vidéo où la personne tourne sur elle-même suffit pour la tenue : `ffmpeg -i video.mp4 -vf "fps=1/1.5,scale=960:-1" f%02d.jpg`, puis garder une face, un profil et un dos.
- **Pour la ressemblance, il faut des photos du visage de près** (face, profil, 3/4 dos). Avec seulement la vidéo en plan large, Codex a fait un visage générique ; avec les gros plans, il a enfin rendu les yeux verts, les lunettes sans monture, la frange et la nuque.
- Tout va dans `tools/art/friends/<id>/` (ignoré par git : jamais de photo de vraie personne publiée).

## 2. L'image du perso (Codex)

Le CLI Codex existe aussi sur Mac : `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` (sur Windows : `Get-AppxPackage OpenAI.Codex`, voir `friends.ps1`). Syntaxe : `codex exec --skip-git-repo-check -s workspace-write -C <dossier> "<prompt>" -i a.png -i b.png < /dev/null`.

**Ce qui a fait la différence :**
- **Joindre l'image d'un perso déjà dans le jeu comme référence de style et de proportions** (« copy exactly its render style, its level of stylisation and its proportions… only borrow the style, not his face »). Sans ça, Codex revient toujours à des proportions réalistes (petite tête), quoi qu'on écrive (« tête = 1/5 de la hauteur » est ignoré).
- Décrire le visage trait par trait (couleur des yeux, forme des sourcils, nez, type de barbe, lunettes) **et** joindre les gros plans.
- Changer une seule chose à la fois à partir de l'image validée (« Image 1 is the APPROVED design: keep EVERYTHING… Make ONE change: … »). Chaque étape validée est gardée (`base_*.png`) et sert d'image 1 à la suivante : style, puis tenue, puis barbe. On ne repart jamais de zéro.
- Pour un vêtement précis, joindre une photo du vêtement (« like image 2, but WITHOUT ANY LOGO »).
- Les références de style d'une autre œuvre (planche de Batman TAS) ne servent qu'en « light style hint » : en référence forte, elles rendent le visage anguleux et générique.

**Le cadrage pour la 3D :**
- A-pose, bras à 45° bien écartés du corps (« the hands at hip height, far from the thighs »), de face (un léger 3/4 passe sur le site).
- **Pas de lunettes fines ni de petits détails fins** : l'image vers 3D les peint sur la peau ou les colle au visage. Les ajouter en code (comme les accessoires de BIDO) si on y tient.
- Fond gris uni, pas de texte ni de logo, la ressemblance d'abord.

**Les itérations de Kerrian, pour mémoire** (8 images, 0 crédit) : trop réaliste → plus cartoon → Paraboot + cou court + tête Bruce Timm (visage générique) → photos du visage + Nymano en référence (**validée**) → style Smash / MultiVersus → pantalon baggy, veste, tête simplifiée → gilet cargo → barbe moins taillée (**finale**).

## 3. Le modèle 3D : le site de Meshy, pas l'API

Le meilleur modèle n'est pas venu de l'API mais du **site de Meshy** (le créateur l'a lancé lui-même) : 700 000 triangles, textures PBR (couleur, normal, rugosité), visage lisse et vraiment cartoon. Les deux essais par l'API (`meshy.py model`, puis `meshy.py multi` sur des vues face et dos en T-pose) ont donné des visages facettés, des taches noires sur la peau, les lunettes peintes dans le visage et une ressemblance plus faible (**60 crédits pour rien**).

- Sur le site : Image to 3D avec l'image validée, puis exporter en **FBX avec textures** (ou GLB).
- Vérifier le modèle avant toute étape payante : `/tools/dev/modelview.html?glb=<fichier>&shot=<nom>` (4 côtés et le visage, image dans `tools/dev/shots/`).
- Si on passe quand même par l'API : `--ai meshy-6`, sans amélioration d'image (la 7.1 avec amélioration a déjà fait quatre persos en un) ; ses normales sont « dures », à lisser avec `python3 tools/art/smooth_normals.py in.glb out.glb` (gratuit).

## 4. La version de jeu (Blender, gratuit)

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/art/meshy_decimate.py -- <export.fbx> tools/art/meshy/<id>/user/model_40k.glb --faces 40000 --bake 2048
```

- Une réduction simple à 30 000 triangles **fait perdre le côté cartoon** (visage anguleux, yeux plats, plus d'ombrage doux).
- La bonne version : 40 000 triangles dont 30 % pour la tête (`--headshare 0.3` : deux fois plus dense que le reste du corps) et une **normal map cuite depuis la haute définition** (`--bake`). Le rendu est alors presque identique à l'original. Le jeu lit cette normal map (`rigModel.js`).
- Le script éteint l'émission du matériau importé (sinon le modèle sort tout blanc) et ne garde que la couleur (la normal map et la rugosité de Meshy étaient faites pour la haute définition).
- Comparer à l'original sur la même planche avant de rigger.

## 5. Le squelette (5 crédits)

```bash
source ~/.zshrc   # MESHY_API_KEY, jamais écrite dans le projet
python3 tools/meshy/meshy.py balance
python3 tools/meshy/meshy.py rig <id> --file tools/art/meshy/<id>/user/model_40k.glb --height 1.85
```

- Donne `rig.glb` (24 os Meshy, la normal map gardée) et une marche et une course offertes (`basic_walking.glb`, `basic_running.glb`).
- `--file` copie le modèle dans `tools/art/meshy/<id>/model.glb` (il écrase celui d'un essai précédent : le renommer d'abord).
- Lire le solde avant et après (le journal `tools/meshy/ledger.jsonl` note chaque tâche).

## 6. Le modèle du jeu et ses animations (gratuit)

Les outils Python ont besoin de numpy et Pillow. Sur ce Mac, ils sont dans un environnement à part (Python Homebrew « externally managed ») :

```bash
python3 -m venv ~/.venvs/spooky && ~/.venvs/spooky/bin/pip install numpy Pillow
```

1. Une entrée dans `CHARACTERS` de `tools/art/meshy_pack.py` : `'<id>': {'height': 1.85, 'files': {'basic_walking': ['walk'], 'basic_running': ['run']}}`, puis `python tools/art/meshy_pack.py <id>` → `assets/models/<id>.glb`.
2. **Reprendre les clips d'un perso existant**, déjà recalés et avec leurs miroirs : `python tools/art/model_clips.py bido <id> --keep walk,run` (74 clips en 40 s). C'est bien plus simple que de transférer depuis les sources (`meshy_transfer.py` exige que chaque fichier de clips ait le même ordre de nœuds que le squelette source, et les sources Mixamo ne sont pas sur toutes les machines). **À relancer après chaque `meshy_pack.py`**, qui reconstruit le modèle sans ces clips.
3. Vérifier les clips : `/tools/dev/clipview.html?glb=/assets/models/<id>.glb&clips=idle,walk,m_dumbbell&shot=<nom>`.

## 7. Le branchement dans le jeu

**Obligatoire :**
- `src/sim/chars/<id>.js` (id, name, title, color, stats, moves, specialsInfo), puis `src/sim/chars/index.js` (import, `CHARS`, `CHAR_ORDER`).
- **Reprendre le moveset d'un autre perso** : jamais en partageant le même objet (les passes d'init `archetypes`, `specialTuning`, `reachFit` modifient les coups sur place : le B haut de BIDO aurait été boosté deux fois). Le perso source exporte une fabrique (`bidoMoves()` dans `bido.js`) et chacun appelle la sienne.
- `RIGS.<id>` : pour un moveset emprunté, `FRIEND_RIGS.<id> = { ...FRIEND_RIGS.<source>, h, sockets }` (`friendRigs.js`), avec la paume mesurée sur son squelette (`HAND.<id>`, position de repos du bout de l'os `hand.R` + ~10 cm dans l'axe de l'avant-bras ; un rig Meshy est en T-pose au repos).
- `NATIVE_MOVES.<id> = NATIVE_MOVES.<source>`, `EMOTES`, `RUN_OF` (fin de `nativeMoves.js`).
- Portrait : `/tools/dev/portrait.html?glb=/assets/models/<id>.glb&clip=idle&t=0.5&shot=<id>_portrait`, puis copie dans `assets/ui/portraits/<id>.png` (l'écran VS et le HUD le lisent aussi).

**Réglages (sinon des valeurs par défaut) :** `ARCHETYPE` (`archetypes.js`), `SPECIAL_TUNING` et `RECOVERY` (`specialTuning.js`), `REACH_FIT` (`reachFit.js`, à mesurer sur son modèle avec `tools/dev/reachcheck.js`), `T` (`ultKit.js`, son ultime).

**Saveur (facultatif) :** `LINES` / `WILD` du bar (`barLines.js`), commentateur (`KO_BY`), toktok (`ACCOUNTS`), son `choose_<id>`.

**La grille de sélection** : 8 colonnes, 24 cases au plus (`GRID_COLS`, `GRID_STEP`, `screens.js`) ; au-delà, revoir sa taille.

## 7 bis. Les animations à lui (Meshy, sur son rig)

- **D'abord gratuit** : les clips des persos déjà dans le jeu (`model_clips.py <source> <id> --only …`). Skanky (Meshy) a jabs, coups de pied, uppercut, aériens, projections ; BIDO (Tripo) ses coups de muscu, les sauts et chutes Mixamo, les émotes. Leurs réglages (`from/strike/to`) se reprennent tels quels de leur `NATIVE_MOVES`.
- **Bibliothèque Meshy** (3 crédits l'action, jusqu'à 10 par lot, une tâche) : chercher gratuitement dans `meshy.py library` (678 actions ; `tools/art/meshy/library.json`). Pour Kerrian : crochets (195, 193), genou (211), lancer par-dessus l'épaule (421), frappe au sol chargée (127). Attention aux faux amis : « Charged Axe Chop » est une hache à une main.
- **Texte vers mouvement** (13 crédits, 2 à 10 s par pas de 0,5 s ; une durée hors de ces bornes est refusée sans débit) : injection, café jeté, dash, suplex, bazooka, hache à deux mains. Décrire le geste pas à pas, « standing in place ». Un clip qui vole à plat (le dash a été rendu à l'horizontale, façon Superman) se redresse gratuitement avec `derive` de `meshy_pack.py` (`tilt: 0.1`, `still: True`).
- Les fichiers `anims/<nom>.glb` deviennent `m_<nom>` ; les lots nommés vont dans `files`. Après chaque achat : `bash tools/art/kerrian_pack.sh` (le pack, puis les copies de BIDO et de Skanky).
- Caler un clip : planche `clipview.html?…&n=16&yaw=70` (image i au temps `i / (n − 1) × durée`), puis `keys: [[image du coup, temps du clip], …]` ou `from/strike/to`. Un coup qui a deux animations selon le cas (l'injection ou la fléchette) se coupe en deux coups (`sp_n` lance `insulin`) ; une projection, par sa direction (`byKind`).
- Coût réel de Kerrian : 18 (lot) + 6 × 13 (textes) = 96 crédits d'animations.

## 8. Les vérifications

- Match CPU : `?quick=1&chars=<id>,bido&humans=0&stage=cemetery&mute=1` avec un écouteur `error` / `unhandledrejection`.
- Coups image par image : `posecheck.js` (`P.strip`) dans une page **visible** (une fenêtre cachée ne fait plus avancer le jeu ; ne charger `posecheck.js` qu'une fois par page, sinon la boucle se bloque), et l'enregistrer sous 8 Mo (le serveur refuse au-delà : la réduire sur un canevas puis `POST /__shot/<nom>.png`). Comparer au perso source : un coup lancé de force sans charge a le même air bizarre chez lui.
- Rollback : `node tools/dev/rollbackcheck.mjs 6 900 1` (le perso doit apparaître dans les combinaisons tirées).

## Ce qu'il ne faut plus refaire

- **Retoucher le visage d'un modèle déjà riggé** (joues, sourire, barbe : le script `kerrian_face.py`, non publié). Le relief de la moustache et le froncement sont dans la forme et dans la normal map : le sourire ne se voyait pas, et le créateur a préféré l'original. Une expression se règle **dans l'image de départ**, avant Meshy.
- Lancer l'API Meshy pour gagner du temps : le site a donné un bien meilleur modèle pour le même prix.
- Envoyer des vues T-pose générées à part (face et dos) : Codex change le visage d'une vue à l'autre.
- Repérer des points du visage à l'œil sur une capture : rendre une vue de face avec une grille en mètres (la bouche de Kerrian était 7 mm plus haut que l'estimation).

## Pour aller encore plus vite

- Un seul script `tools/art/new_char.sh <id> <export.fbx> <source>` qui enchaîne les étapes gratuites 4 et 6 (réduction, puis après le rig : pack, clips, portrait) et s'arrête avant chaque étape payante.
- Un gabarit de prompt Codex commun (A-pose, style « comme <perso du jeu> », ressemblance d'après les gros plans) au lieu d'un script par perso.
- Une fabrique de moveset pour chaque perso (comme `bidoMoves()`), pour qu'un nouveau perso emprunte n'importe quel moveset en une ligne.
- Mesurer `HAND.<id>` automatiquement depuis le squelette au lieu de l'écrire à la main.
