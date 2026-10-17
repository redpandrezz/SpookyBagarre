# Fabrication des personnages 3D

Chaîne utilisée pour les 9 personnages et le chat de la Folle Du Bus. Tout se relance avec les scripts de `tools/`.

## 1. Images de référence (Codex)

- `tools/art/refs.ps1` : une planche de personnage par monstre (`tools/art/refs/<id>.png`).
- `tools/art/apose.ps1` : une image de face, en A-pose, mains vides (`tools/art/apose/<id>.png`). C'est ce qui se rigge le mieux.
- `tools/art/props.ps1` : créatures et accessoires (le chat : `tools/art/props/cat.png`).
- Si Codex dit qu'il n'a pas pu enregistrer le fichier, `python tools/art/recover.py <log> <dossier>` le récupère dans `~/.codex/generated_images`.

## 2. Modèle 3D (Tripo)

`tools/tripo/tripo.ps1 model -Id <id> -Image tools/art/apose/<id>.png -Out tools/art/tripo -Faces 16000 -Estimate 30`

- 30 crédits par modèle (v3.0, texture standard). La clé est lue dans la variable Windows `TRIPO_API_KEY`, jamais écrite dans le projet.
- Le script refuse de descendre sous un plancher de crédits ; chaque tâche est notée dans `tools/tripo/ledger.jsonl`.
- Ne pas relancer une génération ratée sans en parler.

## 3. Mesure et squelette (Blender, en arrière-plan)

Tous les scripts se lancent avec `tools/blender/run.ps1 <script>.py --id <id> ...` (Blender 5).

1. `yaw.py --id <id> --height <m> --rotz -90` : les modèles sortent un peu tournés ; donne l'angle pour les remettre de face.
2. `prep.py --id <id> --height <m> --rotz <deg> [--dx --dy]` puis `python tools/blender/grid.py <id>` : vues de face, profil, dos, dessus avec une grille en mètres (`tools/blender/work/<id>/grid.png`).
3. On lit les articulations sur la grille et on écrit `tools/blender/rigs/<id>.json` : hauteur, rotation, os (`head`/`tail` en mètres, Blender : x = gauche du perso, y = dos, z = haut). Les os `.L` sont recopiés en `.R` automatiquement. Os possibles en plus du corps : `jaw`, `belly`, `tail1..4`, `ear.L`, `hat`, `dorsal`, jambe arrière `thigh.B/shin.B/foot.B`.
4. `rig.py --id <id>` : construit le squelette, calcule les poids (heat weights, ou maillage voxel de secours), rend des poses de test, exporte `assets/models/<id>.glb` (maillage skinné, sans animation).
5. `python tools/blender/sheet.py <id>` : planche des poses de test pour vérifier les déformations.
6. `portrait.py` : portraits des menus (`assets/ui/portraits/<id>.png`).
7. `prop.py --id cat --size 1.0 --rotz -90` : accessoires et créatures statiques (`assets/models/cat.glb`).

## Pandrezz, CD-Man et Vinylman

