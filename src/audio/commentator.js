// The zany commentator: short shouts on the big moments, spoken by the browser's speech synthesis
// (Audio.comment: never over another voice, never twice in a row the same line, a little pause between two).
const LINES = {
  bigHit: ['Grosse patate !', 'Oh la mandale !', 'Pleine poire !', 'Quelle tarte !', 'Bim, dans les dents !', 'Il l\'a pas volée, celle-là !',
    'Ça, c\'est du gratin !', 'Oh la châtaigne !', 'Prends ça dans ta face !', 'Paf, le chien !', 'Mais quelle beigne !', 'Il va le sentir demain, celle-là !',
    'Oh, la torgnole !', 'Ça, c\'est une baffe de compétition !', 'Il lui a remis les idées en place !', 'Oh la pêche !', 'Dans la tronche !',
    'Ça claque !', 'Il a senti passer le courant d\'air !', 'Oh, la gifle de l\'année !', 'Ça va laisser des traces !', 'Il a vu trente-six chandelles !',
    'Une mornifle, une vraie !', 'Ça, ça décoiffe !', 'Il l\'a repeint en bleu !', 'Il lui a fait une nouvelle tête !'],
  hugeHit: ['Mais c\'est une boucherie !', 'Il est où son dentier ?', 'On appelle le Samu ?', 'Ah, ça, c\'est interdit dans quarante pays !',
    'J\'ai jamais vu ça de ma vie !', 'Mais il est fou, lui !', 'Appelez sa mère !', 'Mais arrêtez le match !', 'Il a tapé tellement fort que j\'ai mal pour lui !',
    'Ça, c\'est de la violence gratuite, j\'adore !', 'Oh la vache, la vache, la vache !', 'Il l\'a envoyé dans la semaine prochaine !',
    'Le choc ! Le choc ! Le choc !', 'Mais c\'est un camion, ce type !', 'On a entendu le bruit jusqu\'à Marseille !'],
  // a blow it never saw coming: in the back, a projectile, or right in the middle of its own attack
  surprise: ['Oh, il l\'avait pas vue venir celle-là !', 'Par derrière ! Le traître !', 'Il regardait ailleurs, le pauvre !', 'Surprise !',
    'Il l\'a même pas vue passer !', 'Dans le dos ! Quelle bassesse ! J\'adore !', 'Il était pas prêt !', 'Oh le coup en traître !',
    'Il pensait à ses vacances, celui-là !', 'Bah alors, on dort ?', 'Il avait les yeux dans le vague !', 'Coucou, c\'est moi !'],
  spike: ['Météore ! Direction la cave !', 'Il l\'a planté comme un clou !', 'Smash vers le bas ! Adieu le sol !', 'Il l\'a enterré vivant !',
    'Et hop, au fond du trou !', 'Il a fait un trou dans la scène !'],
  ko: ['Aïe, ça doit faire mal !', 'Au revoir, à jamais !', 'Il est parti chercher du pain !', 'Bon voyage !', 'On le reverra pas de sitôt !',
    'Direction la lune !', 'Et il s\'envole, comme une crêpe !', 'Bye bye !', 'Il a pris un aller simple !', 'Adieu, petit ange !',
    'Envoyez-lui une carte postale !', 'Il a raté son bus, il prend l\'avion !', 'Il est parti en orbite !', 'Éjecté ! Comme un malpropre !',
    'Il est parti sans dire au revoir !', 'Et un de moins !', 'Il a décollé sans billet !', 'On a perdu le contact radio !',
    'Il est parti voir si l\'herbe est plus verte ailleurs !', 'Houston, on a un problème !'],
  top: ['Il est parti dans les étoiles !', 'Il a croisé un satellite !', 'Il a touché le plafond ! Et il a traversé !', 'Direction l\'espace !',
    'Il va faire coucou à la station spatiale !'],
  fall: ['Plouf ! Dans le vide !', 'Il a oublié de sauter !', 'Et il tombe comme une pierre !', 'Le vide, ça pardonne pas !', 'Oups ! La chute !',
    'Il a raté une marche !', 'Gravité : un, lui : zéro !', 'Il est tombé dans le panneau ! Et dans le trou !'],
  // a fall with no one to blame
  sd: ['Personne l\'a touché ! Il s\'est jeté tout seul !', 'Il s\'est auto-détruit ! Magnifique !', 'Ça, c\'est ce qu\'on appelle un suicide sportif !',
    'Il a sauté tout seul ! On n\'a rien vu !', 'Mais qu\'est-ce qu\'il fait ?!', 'Il a confondu le bord et la sortie !', 'Champion du monde du saut dans le vide !'],
  lastStock: ['Plus qu\'une vie ! Ça sent le sapin !', 'Dernière vie ! On serre les fesses !', 'Une seule vie ! Il joue sa peau !', 'C\'est la dernière, faut pas la rater !'],
  red: ['Il est tout rouge, il va exploser !', 'Il a plus de pourcentage que de cerveau !', 'Ça sent le roussi, là !', 'Un souffle et il s\'envole !',
    'Il est cuit, il est même trop cuit !', 'Il tient avec du scotch, celui-là !'],
  shieldBreak: ['Son bouclier a pété !', 'Oups, plus de bouclier !', 'Le bouclier, c\'est en carton !', 'Bouclier cassé ! Il est tout nu !', 'Il a la tête qui tourne !'],
  reflect: ['Retour à l’envoyeur !', 'Renvoyé ! Avec les intérêts !', 'Et ça repart dans l’autre sens !', 'Il lui renvoie ses cadeaux !',
    'Pas de retour, pas de remboursement !', 'Il a renvoyé tout le paquet !'],
  parry: ['Contre parfait ! Il est sonné !', 'La garde de l’année !', 'Il l’a vu venir à des kilomètres !', 'Mur de béton !', 'Quelle parade ! Magnifique !', 'Oh, la parade de ouf !', 'Il a tout vu venir !', 'Parade ! Il lit dans les pensées !', 'Renvoyé à l\'envoyeur !'],
  tech: ['Joli rattrapage !', 'Retombé sur ses pattes !', 'Comme un chat !', 'Il s\'est rattrapé aux branches !'],
  kame: ['Mais c\'est quoi ce rayon ?!', 'Il a mangé une centrale nucléaire !', 'Kamé quoi ? Kamé-ça-fait-mal !', 'Mais il va tout cramer !'],
  summon: ['Il appelle ses copains, c\'est pas du jeu !', 'Hé ! C\'est du deux contre un !', 'Les renforts arrivent !', 'Il a appelé sa bande !'],
  bounce: ['Ça rebondit !', 'Il a fait boing !'],
  combo: ['Quel combo !', 'Il l\'enchaîne, il l\'enchaîne !', 'Il le lâche plus !', 'Il le joue comme un yoyo !', 'Il le tape comme un tapis !',
    'C\'est un massage, là !', 'Il en fait de la purée !', 'Il l\'a mis en boucle !'],
  trip: ['Il a glissé ! Comme une peau de banane !', 'Patatras !', 'Oups, ça glisse !', 'Il a fait du patin !', 'Les pieds en l\'air ! Classique !'],
  ledgeSteal: ['Il lui a piqué le rebord ! Sans gêne !', 'Pousse-toi de là, c\'est ma place !', 'Le rebord est pris, désolé !'],
  over: ['Et c\'est fini ! Quelle bagarre !', 'Terminé ! Tout le monde à la douche !', 'C\'était n\'importe quoi, j\'ai adoré !', 'Fin du match ! Ramassez les dents !'],
  swallow: ['Il l\'a avalé tout cru !', 'Miam ! Sans même mâcher !'],
  stamp: ['Quarante-neuf trois ! Pas de débat !', 'Adopté sans vote !'],
};

