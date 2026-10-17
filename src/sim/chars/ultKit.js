// Les ultimes des 19 autres persos (celui d'Anbuu, « LICK DIVIN », est dans anbuu.js). Même mécanique pour tous (src/sim/ultimate.js) :
// une entrée en scène (pose dramatique, la caméra se rapproche), un rayon qui part devant le lanceur, ceux qu'il touche sont tenus
// dans la lumière et prennent une série de coups, le dernier est un vrai coup qui éjecte. Chaque perso a son nom, ses couleurs (le
// rayon, l'aura et le titre les reprennent), ses poses (celles de la bibliothèque : aucun clip acheté) et son rythme. Le total de
// dégâts reste voisin de celui d'Anbuu (~31 %) : un rythme court et dense, ou long avec quelques gros coups, jamais plus fort.
// Pour un clip à lui plus tard : poser `ult_a/b/c` dans NATIVE_MOVES du perso (nativeMoves.js), rien d'autre à changer.
//   p : les poses [entrée, rayon, coups] ; n / every : nombre de coups et écart (images) ; small : dégâts des petits coups ;
//   dmg / ang / kbb / kbg : le coup final ; reach / aim : la zone devant le lanceur (m ; aim = l'écart de hauteur des pieds permis : le rayon part droit devant, il faut bien viser).
const T = {
  frog:         { name: 'LANGUE DE LA MORT',  sub: 'Croâ, puis plus rien',        c: ['#d6ff8a', '#5ad13b', '#ffe14a'], p: ['jupiter', 'tongue', 'decree'], n: 5, every: 15, small: 3.0, dmg: 19, ang: 38, kbb: 60, kbg: 52 },
  micron:       { name: '49.3 FINAL',         sub: 'Adopté sans vote',            c: ['#ffe9a8', '#3b6fd6', '#ff4a4a'], p: ['decree', 'decree', 'jupiter'], n: 4, every: 20, small: 4.0, dmg: 19, ang: 45, kbb: 62, kbg: 54 },
  bubba:        { name: 'COMBO XXL',          sub: 'Freedom, sauce et feu',       c: ['#ffe29a', '#d6513b', '#ffd23a'], p: ['jupiter', 'soda', 'bellyflop'], n: 6, every: 14, small: 2.4, dmg: 19, ang: 40, kbb: 62, kbg: 52 },
  parmesan:     { name: 'RÂPAGE 24 MOIS',     sub: 'Affinage radical',            c: ['#fff3b0', '#f0d26a', '#ff9a3a'], p: ['thunder', 'grate', 'drum'], n: 10, every: 9, small: 1.4, dmg: 18, ang: 44, kbb: 60, kbg: 52 },
  pika:         { name: 'HUMANBALL ULTIME',   sub: 'Tous les humains, GO !',      c: ['#fff6a8', '#ffd84a', '#6fd8ff'], p: ['jupiter', 'thunder', 'thunder'], n: 7, every: 12, small: 2.2, dmg: 18, ang: 48, kbb: 60, kbg: 52 },
  tung:         { name: 'SAHUR À 3 HEURES',   sub: 'Tung, tung, tung, sur le temps', c: ['#ffe7b8', '#b5803f', '#ffd23a'], p: ['tungtung', 'tungtung', 'drum'], n: 3, every: 26, small: 5.5, dmg: 20, ang: 42, kbb: 64, kbg: 54 },
  shark:        { name: 'TRALALA DÉLUGE',     sub: 'Trois pattes, zéro pitié',    c: ['#bfe8ff', '#4aa8e8', '#ff7a3a'], p: ['zip', 'bite', 'bite'], n: 6, every: 14, small: 2.5, dmg: 18.5, ang: 36, kbb: 62, kbg: 52 },
  catlady:      { name: 'NUÉE DU TERMINUS',   sub: 'Tous les chats du bus',       c: ['#e6c8ff', '#8a4fc0', '#ffd23a'], p: ['jupiter', 'sprinkle', 'sprinkle'], n: 9, every: 10, small: 1.6, dmg: 18, ang: 50, kbb: 60, kbg: 52 },
  ronare:       { name: 'DROP DU GARDIEN',    sub: 'La basse à fond',            c: ['#fff1c2', '#e8b93a', '#ff5ab8'], p: ['jupiter', 'drum', 'thunder'], n: 5, every: 16, small: 3.0, dmg: 19, ang: 42, kbb: 63, kbg: 54 },
  pandrezz:     { name: 'KAMEHAMEHA FINAL',   sub: 'Un mec vraiment très fort',   c: ['#ffd6ec', '#ff4fa3', '#6fd8ff'], p: ['jupiter', 'kame', 'thunder'], n: 5, every: 16, small: 3.0, dmg: 19, ang: 42, kbb: 63, kbg: 54 },
  aboueb:       { name: 'DUNK DES BOUCLES',   sub: 'Panier à mille points',       c: ['#ffd0a8', '#e8412c', '#ffe14a'], p: ['jupiter', 'layup', 'layup'], n: 4, every: 20, small: 4.0, dmg: 19, ang: 62, kbb: 58, kbg: 50 },
  tices:        { name: 'GRAND CRU ALSACIEN', sub: 'Flammekueche et rhum',        c: ['#ffe9a8', '#f2c14e', '#ff5a2a'], p: ['jupiter', 'shotgun', 'soda'], n: 6, every: 14, small: 2.6, dmg: 18, ang: 40, kbb: 62, kbg: 52 },
  omfu:         { name: 'DROP FINAL',         sub: 'Platines et body slam',       c: ['#b8ffd0', '#2fae5b', '#ffe14a'], p: ['thunder', 'lariat', 'drum'], n: 5, every: 15, small: 3.1, dmg: 19, ang: 34, kbb: 64, kbg: 54 },
  lolobiscotto: { name: 'PASTIS ET PIMENT',   sub: 'Ça brûle, ça glisse',         c: ['#ffd0e6', '#e8509a', '#ffb13a'], p: ['jupiter', 'sprinkle', 'thunder'], n: 8, every: 11, small: 1.8, dmg: 18, ang: 46, kbb: 60, kbg: 52 },
  jsan:         { name: 'NUAGE DU SHIBA',     sub: 'Vape, vape, vape',            c: ['#ffe9c8', '#d9a35f', '#9ff0ff'], p: ['jupiter', 'helico', 'thunder'], n: 7, every: 12, small: 2.2, dmg: 18, ang: 52, kbb: 60, kbg: 52 },
  nymano:       { name: 'SAMPLE DES LARMES',  sub: 'SP-404, volume max',          c: ['#c8e0ff', '#3d7fd9', '#ff9ad8'], p: ['drum', 'drum', 'thunder'], n: 8, every: 11, small: 1.9, dmg: 18, ang: 44, kbb: 60, kbg: 52 },
  kerrian:      { name: 'BOOGIE ROCKET',      sub: 'Une boule disco au bazooka',  c: ['#fff4c2', '#ff5ad1', '#4ae8ff'], p: ['jupiter', 'grab', 'full'], n: 5, every: 16, small: 3.0, dmg: 20, ang: 46, kbb: 62, kbg: 54 },
  bido:         { name: 'BISOU FINAL',        sub: 'Des muscles et du cœur',      c: ['#ffd6ec', '#ff6fb1', '#ffe14a'], p: ['jupiter', 'grab', 'full'], n: 5, every: 16, small: 3.0, dmg: 20, ang: 46, kbb: 62, kbg: 54 },
  epektase:     { name: 'SOLO ULTIME',        sub: 'Larsen et carré Hermès',      c: ['#ffd0d0', '#d8262c', '#ffd23a'], p: ['jupiter', 'drum', 'thunder'], n: 9, every: 10, small: 1.7, dmg: 18, ang: 40, kbb: 62, kbg: 52 },
  pprod:        { name: 'COMPIL FINALE',      sub: 'Ctrl + Alt + Suppr',          c: ['#e8eef8', '#9aa4b4', '#5aff9a'], p: ['thunder', 'drum', 'decree'], n: 10, every: 9, small: 1.5, dmg: 17, ang: 44, kbb: 60, kbg: 52 },
  skanky:       { name: 'LE GRAND CASSE',     sub: 'Sans ticket, sans pitié',     c: ['#ffd0d0', '#c8303a', '#ffe14a'], p: ['zip', 'flykick', 'thunder'], n: 6, every: 14, small: 2.6, dmg: 18, ang: 38, kbb: 62, kbg: 52 },
};

export function applyUlts(CHARS) {
  for (const id of Object.keys(CHARS)) {
    const C = CHARS[id], k = T[id];
    if (!k || C.ult) continue;
    C.moves = { ...C.moves,
      ult_a: { dur: 400, pose: k.p[0], noTrail: true },
      ult_b: { dur: 400, pose: k.p[1], noTrail: true },
      ult_c: { dur: 400, pose: k.p[2], noTrail: true } };
    C.ult = {
      id: 'u_' + id, name: k.name, sub: k.sub, colors: k.c, moves: ['ult_a', 'ult_b', 'ult_c'],
      intro: 54, strike: 26, whiff: 22, reach: 11, aim: [-1.2, 1.0], hold: [2.4, 1.6, 1.5, 0.35],
      notes: k.n, every: k.every, noteDmg: k.small,
      final: { dmg: k.dmg, ang: k.ang, kbb: k.kbb, kbg: k.kbg },
    };
  }
}
