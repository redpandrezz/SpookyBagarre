// KERRIAN : gilet cargo, pantalon baggy, Paraboot aux lacets rouges et l'air blasé (modèle Meshy). Pour l'instant il
// se bat avec le moveset de BIDO (sa propre copie : bidoMoves), en attendant ses coups à lui.
import { bidoMoves } from './bido.js';

export default {
  id: 'kerrian', name: 'KERRIAN', title: 'Blasé, en gilet cargo et en Paraboot',
  color: '#ff8a2b',
  stats: { weight: 125, runSpeed: 7.8, walkSpeed: 3.2, airSpeed: 5.6, airAccel: 28, groundAccel: 54, friction: 42,
    jumpVel: 14.8, airJumpVel: 13, airJumps: 1, gravity: 1.06, fallSpeed: 19.5, height: 1.85, radius: 0.6 },
  moves: bidoMoves(),
  specialsInfo: { n: 'Bisou (on le dirige)', s: 'Corde à sauter', u: 'Ballon-cœur', d: 'Flex (sous le charme)' },
};