- `tools/art/pandrezz.ps1` : images Codex d'après les artworks de PANDREZZ copiés dans `tools/art/refs/pandrezz_*.png` (A-pose de Pandrezz dans `tools/art/apose/`, vues de face de CD-Man et Vinylman dans `tools/art/refs/`). Codex n'arrive souvent pas à enregistrer : l'image est dans `~/.codex/generated_images`.
- Pandrezz : Tripo (30 crédits) puis la chaîne habituelle (`rigs/pandrezz.json`, rotz -70).
- CD-Man et Vinylman ne sont pas riggés : `python tools/art/buddy_faces.py` découpe leurs visages-disques dans les images Codex, puis `run.ps1 buddies.py` les modélise en formes simples (torse, tête, bras et jambes séparés, pivots aux épaules et aux hanches) et exporte `assets/models/cdman.glb` / `vinylman.glb`. Le jeu les anime pièce par pièce (`src/render/pandrezzView.js`) ; leur tête-disque reste tournée vers la caméra.
- Le kamehameha (boule d'énergie entre les mains, rayon) est dessiné par des shaders dans `src/render/pandrezzView.js`, sans texture.

## Les sept potes (Aboueb, Tices, OMFU, Lolobiscotto, J'san, Nymano, BIDO)

- Photos d'origine dans `refs personnages/` (copiées en `tools/art/friends/<id>.png`) ; `tools/art/friends.ps1` en tire une A-pose cartoon par Codex (`tools/art/apose/<id>.png`), plus le shiba et le chat gris (`tools/art/props/`).
- Tripo : un modèle détaillé par perso (40 crédits), puis `yaw.py`, `prep.py`, `grid.py`.
- Squelettes : `python tools/blender/rigs/make_friends.py [ids]` écrit `rigs/<id>.json` à partir d'une dizaine de points lus sur la grille (épaule, coude, poignet, main, hanche, genou, cheville, base du cou), puis `rig.py` et `sheet.py` pour vérifier les pliages.
- Shiba et chat gris : `prop.py --id shiba --size 0.9 --rotz -90`, `prop.py --id greycat --size 1.0 --rotz -30`.
- Accessoires (couscous, flammekueche, bouteilles, cowbell, platines, enceinte, skate, haltères, ballon-cœur, tapis volant, boucles d'Aboueb) : formes construites dans `src/render/friendsView.js`, tenues en main ou posées sous les pieds par `src/render/rig/friendRigs.js` ; chacune n'apparaît que pendant le coup qui lève son drapeau `F.va[i]` (posé par `src/sim/chars/<id>.js`).
- Vérifier un coup image par image dans la console : `const P = await import('/tools/dev/posecheck.js'); await P.ready(); P.go(0, 'smash', 10, 6, 1.0, 8)` (dans une partie `?quick=1&chars=...&humans=1&dev=vpad0&bot=0`).

## Animations de base (Tripo)

- Le modèle de J'san a été riggé par Tripo (`rig`, 25 crédits), puis 10 animations achetées dessus (`retarget`, 10 crédits chacune, en place) : `idle`, `walk`, `run`, `jump`, `fall`, `box_01`, `hurt`, `flip`, `victory_celebration`, `hit_to_body_01` (`tools/art/tripo/anims/anims_base.glb`, `anims_fight.glb`). La liste des 90+ animations de bipède est sur developers.tripo3d.com, « Animation Retarget » (préfixe `preset:biped:`, rig v1.0).
- `python tools/art/anim_dirs.py tools/art/tripo/anims/*.glb` les convertit en directions d'os, image par image (`assets/anims/clips.json`) : une direction ne dépend pas des proportions, donc les mêmes clips animent les 16 persos. Le script remet aussi face à l'adversaire les clips tournés de côté.
- Deuxième lot de 10 (`anims_strikes.glb`, `anims_more.glb`) : `box_02`, `box_03`, `front_kick_01`, `front_kick_02`, `chop`, `slash`, `pitch_baseball`, `volleyball`, `hit_to_head`, `hit_to_side`. Les coups qui les jouent sont dans `CLIP_MOVES` (`poser.js`) : un segment du clip (images `from` → `strike` → `to`) étiré sur le coup, la frappe calée sur la hitbox, rejoué en miroir pour frapper avec le bras côté caméra. Le coup de fesse et le coup de tête sont des poses à la main (`library.js`, `buttbump`, `headbutt`, `headbuttUp`).
- `src/render/rig/clips.js` les lit ; `poser.js` s'en sert sous les coups : attente (mêlée à la garde du perso), marche et course au rythme des pas, réaction aux coups légers. Les attaques restent en images clés procédurales.

## Les 8 persos riggés par Tripo, avec leurs propres clips (14 octobre 2026)

Aboueb, Tices, OMFU, Lolobiscotto, J'san, Nymano, BIDO et Pandrezz ont chacun leur squelette Tripo (`tools/art/tripo/anims/<id>_rig.glb`) et jouent leurs clips tels quels (pas de conversion en directions).
- `python tools/art/tripo_pack.py <id> ...` écrit `assets/models/<id>.glb` : le modèle tourné face à +Z, mis à sa taille, avec 45 à 47 clips transférés os par os depuis le squelette de J'san (lots partagés `anims_*.glb`), plus les clips Uthana du perso. Copies en miroir (`<clip>__m`) pour frapper du bras côté caméra. `DRIFT` réduit le glissement au sol des clips qui avancent beaucoup.
- `src/render/rig/nativeClips.js` mélange ces clips (fondus) par-dessus la pose procédurale ; `poser.js` (`nativeLayers`) choisit lesquels jouent : attente, marche, course, réactions, `CLIP_MOVES` (coups Tripo) et `NATIVE_MOVES` (`nativeMoves.js`).
- Uthana (text-to-motion, uthana.com) : `python tools/uthana/uth.py ttm <character_id> <secondes> text-to-motion-bucmd "<prompt>" <out.glb>`. Clé dans la variable utilisateur Windows `UTHANA_API_KEY` (jamais dans le projet). Le squelette de J'san y est chargé tel quel (personnage `cpKDQb6DXVnt`), donc les clips sortent sur les mêmes noms d'os. Mettre le `.glb` dans `tools/art/uthana/` : `<id>_<nom>.glb` va au perso `<id>`, un nom sans préfixe va à tous ; ils deviennent `u_<nom>`, remis face à l'avant (moyenne du bassin). 0,03 $ la seconde.
- `NATIVE_MOVES` (par perso et par coup) cale un clip sur un coup : `from/strike/to` (en secondes, la frappe tenue pendant la hitbox) ou `keys: [[image du coup, temps du clip], ...]` pour les spéciaux qui lancent un projectile à une image donnée. `NATIVE_POSES` : coups partagés (coup de tête de fin de combo).
- Les planches de contrôle : `run.ps1 clipsheet.py --id <id> --shots "u_x:0.1,u_x:0.35,..."` (à lancer depuis Bash : PowerShell en français écrit `0,35`).
- Piège corrigé : ces modèles ont un nœud `Armature` tourné ; l'os `Root` est relatif à lui (`Rig.rest[...].preInv`, `animator.js`). Sans ça, la rotation de l'Armature était appliquée deux fois et les persos tournés à gauche montraient leur dos.

## Epektase, fait avec Meshy, avec son propre jeu d'animations (14 octobre 2026)

Le premier perso dont toutes les animations sont à lui seul (aucun clip partagé avec les autres) : coups, spéciaux, et aussi les états (saut, garde, esquives, rebord, au sol, relevé, étourdi).
- `tools/meshy/meshy.py` (clé `MESHY_API_KEY` dans les variables utilisateur Windows, jamais dans le projet ; journal `tools/meshy/ledger.jsonl`, non publié ; refuse de descendre sous un plancher de crédits) : `balance`, `library` (678 actions, gratuit), `model <id> <image>` (image vers 3D, 30 crédits : meshy-6, sans « amélioration d'image »), `rig <id>` (5 crédits, donne aussi marche et course), `anim <id> <nom> <ids>` (actions de la bibliothèque, 3 crédits chacune, jusqu'à 10 par lot), `motion <id> <nom> <s> "<texte>"` (texte vers animation).
- Piège : meshy-7.1 avec l'amélioration d'image a fait d'une seule image de pose en T **quatre** copies du perso dans un même modèle. `check_single` mesure le modèle (épaisseur / hauteur) et `rig` refuse s'il ne ressemble pas à un seul perso. Vérifier chaque étape payante avant la suivante.
- Les animations achetées sur ce mauvais rig ont été gardées : `python tools/art/meshy_transfer.py <rig source> <rig cible> <sortie> <clips...> --pack epektase` les transfère gratuitement sur un autre squelette (Meshy ou Tripo). Il ne lit que les positions animées des os (chaque os pointé vers son enfant, bassin et colonne orientés par deux directions), pas la pose de repos de la source (celle du mauvais rig était tordue) ; la tête et les poignets sont calés sur une attente neutre (`m_idle0`). Planche de contrôle : `/tools/dev/clipview.html?glb=<fichier>&clips=a,b,c&shot=<nom>`.
- `python tools/art/meshy_pack.py epektase` écrit `assets/models/epektase.glb` (os renommés aux noms du jeu, clips en place, textures 1024). `CHARACTERS[...]['derive']` découpe des extraits dans les longues prises (boucles fondues, versions « sur place » pour l'air, `endRest` qui finit debout, `tilt` qui redresse un clip couché : la glisse d'Anbuu). `--prop guitar` empaquette un accessoire Meshy dans `assets/models/props/`.
- Le jeu : `src/sim/chars/epektase.js` (coups), `src/render/rig/epektaseRig.js` (la guitare en hache ou jouée sur le torse, le carré Hermès en ruban de soie, les notes), `NATIVE_MOVES.epektase` et `NATIVE_STATES` (`nativeMoves.js`, lus par `poser.nativeLayers`). Portrait : `/tools/dev/portrait.html?glb=...&clip=m_idle0&shot=<nom>`, puis réduit en p40 / p64 comme les autres (`ui_kit.py`).
- Vues de contrôle sans crédit : `/tools/dev/modelview.html?glb=<modèle>&shot=<nom>` (4 côtés et le visage).

## PPROD, le 2e perso Meshy (15 octobre 2026)

Même chaîne qu'Epektase, sans raté cette fois (241 crédits) : modèle (30, meshy-6 ; Meshy l'a mis en pose A, bon pour le rig), rig (5), 4 lots de 10 actions de la bibliothèque choisies pour leur allonge (120 : états, réactions, coups de poing et de pied tendus, lancers, assis sur une chaise, glissade), 2 animations par texte (26 : il code assis sur sa chaise, l'émote de sélection), chaise gamer et PC portable (60 : images de référence par Codex, `tools/art/pprod.ps1`, puis `meshy.py model <id> <image> --pose none`, empaquetés par `meshy_pack.py --prop`).
- Ce qui est fait en code (gratuit) : pièces, liasses, pizza, spaghettis (l'assiette sous ses pieds quand il court, la flaque glissante qu'il laisse), les bugs qui sortent du PC, la fenêtre 404.
- Les aperçus de la bibliothèque (`preview_url`, des GIF) se regardent gratuitement avant d'acheter : une page avec les `<img>` dans `tools/dev/shots/`.

## SKANKY, le 3e perso Meshy (15 octobre 2026)

Même chaîne (208 crédits) : modèle (30), rig (5), 4 lots de la bibliothèque (117 : états, réactions, trois façons de parler en gesticulant, saut d'obstacle, les coups de PPROD, aériens, danses, glissade), 2 animations par texte (26 : la funk de Lyon, l'ollie en skate), le train (30 : image par Codex, `tools/art/skanky.ps1`, puis `--pose none` et `meshy_pack.py --prop train`).
- Gratuit : le skate est celui de Nymano (`props/skate.glb`), la course est la posture accroupie de l'ollie, le portique et les bulles de mots sont faits en code.
- Allonge mesurée (`reachcheck.js fitTable`) et ajoutée à `reachFit.js` ; équilibrage (800 matchs) : +0,04 après avoir calmé le train.

## L'allonge des coups normaux (14 octobre 2026)

Les zones de frappe allaient 0,7 à 1,9 m plus loin que la main ou le pied, à l'image du coup : les persos avaient l'air recroquevillés. Maintenant :
- `src/render/rig/reach.js` : pendant la frappe, le membre le plus proche de la zone (choisi une fois par coup), ou l'arme du perso (`cfg.reach` : guitare d'Epektase, batte de Tung), est tendu vers le bout de la zone (IK à deux os, l'arme alignée sur le bras), le buste se penche, et le corps avance jusqu'à 0,5 m (à l'affichage seulement). Les coups de tête et de fesse du kit commun ne sont pas étirés.
- `src/sim/chars/reachFit.js` : les zones qui dépassaient encore beaucoup sont ramenées au membre tendu + 0,3 m (jamais sous 65 % de l'ancienne portée, boules de 0,6 m au plus). Équilibrage remesuré (800 matchs, deux graines) : de -0,34 à +0,54 (avant : -0,43 à +0,47).
- Epektase : en plus, de nouveaux clips achetés sur son rig propre (combo à une main pour les jabs, fouet au carré Hermès, Spartan kick, balayage ; 28 crédits).
- Contrôle : `const C = await import('/tools/dev/reachcheck.js')` dans un match de test avec `posecheck.js` : `C.sheet(P, [[slot, coup, titre], ...], 'nom')` (planche, zones en rouge), `C.measure(P, slot)`, `C.fitTable(P, [0, 1, 2, 3])`.

## Nuit du 14 octobre 2026 : les 16 avec des clips, les accessoires en 3D, les impacts

- Tripo : 41 animations de plus achetées sur le rig de J'san (`anims_move2`, `anims_fear`, `anims_atk1/2`, `anims_dance`, `anims_feel`, `anims_emote1/2/3`). `tripo_pack.py` ne garde que les clips que le jeu joue (`used_clips()` lit `poser.js` et `nativeMoves.js` : `clip: '...'`, `emote: '...'`) et range les rotations en int16 (moitié du poids).
- `python tools/art/legacy_pack.py frog micron ...` : les 8 premiers persos (squelettes Blender) reçoivent les mêmes clips, transférés os par os sur leur propre squelette (queues, mâchoires, ventres et oreilles gardent leurs ressorts). Originaux dans `tools/art/legacy_old8/`. Aucun crédit.
- Uthana : `python tools/uthana/batch_night.py` (liste `JOBS`, s'arrête avant de vider le solde). Un clip `<perso>_<nom>.glb` va au perso, `<nom>.glb` à tous. Les coups de course qui avancent beaucoup sont ancrés (`DRIFT`, 20 % pour `*_dash`).
- `NATIVE_MOVES` (`nativeMoves.js`) : coups de course, spéciaux et smashs calés sur ces clips ; `EMOTES` : l'émote jouée quand on choisit le perso, et sa danse de victoire sur l'écran des résultats.
- Accessoires 3D : `tools/art/props3d.ps1` (images de référence par Codex), puis Tripo `image_to_model` (30 crédits, texture standard, 3000 faces) vers `assets/models/props/<nom>.glb`. `src/render/propModels.js` (`fitProp`) remplace chaque forme simple par son modèle, à la même taille et au même endroit, axes alignés (le plus long sur le plus long). Corrections au cas par cas dans `FIX` (`up: true` garde debout les objets presque cubiques : cloche, kettlebell, seau ; `rot` retourne la batte et la râpe pour que le manche soit dans la paume) ou dans `FRIEND_PROPS`. Les 22 accessoires ont leur modèle ; planche de contrôle : `const S = await import('/tools/dev/propsheet.js'); S.show()` dans un match.
- Codex copie mal ses images : `python tools/art/codex_recover.py <dossier> [noms]` les retrouve dans ses sessions du jour.
- Sprites d'impact : `tools/art/hitfx.ps1` (Codex, fond magenta) puis `python tools/art/hitfx_cut.py` vers `assets/fx/` ; affichés par `src/render/hitSprites.js` (éclat, explosion, entaille, éclair, anneau, traînée), courts et nets.
- Équilibrage : `const B = await import('/tools/dev/balance.js'); const r = await B.run({ matches: 80, secs: 150, lvl: 3 })` (matchs CPU sans affichage : dégâts et éjections par usage de chaque coup) ; les temps de recharge sont dans `src/sim/chars/specialTuning.js`. Mesure : différence éjections - chutes par match, sur 800 matchs CPU (deux graines). Après les passes de la nuit, tous les persos sont entre -0,28 et +0,39 (les bots jouent mal J'san, dont les smashs dépendent du chien).

## Grande passe des 12 potes (16 octobre 2026)

Pandrezz, Aboueb, Tices, OMFU, Lolobiscotto, J'san, Nymano, BIDO, Epektase, PPROD, Skanky et Anbuu : de nouveaux coups, chacun avec son clip et ses effets. Le cahier des charges perso par perso est dans `tools/art/meshy/GRANDE_PASSE.md` (non publié). 894 crédits Meshy en tout.

- Clips sur mesure : Meshy texte vers mouvement (`python tools/meshy/meshy.py motion <id> <nom> <secondes> "<description>"`, payant, une étape à la fois, vérifiée sur `/tools/dev/clipview.html` avant la suivante). Pour les persos Meshy, sur leur propre squelette (`anims/<nom>.glb`, puis `meshy_pack.py <id>`). Pour les Tripo et les Blender, achetés une fois sur Skanky, transférés gratuitement sur le squelette de J'san (`meshy_transfer.py tools/art/meshy/skanky/rig.glb tools/art/tripo/anims/jsan_rig.glb tools/art/tripo/anims/anims_meshy.glb <clips...> --pack skanky --ref idle --only m_a,m_b`), puis `tripo_pack.py` et `legacy_pack.py`. Un clip mal transféré se rachète une fois au plus (le crochet d'OMFU : `m_uppercut2`).
- `used_clips(cid)` ne garde dans chaque modèle que ses clips à lui (blocs de `NATIVE_MOVES` / `NATIVE_STATES`) ; les `EMOTES` et les noms cités par les mini-jeux (`src/render/mg/`), les marionnettes, le bar et la vitrine restent dans tous. Poids des modèles à peu près inchangé (+1 à 3 %).
- Accessoires Meshy : images de départ par Codex (`tools/art/props3d_b.ps1`, `tools/art/props3d/*.png`), image vers 3D (`meshy.py model <id> <image> --pose none`, 30 crédits), empaquetés par `meshy_pack.py --prop <nom>` vers `assets/models/props/` : `cap` (la casquette de Tices, teintée), `poop` (la crotte du shiba), `coin`, `coinpile`, `billwad`, `diamond`, `goldbar` (le butin de PPROD), `monitor` et `crtpc` (ses écrans), `mic` (le micro de Skanky). `PROP_NAMES` et `FIX` dans `propModels.js`, formes de secours et objets dans `src/render/passView.js`.
- Effets (`src/render/passFx.js`) : petits et brefs comme le reste (rien ne couvre l'écran). Les anneaux en l'air font face à la caméra (`shockRing(..., true)`) ; seuls ceux posés au sol restent à plat. Vérification image par image : `tools/dev/passcheck.js` (`film`, `sheet` avec les zones de frappe en rouge, `trace`).

## Décors des arènes

- `tools/art/stages.ps1` : pour chaque arène, le sol vu du dessus (`<id>_top`), un panorama peint (`<id>_sky`) et une planche de 6 accessoires sur fond magenta (`<id>_props`).
- `python tools/art/stage_prep.py` : `assets/stages/<id>/top.jpg` et `sky.jpg`. `python tools/art/cutout.py <id>` : découpe les accessoires (`prop0..5.png`, `props.json`).
- `src/render/stages/painted.js` (table `ART`) : cadrage du panorama, fondu du sol lointain, brumes, rayons de lune, accessoires debout autour des arènes basses (`cards`) ou sur des îlots flottants au loin (`islands`, placés au-delà de la zone d'éjection).

## 4. Dans le jeu

- `src/render/rig/chars.js` : réglages par perso (garde, accroupi, foulée, os secondaires qui ballottent, accessoires tenus en main sur des « sockets », poses spéciales).
- `src/render/rig/library.js` : la bibliothèque de poses (états, coups).
- Banc d'essai : `?animtest=<id>&anim=states|moves|walk|run|<coup>&yaw=<deg>` affiche une planche du perso image par image.

## Ajouter un personnage

La recette à jour pour un perso Meshy (site de Meshy, réduction avec normal map cuite, rig, moveset emprunté) : `docs/NOUVEAU_PERSO.md`. Ci-dessous, l'ancienne chaîne Tripo.

1. Images → Tripo → mesures → `rigs/<id>.json` → `rig.py` (ci-dessus).
2. `src/sim/chars/<id>.js` : stats, coups normaux (`normals()`), 4 spéciaux ; l'ajouter dans `src/sim/chars/index.js`.
3. `src/render/rig/chars.js` (ou `friendRigs.js`) : son entrée `RIGS.<id>`.
4. Un repli en formes simples dans `src/render/chars.js` (au cas où le modèle ne charge pas ; sans lui, le jeu prend une silhouette de remplacement).
5. `portrait.py --ids <id>`.