// the hits and KOs of each fighter's own tricks (the move or projectile that landed: ev.m)
const MOVE_LINES = [
  [/note|bignote/, ['Un solo dans les dents !', 'Il lui joue un solo d\'adieu !', 'Ça, c\'est du métal !']],
  [/chord|larsen/, ['Power chord ! Ça décoiffe !', 'Le larsen ! Mes oreilles !', 'Trop fort, le son, trop fort !']],
  [/pizza/, ['Une pizza dans la tronche !', 'Livraison express !', 'Quatre fromages dans la figure !']],
  [/coin|cashstack/, ['Il lui jette son salaire à la figure !', 'L\'argent, ça fait mal !', 'Ça, c\'est un pot-de-vin !']],
  [/jazznote/, ['Le lick ! Le lick interdit !', 'Ré mi fa sol mi do ré, et au tapis !', 'Trop de jazz, il en est mort !']],
  [/holy808|waveform|ring:bass/, ['La sainte 808 a parlé !', 'Quelle basse, mes amis !', 'Ça tape dans le sub !']],
  [/train/, ['Attention à la fermeture des portes !', 'Il est passé sous le train !', 'Le TER est à l\'heure, pour une fois !', 'Contrôle des billets ! Ah non, c\'est un train !']],
  [/blabla/, ['Mais il va se taire ?!', 'Il l\'a saoulé jusqu\'à l\'étourdir !', 'Bla bla bla, et paf !']],
  [/funk/, ['La funk de Lyon, mesdames et messieurs !', 'Ça groove et ça cogne !']],
  [/bug|popup/, ['Erreur quatre cent quatre : adversaire introuvable !', 'Ça bugue, ça bugue !', 'Il a planté le serveur !']],
  [/shiba/, ['Le chien a encore frappé !', 'Attention, chien méchant !', 'Mais qui c\'est qui est un bon chien ?']],
  [/couscous/, ['Couscous en pleine face !', 'Il manquait plus que la merguez !']],
  [/flamm|fire|flame|burn/, ['Ça brûle, ça brûle !', 'Il est flambé comme une crêpe !']],
  [/cowbell|bucket|drumstick/, ['Tonk ! La cloche !', 'Un seau de poulet ! Le menu complet !']],
  [/kiss|heart/, ['Un bisou qui fait mal !', 'L\'amour, ça cogne !']],
  [/cat/, ['Le chat ! Toutes griffes dehors !', 'Miaou dans la figure !']],
];
// when a character KOs someone (35 % of the time instead of the generic line)
const KO_BY = {
  epektase: ['Il lui a joué son dernier morceau !', 'Rideau ! Fin du concert !', 'Le public en délire !'],
  ronare: ['Le gardien a fermé la porte !', 'Coup de basse, coup de grâce !', 'Une pinte dans la tronche !', 'Il l\'a branché sur le jack !'],
  anbuu: ['Un ange est passé !', 'Il l\'a envoyé au paradis du jazz !', 'Pieds nus et sans pitié !'],
  skanky: ['Il l\'a saoulé, il est parti !', 'Sans ticket et sans pitié !', 'Fraude et victoire !'],
  pprod: ['Fichier supprimé !', 'Il l\'a mis à la corbeille !', 'Contrôle Alt Suppr !'],
  jsan: ['Le chien l\'a renvoyé chez lui !', 'Va chercher ! Et il l\'a pas ramené !'],
  bido: ['Trop de muscles !', 'Il l\'a soulevé comme une haltère !'],
  tices: ['Flambé à l\'alsacienne !', 'Il est parti en fumée !'],
  omfu: ['Drop the bass ! Et drop le mec !', 'Il l\'a scratché hors de la scène !'],
  aboueb: ['Panier à trois points !', 'Smash dunk !'],
  lolobiscotto: ['Un petit jaune et au revoir !', 'Il a glissé sur le pastis !'],
  nymano: ['Même lui pleure de joie !', 'Kickflip dans la face !'],
  pandrezz: ['Le héros a encore frappé !', 'Il est trop fort, ce barbu !'],
  frog: ['Croâ ! Avalé et recraché !'],
  micron: ['Réforme adoptée !', 'Il l\'a mis en retraite anticipée !'],
};

const last = {};
function pickFrom(key, L) {
  if (!L || !L.length) return null;
  let i = Math.floor(Math.random() * L.length);
  if (L.length > 1 && i === last[key]) i = (i + 1) % L.length;
  last[key] = i;
  return L[i];
}
const pick = (kind) => pickFrom(kind, LINES[kind]);
function moveLine(m) {
  if (!m) return null;
  for (const [re, L] of MOVE_LINES) if (re.test(m)) return pickFrom(String(re), L);
  return null;
}

// combo detector: same attacker, same victim, three hits within 1.6 s
const streak = {};

// the last KO of a match: shouted over the big slow motion, and written across the screen (src/render/fx.js)
const VICTORY = [
  'Ololo, il s’est fait massacrer !',
  'Ololo, mais c’est un carnage !',
  'Rideau ! Il s’est fait démonter !',
  'C’est fini ! Il l’a atomisé !',
  'Oh la la, il l’a renvoyé chez sa mère !',
  'Mais c’est une humiliation totale !',
  'Il s’est fait plier en quatre !',
  'Ololo, il l’a réduit en miettes !',
  'Allez, au cimetière ! Et sans les fleurs !',
  'Il s’est fait rouler dessus par un trente-tonnes !',
  'Carnage ! Carnage ! Carnage !',
  'C’est pas une victoire, c’est un massacre !',
  'Repose en paix, petit ange !',
  'Ololo, la correction ! La correction !',
];
let lastVictory = -1;
export function victoryLine() {
  let i = (Math.random() * VICTORY.length) | 0;
  if (i === lastVictory) i = (i + 1) % VICTORY.length;
  lastVictory = i;
  return VICTORY[i];
}

export function commentate(ev, W, A) {
  if (!A || !A.comment) return;
  const F = (i) => W && W.fighters && W.fighters[i];
  switch (ev.type) {
    case 'hit': {
      const kb = ev.kb || 0;
      const V = F(ev.s), At = ev.a >= 0 ? F(ev.a) : null;
      if (kb > 60 && (ev.ly || 0) < -4 && Math.random() < 0.6) return A.comment(pick('spike'), 1);
      if (kb > 165 && Math.random() < 0.75) return A.comment(pick('hugeHit'), 2);
      // in the back, or a projectile it did not watch
      if (kb > 70 && V && At && At !== V) {
        const behind = Math.sign(At.x - V.x) !== Math.sign(Math.sin(V.facing)) && Math.abs(At.x - V.x) > 0.3;
        const proj = /^(proj|ring):/.test(ev.m || '');
        if ((behind || proj || V.move) && Math.random() < 0.3) return A.comment(pick('surprise'), 1);
      }
      if (kb > 80 && Math.random() < 0.3) { const l = moveLine(ev.m || ev.sm); if (l) return A.comment(l, 1); }
      if (kb > 105 && Math.random() < 0.55) return A.comment(pick('bigHit'), 1);
      if (V && V.damage > 150 && Math.random() < 0.08) return A.comment(pick('red'), 0);
      if (ev.a >= 0) {
        const k = ev.a + ':' + ev.s, now = performance.now();
        const s = streak[k] && now - streak[k].t < 1600 ? streak[k] : { n: 0 };
        s.n++; s.t = now; streak[k] = s;
        if (s.n === 4 && Math.random() < 0.6) return A.comment(pick('combo'), 0);
      }
      return;
    }
    case 'ko': {
      if (W && (W.phase === 'end' || W.phase === 'over')) return; // the last one: the victory line says it (fx.js)
      const V = F(ev.s);
      const left = ev.left ?? (V ? V.stocks : 2);
      if (left === 1 && Math.random() < 0.5) return A.comment(pick('lastStock'), 2);
      if (ev.k < 0 && Math.random() < 0.8) return A.comment(pick('sd'), 2);
      const K = ev.k >= 0 ? F(ev.k) : null;
      if (K && KO_BY[K.char] && Math.random() < 0.35) return A.comment(pickFrom('ko:' + K.char, KO_BY[K.char]), 2);
      if (ev.kind === 'top' && Math.random() < 0.6) return A.comment(pick('top'), 2);
      return A.comment(pick(ev.kind === 'bottom' ? 'fall' : 'ko'), 2);
    }
    case 'shieldBreak': return A.comment(pick('shieldBreak'), 2);
    case 'parry': return A.comment(pick('parry'), 2);
    case 'reflect': return A.comment(pick('reflect'), 2);
    case 'tech': return Math.random() < 0.4 && A.comment(pick('tech'), 0);
    case 'bounce': return Math.random() < 0.3 && A.comment(pick('bounce'), 0);
    case 'kameFire': return (ev.c || 0) > 0.55 && Math.random() < 0.7 && A.comment(pick('kame'), 1, 1.3);
    case 'summon': return Math.random() < 0.35 && A.comment(pick('summon'), 0, 1.6);
    case 'trip': return Math.random() < 0.6 && A.comment(pick('trip'), 1);
    case 'ledgeSteal': return Math.random() < 0.5 && A.comment(pick('ledgeSteal'), 0);
    case 'swallow': return Math.random() < 0.6 && A.comment(pick('swallow'), 1);
    case 'stamp': return Math.random() < 0.5 && A.comment(pick('stamp'), 1);
    case 'over': return; // the victory line was shouted at the last KO, the results say the winner
    default:
  }
}
