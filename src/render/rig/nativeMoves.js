// Signature moves played from the characters' own Uthana clips (packed into their model by tools/art/tripo_pack.py,
// names "u_<file>"). Times are in clip seconds. Two ways to stretch a clip over a move:
//   strike: { from, strike, to }  the wind-up is squeezed before the move's first hitbox, the strike held while it
//                                 is out, then the follow-through (like the Tripo clips of poser.js CLIP_MOVES)
//   keys:   [[simFrame, clipTime], ...]  piecewise linear, for the specials whose strike is a projectile or an effect
//                                 thrown on a given frame (onFrame), not a hitbox
// mirror: the clip has a mirrored copy "<clip>__m", played facing right so the near arm does it.
// A clip a model does not have is simply skipped (the procedural pose stays).
export const NATIVE_MOVES = {
  aboueb: {
    usmash: { clip: 'u_aboueb_dunk', from: 0.35, strike: 1.15, to: 1.7 },                    // the slam dunk
    // the big pass (16 Oct 2026): the curls do the hitting, the head throws them (Meshy text to motion, transferred)
    jab1: { clip: 'm_hairwhip', from: 0.6, strike: 0.95, to: 1.1 },
    jab2: { clip: 'm_hairwhip', from: 1.1, strike: 1.37, to: 1.5 },
    jab3: { clip: 'm_hairwhip', from: 1.5, strike: 1.65, to: 2.6 },
    ftilt: { clip: 'm_hairwhip', from: 0.9, strike: 1.6, to: 2.4 },
    smash: { clip: 'm_hairwhip', keys: [[0, 0.5], [8, 0.95], [14, 1.6], [18, 1.66], [46, 2.7]] },
    utilt: { clip: 'm_hairup', keys: [[0, 0.0], [7, 0.2], [11, 0.24], [26, 0.08]] }, // the head thrown up, not the backbend
    uair: { clip: 'm_hairup', keys: [[0, 0.0], [6, 0.2], [10, 0.24], [30, 0.08]] },
    dtilt: { clip: 'm_hairdown', from: 0.15, strike: 0.5, to: 0.8 },
    dair: { clip: 'm_hairdown', from: 0.2, strike: 0.55, to: 0.9 },
    dsmash: { clip: 'm_hairdown', keys: [[0, 0.1], [6, 0.3], [11, 0.6], [16, 0.72], [30, 1.05], [46, 1.8]] },
    nair: { clip: 'm_hairspin', from: 0.2, strike: 0.6, to: 1.6 },
    fair: { clip: 'm_hairwhip', from: 1.0, strike: 1.5, to: 2.0 },
    sp_n: { clip: 'm_reflector', keys: [[0, 0.2], [7, 0.6], [24, 0.95]] },                 // the reflector, hands out
    sp_s: { clip: 'm_hairwhip', keys: [[0, 0.6], [5, 1.5], [22, 1.62], [44, 2.4]] },        // the curls thrown out
    sp_d: { clip: 'm_chestpass', keys: [[0, 1.3], [10, 1.75], [16, 1.9], [34, 2.3]] },      // the two-hand chest pass
    sp_d2: { clip: 'm_chestpass', keys: [[0, 1.55], [6, 1.75], [18, 2.1]] },
    sp_u: { clip: 'm_carpet', keys: [[0, 0.2], [72, 2.8]] },                                // cross-legged on the carpet
  },
  tices: {
    sp_s: { clip: 'u_tices_firebreath', keys: [[0, 0.05], [20, 0.35], [26, 0.95], [54, 1.75], [66, 1.9]] }, // a swig of rum, then the fire
    sp_n: { clip: 'u_tices_frisbee', keys: [[0, 0.2], [9, 0.7], [32, 1.1]] },                  // the flammekueche flicked like a frisbee
    sp_d: { clip: 'u_tices_fart', keys: [[0, 0.05], [12, 0.33], [40, 1.3]] },                   // he squats... and lets go
    dashattack: { clip: 'u_tices_dash', from: 0.6, strike: 1.05, to: 1.33 },                   // trips and belly-slides
    // the big pass (16 Oct 2026)
    jab1: { clip: 'm_rapid', from: 0.2, to: 1.8, cycle: [4, 16], rate: 1.6 },                  // the flurry (as long as A is mashed)
    jab3: { clip: 'm_finisher', keys: [[0, 0.15], [7, 0.55], [10, 0.62], [32, 1.5]] },         // the lunging finisher
    smash: { clip: 'm_capthrow', keys: [[0, 0.1], [8, 0.4], [12, 0.82], [26, 1.1], [44, 1.6]] }, // the cap flung like a boomerang
    usmash: { clip: 'm_capup', keys: [[0, 0.0], [6, 0.06], [10, 0.3], [30, 0.9], [46, 1.6]] },  // the cap thrown up, eyes on it
    // flaming kicks: behind him (the body turned around), then in front
    dsmash: { clip: 'm_firekick', keys: [[0, 0.12], [5, 0.22], [9, 0.38], [14, 0.6], [19, 1.15], [22, 1.36], [30, 1.6], [46, 1.95]],
      turn: [[0, Math.PI], [13, Math.PI], [18, 0], [46, 0]] },
    sp_u: { clip: 'm_fartfly', keys: [[0, 0.2], [64, 2.4]] },                                  // sitting on the jet of gas
  },
  omfu: {
    dashattack: { clip: 'u_omfu_dash', from: 0.25, strike: 0.6, to: 1.1 },                     // a flying body check
    // the big pass (16 Oct 2026): the wrestler
    jab1: { clip: 'm_wrestle2', from: 0.0, strike: 0.57, to: 0.7 },
    jab2: { clip: 'm_wrestle2', from: 0.76, strike: 1.45, to: 2.1 },
    smash: { clip: 'm_bellyflop', keys: [[0, 0.1], [10, 0.32], [19, 0.66], [22, 0.76], [34, 1.2], [62, 2.4]] }, // flat on his belly
    usmash: { clip: 'm_uppercut2', keys: [[0, 0.05], [6, 0.3], [10, 0.74], [14, 0.88], [48, 1.6]], hip: 'y' }, // the dip, then the fist all the way up
    dsmash: { clip: 'm_stomp', keys: [[0, 0.4], [5, 0.76], [9, 1.25], [12, 1.4], [46, 1.95]] },                // the stomp
    sp_n: { clip: 'm_carry', keys: [[0, 0.1], [30, 0.6]] },
    omCarry: { clip: 'm_carry', keys: [[0, 0.1], [240, 2.4]] },                                            // the foe held up over his head
    omSlap: { clip: 'm_wrestle2', keys: [[0, 0.3], [7, 0.57], [30, 0.9]] },
    omSlam: { clip: 'm_bodyslam', keys: [[0, 0.0], [9, 0.45], [30, 1.2], [50, 2.4]] },                     // he drops on it with his whole weight
    sp_s: { clip: 'u_omfu_scratch', keys: [[0, 0.1], [12, 0.8], [36, 1.6], [58, 2.3]] },                  // scratching the decks
    omEmerge: { clip: 'm_emerge', keys: [[0, 0.0], [8, 0.35], [24, 1.1], [40, 1.9]] },                     // out of the ground in one jump
  },
  lolobiscotto: {
    sp_s: { clip: 'u_lolo_catthrow', keys: [[0, 0.5], [11, 1.35], [34, 1.9]], mirror: true }, // the grey cat thrown
    sp_d: { clip: 'u_lolo_pour', keys: [[0, 0.4], [20, 0.9], [44, 1.4]] },                     // she empties the Ricard on the floor
    // the big pass (16 Oct 2026)
    jab1: { clip: 'm_catslap', from: 0.1, to: 1.8, cycle: [3, 13], rate: 1.5 },                // cat slaps, on and on
    smash: { clip: 'm_eatspit', keys: [[0, 0.1], [8, 0.55], [13, 1.12], [18, 1.25], [46, 1.9]] }, // a chili eaten, the fire spat
    usmash: { clip: 'm_highkick', keys: [[0, 0.2], [6, 0.45], [10, 0.82], [14, 0.95], [44, 1.6]] }, // the mawashi-geri
    // the bottle smashed at her feet (the clip throws to her side: the body turned so it goes in front)
    dsmash: { clip: 'm_bottledown', keys: [[0, 0.1], [6, 0.38], [10, 0.62], [14, 0.75], [44, 1.5]], turn: [[0, 0], [6, -0.6], [10, -1.05], [16, -1.05], [34, 0]] },
  },
  jsan: {
    sp_n: { clip: 'u_jsan_vape', keys: [[0, 0.9], [18, 1.6], [40, 2.3]] },                    // the big puff
    sp_s: { clip: 'u_jsan_sic', keys: [[0, 1.15], [6, 1.6], [34, 1.9]], mirror: true },       // "go get it!": he points
    sp_d: { clip: 'u_jsan_sic', keys: [[0, 0.25], [4, 0.6], [30, 1.3]], mirror: true },       // he points: the shiba squats
    dashattack: { clip: 'u_jsan_dash', from: 0.25, strike: 0.62, to: 1.1 },                    // flying dropkick
    // the big pass (16 Oct 2026)
    jab1: { clip: 'u_jsan_sic', keys: [[0, 0.25], [4, 0.6], [26, 1.1]], mirror: true },        // "woof!": he points, the dog barks
    smash: { clip: 'm_chestpass', keys: [[0, 1.3], [8, 1.5], [11, 1.72], [16, 1.86], [44, 2.3]] }, // the dog thrown two-handed
    usmash: { clip: 'm_tailswing', keys: [[0, 0.05], [6, 0.3], [10, 0.62], [14, 0.8], [44, 1.6]] }, // swung by the tail
    sp_u: { clip: 'm_hangfly', keys: [[0, 0.2], [64, 2.0]], hip: 'none' },                      // hanging from the shiba-copter
  },
  nymano: {
    sp_d: { clip: 'u_nymano_cry', keys: [[0, 0.1], [46, 2.0]] },                               // all the tears of his body
    dsmash: { clip: 'u_nymano_cry', from: 0.5, strike: 1.1, to: 1.9 },                        // he bursts into tears
    sp_n: { clip: 'm_sp404', from: 0.2, to: 2.8, cycle: [9, 10], rate: 1 },                    // sitting, playing the SP-404 (held: on and on)
    // the big pass (16 Oct 2026): the skateboard
    jab1: { clip: 'm_skatecombo', from: 0.3, strike: 0.57, to: 0.7 },
    jab2: { clip: 'm_skatecombo', from: 0.7, strike: 0.95, to: 1.15 },
    jab3: { clip: 'm_skatecombo', from: 1.15, strike: 1.55, to: 2.3 },
    smash: { clip: 'm_skateswing', keys: [[0, 0.05], [8, 0.25], [13, 0.45], [16, 0.55], [46, 1.4]] },
    sp_s: { clip: 'surf', keys: [[0, 0.3], [46, 2.0]] },                                       // riding the board
    dashattack: { clip: 'surf', keys: [[0, 0.3], [36, 1.6]] },                                 // a skate tackle, riding low
  },
  bido: {
    sp_d: { clip: 'u_bido_flex', keys: [[0, 0.1], [14, 0.75], [50, 1.05]] },                  // the charm: double biceps
    sp_n: { clip: 'heart_pose', keys: [[0, 1.0], [10, 1.9], [34, 3.0]] },                      // a heart with the arms, then the kiss flies
    // the big pass (16 Oct 2026): the gym
    jab1: { clip: 'm_dumbbell', keys: [[0, 0.3], [7, 0.6], [11, 0.8], [14, 0.88], [34, 1.5]] },     // one big swing of the dumbbell
    smash: { clip: 'm_kettle', keys: [[0, 0.1], [8, 0.45], [15, 0.85], [18, 0.95], [50, 1.6]] },     // the kettlebell swung
    usmash: { clip: 'm_squatlift', keys: [[0, 0.3], [7, 0.95], [10, 1.4], [12, 1.7], [16, 1.85], [50, 2.4]] }, // the squat, then the press
    dsmash: { clip: 'm_groundslam', keys: [[0, 0.1], [6, 0.4], [11, 0.75], [15, 0.9], [48, 1.7]] }, // both hands into the floor
    sp_s: { clip: 'm_ropewhip', keys: [[0, 0.3], [6, 0.6], [14, 0.95], [22, 1.32], [40, 1.9]] },     // the jump rope cracked three times
    bidoLove: { clip: 'heart_pose', keys: [[0, 1.0], [12, 1.9], [160, 3.0]] },                      // lost in love while he steers his foe
  },
  pandrezz: {
    sp_n: { clip: 'u_pandrezz_kame', keys: [[0, 0.1], [10, 0.5], [13, 0.9], [60, 1.6], [80, 2.3]] }, // ka-me-ha-me-HA
    sp_s: { clip: 'u_pandrezz_summon', keys: [[0, 0.1], [9, 0.5], [34, 1.1]] },                // he points: CD-Man comes
    sp_d: { clip: 'u_pandrezz_call', keys: [[0, 0.2], [8, 0.6], [40, 1.2]] },                  // he calls Vinylman
    dashattack: { clip: 'u_pandrezz_dash', from: 0.55, strike: 1.05, to: 1.3 },                // the flying side kick
    // the big pass (16 Oct 2026): three open-hand slaps, a short kamehameha, the splits, the spirit bomb
    jab1: { clip: 'm_slaps3', from: 0.0, strike: 0.22, to: 0.38 },
    jab2: { clip: 'm_slaps3', from: 0.4, strike: 0.8, to: 1.0 },
    jab3: { clip: 'm_slaps3', keys: [[0, 1.0], [11, 1.42], [14, 1.5], [24, 1.68], [40, 2.75]] }, // low, then straight back up
    smash: { clip: 'u_pandrezz_kame', keys: [[0, 0.3], [9, 0.75], [13, 0.9], [30, 1.6], [50, 2.3]] },
    // a side split, turned to the camera: one leg in front, one behind; then the clip backwards to stand up
    dsmash: { clip: 'm_split', keys: [[0, 0.0], [5, 0.12], [9, 0.36], [13, 0.45], [26, 0.55], [40, 0.2], [46, 0.1], [50, 0.05]], face: [0, 6, 38, 48] },
    usmash: { clip: 'm_genki', keys: [[0, 0.3], [9, 0.66], [14, 1.3], [50, 1.9]] },
  },
  // Epektase (Meshy rig, tools/art/meshy_pack.py): every move from his own pool of clips, nothing shared
  epektase: {
    // the three blows of a one-handed weapon combo (the guitar), each struck at full stretch
    jab1: { clip: 'm_tricombo', from: 0.45, strike: 0.95, to: 1.2 },
    jab2: { clip: 'm_tricombo', from: 1.2, strike: 1.72, to: 1.9 },
    jab3: { clip: 'm_tricombo', from: 2.0, strike: 2.55, to: 3.2 },
    ftilt: { clip: 'm_scarfwhip', from: 0.3, strike: 0.9, to: 1.6 },          // the Hermès scarf lashed out (text to motion)
    ftilt2: { clip: 'm_spartan', from: 0.2, strike: 0.62, to: 1.1 },          // a push kick, the leg straight out
    ftilt3: { clip: 'm_hammer', from: 0.7, strike: 1.5, to: 1.8 },              // the guitar like a sledgehammer
    utilt: { clip: 'm_windmill', from: 0.95, strike: 1.45, to: 2.1 },           // the windmill strum
    dtilt: { clip: 'm_legsweep', from: 0.4, strike: 0.85, to: 1.6 },
    smash: { clip: 'm_chargedslash', from: 0.2, strike: 1.17, to: 2.0 },        // the axe swing
    usmash: { clip: 'm_guitarup', keys: [[0, 0.0], [7, 0.15], [10, 0.3], [22, 0.6], [40, 1.0]] }, // the guitar thrown up, his eyes on it
    dsmash: { clip: 'm_groundslam', from: 1.15, strike: 1.66, to: 2.6 },        // slammed into the floor
    nair: { clip: 'm_axespin', from: 0.35, strike: 0.92, to: 1.6 },
    fair: { clip: 'm_doublecombo', from: 0.3, strike: 0.68, to: 1.05 },
    bair: { clip: 'm_lslash', from: 1.0, strike: 1.3, to: 1.75 },
    uair: { clip: 'm_upslash', from: 0.6, strike: 1.07, to: 1.7 },
    dair: { clip: 'm_hammer', from: 0.8, strike: 1.5, to: 1.8 },
    grab: { clip: 'm_grabthrow', from: 0.35, strike: 0.8, to: 1.2 },            // the scarf lasso
    throw: { clip: 'm_grabthrow', keys: [[0, 3.0], [13, 3.45], [30, 4.2]] },
    dashattack: { clip: 'm_kneeslide', keys: [[0, 0.35], [8, 0.9], [30, 1.45], [42, 1.6]] }, // on his knees
    ledgeattack: { clip: 'm_rslash', from: 0.2, strike: 0.53, to: 1.1 },
    sp_n: { clip: 'm_solo', keys: [[0, 0.05], [66, 2.9]] },                      // the shred
    sp_s: { clip: 'm_powerchord', keys: [[0, 0.05], [12, 0.33], [22, 0.72], [48, 1.9]] },
    sp_u: { clip: 'm_broom', keys: [[0, 0.2], [158, 2.8]] },                     // riding his guitar like a broom
    sp_d: { clip: 'm_larsen', keys: [[0, 0.05], [14, 0.6], [44, 1.8], [56, 2.4]] },
  },
  // PPROD (Meshy rig, his own pool of clips): punches and kicks thrown at full stretch, the chair, the throws
  pprod: {
    // the big pass (16 Oct 2026): five throws of money in a row, the screen, the chair
    jab1: { clip: 'm_throw5', from: 0.4, strike: 0.69, to: 0.85 },
    jab2: { clip: 'm_throw5', from: 0.85, strike: 0.95, to: 1.15 },
    jab3: { clip: 'm_throw5', from: 1.15, strike: 1.37, to: 1.5 },
    jab4: { clip: 'm_throw5', from: 1.5, strike: 1.6, to: 1.75 },
    jab5: { clip: 'm_throw5', from: 1.75, strike: 1.9, to: 2.6 },
    ftilt: { clip: 'm_straightkick', from: 0.3, strike: 0.72, to: 1.2 },
    ftilt2: { clip: 'm_elbow', from: 0.9, strike: 1.35, to: 1.9 },
    ftilt3: { clip: 'm_roundhouse', from: 0.4, strike: 0.92, to: 1.5 },      // a lunging roundhouse
    utilt: { clip: 'm_uppercut', from: 0.3, strike: 0.6, to: 0.95 },
    dtilt: { clip: 'm_legsweep', from: 0.4, strike: 0.85, to: 1.5 },
    smash: { clip: 'm_screen', keys: [[0, 0.1], [8, 0.45], [14, 0.95], [17, 1.05], [48, 1.8]] }, // the screen brought down hard
    usmash: { clip: 'm_sitthumbs', keys: [[0, 0.3], [48, 2.0]] },              // on the spinning chair, up
    dsmash: { clip: 'm_sitthumbs', keys: [[0, 0.3], [46, 2.0]] },              // on the chair, flat and wide
    nair: { clip: 'a_spinkick', from: 0.2, strike: 0.9, to: 1.2 },
    fair: { clip: 'a_flykick', from: 0.2, strike: 0.55, to: 0.9 },           // the flying kick
    bair: { clip: 'a_spinkick', from: 0.2, strike: 0.6, to: 1.0 },
    uair: { clip: 'm_highkick', from: 0.6, strike: 1.05, to: 1.5 },
    dair: { clip: 'a_jumppunch', from: 0.1, strike: 0.45, to: 0.8 },         // a punch down
    grab: { clip: 'm_grabthrow', from: 0.35, strike: 0.8, to: 1.2 },
    throw: { clip: 'm_grabthrow', keys: [[0, 3.0], [13, 3.45], [30, 4.2]] },
    dashattack: { clip: 'm_slide', keys: [[0, 0.05], [6, 0.4], [34, 0.95], [46, 1.3]] }, // the spaghetti slide
    ledgeattack: { clip: 'm_ljab', from: 0.15, strike: 0.47, to: 0.9 },
    sp_n: { clip: 'm_typing', keys: [[0, 0.0], [66, 3.6], [72, 3.9]] },     // on his chair, coding
    sp_s: { clip: 'm_overthrow', keys: [[0, 0.6], [10, 1.2], [14, 1.95], [44, 2.6]] },     // the old PC heaved
    sp_d: { clip: 'm_crouchthrow', keys: [[0, 4.6], [14, 5.4], [40, 6.3]] }, // the pizza, wound up and flung
    sp_u: { clip: 'm_sitthumbs', keys: [[0, 0.6], [62, 2.4]] },              // riding the turbo chair, thumbs up
  },
  // ANBUU (Meshy rig): the fighting takes on his own skeleton, spell casts for his psychic specials (Mewtwo-like)
  anbuu: {
    // the big pass (16 Oct 2026): his hand held out, the ball of energy at its end; then it bursts
    jab1: { clip: 'm_palm', from: 0.2, to: 1.8, cycle: [5, 17], rate: 1 },
    jab3: { clip: 'm_bothfists', keys: [[0, 1.2], [3, 1.45], [26, 2.0]] },
    ftilt: { clip: 'm_straightkick', from: 0.3, strike: 0.72, to: 1.2 },
    ftilt2: { clip: 'm_elbow', from: 0.9, strike: 1.35, to: 1.9 },
    ftilt3: { clip: 'm_roundhouse', from: 0.4, strike: 0.92, to: 1.5 },
    utilt: { clip: 'm_uppercut', from: 0.3, strike: 0.6, to: 0.95 },
    dtilt: { clip: 'm_legsweep', from: 0.4, strike: 0.85, to: 1.5 },
    smash: { clip: 'm_bothfists', keys: [[0, 0.9], [9, 1.15], [13, 1.45], [30, 1.6], [50, 2.0]] },    // both palms thrust: the light
    usmash: { clip: 'm_skybeam', keys: [[0, 0.1], [7, 0.3], [11, 0.5], [40, 1.6], [50, 1.9]] },     // one hand to the sky, the beam
    dsmash: { clip: 'm_wingslam', keys: [[0, 0.1], [6, 0.45], [11, 0.9], [15, 1.05], [46, 1.8]] }, // the wings slammed into the floor
    nair: { clip: 'a_spinkick', from: 0.2, strike: 0.9, to: 1.2 },
    fair: { clip: 'a_flykick', from: 0.2, strike: 0.55, to: 0.9 },
    bair: { clip: 'a_spinkick', from: 0.2, strike: 0.6, to: 1.0 },
    uair: { clip: 'm_highkick', from: 0.6, strike: 1.05, to: 1.5 },
    dair: { clip: 'a_jumppunch', from: 0.1, strike: 0.45, to: 0.8 },
    grab: { clip: 'm_grabthrow', from: 0.35, strike: 0.8, to: 1.2 },
    throw: { clip: 'm_grabthrow', keys: [[0, 3.0], [13, 3.45], [30, 4.2]] },
    dashattack: { clip: 'm_bothfists', from: 1.1, strike: 1.45, to: 2.0 },   // the psychic shove, both palms
    ledgeattack: { clip: 'm_ljab', from: 0.15, strike: 0.47, to: 0.9 },
    sp_n: { clip: 'm_lick', keys: [[0, 0.0], [6, 0.15], [31, 1.75], [36, 2.25], [56, 2.46]] }, // the lick on an invisible keyboard, the last note flung up
    sp_s: { clip: 'm_cast6', keys: [[0, 0.2], [8, 1.0], [38, 2.3]] },             // the psychic wave
    sp_d: { clip: 'm_stomp', keys: [[0, 0.1], [18, 0.75], [58, 1.33]] },          // the stomp that calls the holy 808
    sp_u: { clip: 'a_angel', keys: [[0, 0.15], [4, 0.4], [34, 1.55], [50, 1.95]] }, // carried up by the wings, arms beating like them
  },
  // SKANKY (Meshy rig): the same fighting takes as PPROD on his own skeleton, his talk, the vault, the ollie, the funk
  skanky: {
    jab1: { clip: 'm_ljab', from: 0.15, strike: 0.47, to: 0.9 },
    jab2: { clip: 'm_rjab', from: 0.3, strike: 0.6, to: 1.0 },
    jab3: { clip: 'm_bothfists', from: 1.1, strike: 1.45, to: 2.0 },
    ftilt: { clip: 'm_straightkick', from: 0.3, strike: 0.72, to: 1.2 },
    ftilt2: { clip: 'm_elbow', from: 0.9, strike: 1.35, to: 1.9 },
    ftilt3: { clip: 'm_roundhouse', from: 0.4, strike: 0.92, to: 1.5 },
    utilt: { clip: 'm_uppercut', from: 0.3, strike: 0.6, to: 0.95 },
    dtilt: { clip: 'm_legsweep', from: 0.4, strike: 0.85, to: 1.5 },
    smash: { clip: 'm_roundhouse', from: 0.3, strike: 0.92, to: 1.6 },        // the lunging roundhouse, wound up
    usmash: { clip: 'm_highkick', from: 0.6, strike: 1.05, to: 1.6 },
    dsmash: { clip: 'm_sweepkick', from: 0.6, strike: 1.2, to: 1.6 },
    nair: { clip: 'a_spinkick', from: 0.2, strike: 0.9, to: 1.2 },
    fair: { clip: 'a_flykick', from: 0.2, strike: 0.55, to: 0.9 },
    bair: { clip: 'a_spinkick', from: 0.2, strike: 0.6, to: 1.0 },
    uair: { clip: 'm_highkick', from: 0.6, strike: 1.05, to: 1.5 },
    dair: { clip: 'a_jumppunch', from: 0.1, strike: 0.45, to: 0.8 },
    grab: { clip: 'm_grabthrow', from: 0.35, strike: 0.8, to: 1.2 },
    throw: { clip: 'm_grabthrow', keys: [[0, 3.0], [13, 3.45], [30, 4.2]] },
    dashattack: { clip: 'm_slide', keys: [[0, 0.05], [6, 0.4], [34, 0.95], [42, 1.3]] }, // thrown forward on the skateboard
    ledgeattack: { clip: 'm_ljab', from: 0.15, strike: 0.47, to: 0.9 },
    sp_n: { clip: 'm_talk', keys: [[0, 3.0], [64, 6.4]] },                   // talking, waving his arms, much too fast
    sp_s: { clip: 'a_vault', keys: [[0, 0.1], [14, 0.75], [30, 1.3], [50, 1.95]] }, // over the ticket gate
    sp_u: { clip: 'a_ollie', keys: [[0, 0.35], [5, 0.9], [26, 1.45], [56, 2.6], [90, 2.9]] },
    sp_d: { clip: 'm_funk', from: 0.4, to: 5.6, cycle: [17, 18], rate: 1 },             // the funk de Lyon (held: on and on)
  },
  // RONARE (Meshy rig): clips of the others moved onto his skeleton (tools/art/meshy_transfer.py, then meshy_pack.py):
  // Pandrezz's whole set (the jabs are the shared boxing clips of poser.js), Epektase's guitar swings for the bass,
  // OMFU's scratch, Aboueb's carpet, Tices's frisbee. The down smash's headstand is a pose (RONARE_RIG, body turned over)
  ronare: {
    dashattack: { clip: 'u_pandrezz_dash', from: 0.55, strike: 1.05, to: 1.3 },                       // the flying side kick
    smash: { clip: 'm_chargedslash', from: 0.2, strike: 1.17, to: 2.0 },                               // the bass swung forward
    usmash: { clip: 'm_upslash', keys: [[0, 0.6], [7, 0.75], [10, 0.9], [16, 1.15], [48, 1.7]] },     // the bass up in an arc
    sp_n: { clip: 'u_tices_frisbee', keys: [[0, 0.2], [11, 0.7], [15, 0.4], [19, 0.72], [40, 1.1]] }, // two records flung
    sp_s: { clip: 'u_tices_frisbee', keys: [[0, 0.2], [5, 0.7], [40, 0.75], [58, 1.1]] },             // the jack thrown, held out
    sp_d: { clip: 'u_omfu_scratch', keys: [[0, 0.1], [12, 0.8], [36, 1.6], [48, 2.3]] },              // scratching on the turntable
    sp_u: { clip: 'm_carpet', keys: [[0, 0.2], [72, 2.8]] },                                         // cross-legged on the record
  },
  // the eight first characters (their Blender skeletons get the clips through tools/art/legacy_pack.py); the others
  // keep a hand-made dash attack pose (it reads better than their generated take)
  micron: { dashattack: { clip: 'u_micron_dash', from: 0.3, strike: 0.75, to: 1.25 } },
  bubba: { dashattack: { clip: 'u_bubba_dash', from: 0.3, strike: 0.8, to: 1.35 } },
  shark: { dashattack: { clip: 'u_shark_dash', from: 0.25, strike: 0.6, to: 1.2 } },
};

// moves shared by every packed character (the kit's combo enders), by pose
export const NATIVE_POSES = {
  headbutt: { clip: 'u_headbutt', from: 0.2, strike: 0.6, to: 1.2, mirror: true },
};

// emotes (Tripo presets): shown when the character is picked on the character select, and its victory dance
export const EMOTES = {
  aboueb: { select: { emote: 'crossover_dribble' }, win: { emote: 'dance_02' } },
  tices: { select: { emote: 'laugh_02' }, win: { emote: 'dance_04' } },
  omfu: { select: { emote: 'dance_03' }, win: { emote: 'dance_05' } },
  lolobiscotto: { select: { emote: 'greet_01' }, win: { emote: 'dance_06' } },
  jsan: { select: { emote: 'play_mobile_game' }, win: { emote: 'clap' } },
  nymano: { select: { emote: 'sob' }, win: { emote: 'sing_02' } },
  bido: { select: { emote: 'jump_rope_01' }, win: { emote: 'heart_pose' } },
  pandrezz: { select: { emote: 'angry_02' }, win: { emote: 'victory_celebration' } },
  ronare: { select: { emote: 'angry_02' }, win: { emote: 'victory_celebration' } },
  frog: { select: { emote: 'dance_01' }, win: { emote: 'dance_03' } },
  micron: { select: { emote: 'bow' }, win: { emote: 'greet_01' } },
  bubba: { select: { emote: 'laugh_01' }, win: { emote: 'dance_05' } },
  parmesan: { select: { emote: 'agree' }, win: { emote: 'clap' } },
  pika: { select: { emote: 'cheer' }, win: { emote: 'victory_celebration' } },
  tung: { select: { emote: 'angry_01' }, win: { emote: 'dance_04' } },
  shark: { select: { emote: 'freaky' }, win: { emote: 'dance_06' } },
  catlady: { select: { emote: 'complain_01' }, win: { emote: 'laugh_02' } },
  epektase: { select: { emote: 'm_select' }, win: { emote: 'm_victory' } },
  pprod: { select: { emote: 'm_select' }, win: { emote: 'm_victory' } },
  skanky: { select: { emote: 'm_select' }, win: { emote: 'm_funk' } },
  anbuu: { select: { emote: 'm_select' }, win: { emote: 'm_victory' } },
};

// the states played from the character's own clips (the others keep the procedural poses): clip, playback rate
// (clip seconds per second in the state), from (clip time at the start), loop; body: false = the clip moves the
// whole body itself (the roll, lying down), the poser's spins and lying down are dropped
export const NATIVE_STATES = {
  epektase: {
    jumpsquat: { clip: 's_squat', rate: 1.6 }, land: { clip: 's_land', rate: 1.4 },
    rise: { clip: 's_rise', loop: true, rate: 0.6 }, fall: { clip: 's_fall', loop: true, rate: 0.6 },
    crouch: { clip: 's_crouch', rate: 1.5 },
    shield: { clip: 's_block', loop: true },
    dodge: { clip: 'm_dodge', rate: 1.6 }, roll: { clip: 'm_roll', rate: 1.7, body: false }, airdodge: { clip: 's_airdodge', rate: 1.6 },
    ledge: { clip: 's_ledge', loop: true },
    down: { clip: 's_down', rate: 1.5, body: false }, getup: { clip: 's_getup', rate: 2.2 }, tech: { clip: 's_getup', rate: 3 },
    dizzy: { clip: 's_dizzy', loop: true }, stunned: { clip: 's_dizzy', loop: true },
    // held by someone: it struggles (bought on Skanky as text to motion, moved onto every rig)
    grabbed: { clip: 'm_struggle', loop: true, rate: 1.3 }, held: { clip: 'm_struggle', loop: true, rate: 1.3 },
    // the climb out of the hang (bought on Skanky as text to motion, moved onto the two other Meshy rigs)
    ledgeclimb: { clip: 'l_climb', rate: 4.2 },
  },
};
// PPROD: the same states, out of his own clips
NATIVE_STATES.pprod = { ...NATIVE_STATES.epektase };
// SKANKY: the same states, out of his own clips
NATIVE_STATES.skanky = { ...NATIVE_STATES.epektase };
NATIVE_STATES.anbuu = { ...NATIVE_STATES.epektase };

// the climb over a ledge for the characters without their own (bought on Skanky, moved onto every Tripo and Blender
// skeleton by tools/art/tripo_pack.py / legacy_pack.py): played by the poser during a ledge getup
export const LEDGE_CLIMB = { clip: 'm_ledgeclimb', rate: 4.2 };
// held by someone: the struggle, for the characters without their own states
export const GRABBED = { clip: 'm_struggle', rate: 1.3 };
// a long fall, arms and legs flailing (Mixamo's Falling Idle, moved onto every rig by tools/art/mixamo_add.py): the
// long drops, the fast fall, the helpless fall, the end of a tumble; it flails faster the faster the fall
export const FALLING = { clip: 'x_fall', rate: 0.85 };

// jumps, flips and crouching (Mixamo, 16 Oct 2026: tools/blender/fbx2glb.py, tools/art/meshy_transfer.py, moved onto
// every skeleton), for every character, its own states included. Times are the clip's own seconds:
//   jump: the vertical jump, played along the real flight (air: takeoff, top, touch; the clip follows the speed
//         up and down, so a short hop and a long fall look right) and its crouch before takeoff (squat)
//   land: back on the ground (from the touch: the knees take it, then it stands up), over the landing and the
//         first moments standing (cut short by walking, running, crouching)
//   flip (first jump forward, and an air jump straight up), twist (second jump forward), back (any jump backward):
//         from..to played in time seconds from the takeoff, then the jump's flight takes over
//   crouch / stand: getting down into the crouch, getting back up out of it, in time seconds
//   trip: slipped on a puddle (Nymano's tears, the shiba's poop, Lolobiscotto's Ricard): stumbles, falls, rolls
//         over and stays down until it gets up
//   down: knocked down (a launch that hits the floor without a tech): falls on its back, the legs kick up, it lies
//         there until it gets up
//   hang: catching a ledge (Jumping To Hanging, from the hands on the edge): the body swings in, then hangs, arms
//         straight (the hands put on the edge, the body against the wall: RigModel.ledgeFit and reach.js)
//   float: levitating (ANBUU's Confusion: stunned with F.levT), a loop
//   roll: the roll (Run To Rolling, the dive to the getting up), along the roll
//   dizzy: dizzy or stunned on its feet (a broken shield...), a loop
// The sim moves the body: in the air the clips' hip motion is dropped, on the ground only its height is kept.
export const JUMPS = {
  jump: { clip: 'm_xjump', air: [0.8, 1.1, 1.36], squat: [0.45, 0.78] },
  land: { clip: 'm_xland', from: 0.4, to: 1.3, time: 0.3 },
  flip: { clip: 'm_xflip', from: 0.05, to: 1.0, time: 0.55 },
  twist: { clip: 'm_xtwist', from: 0.12, to: 0.98, time: 0.6 },
  back: { clip: 'm_xback', from: 0.3, to: 0.98, time: 0.5 },
  crouch: { clip: 'm_xcrouch', from: 0.25, to: 0.67, time: 0.16 },
  stand: { clip: 'm_xstand', from: 0.0, to: 0.47, time: 0.2 },
  trip: { clip: 'm_xtrip', from: 0.0, to: 1.45, time: 1.0 },
  down: { clip: 'm_xdown', from: 0.22, to: 1.2, time: 0.65 },
  hang: { clip: 'm_xhang', from: 0.3, to: 1.5, time: 1.1 },
  float: { clip: 'm_xfloat', rate: 1 },
  roll: { clip: 'm_xroll', from: 0.12, to: 1.5 },
  dizzy: { clip: 'm_xdizzy', rate: 1 },
};

// the runs (Mixamo, 17 Oct 2026, moved onto every skeleton like the jumps): sprint (Fast Run: leaning in, arms
// pumping), ninja (Run: leaning far forward, arms swept back), heavy (Running: upright, bouncing). speed: the run speed
// (m/s, for a 1.8 m fighter) at which the clip plays at its own pace: its own speed x 1.8 (cartoon strides: the legs
// never spin too fast); the clip's pace follows the distance run
export const RUNS = {
  sprint: { clip: 'm_xrun3', speed: 9.5 },
  ninja: { clip: 'm_xrun2', speed: 7.2 },
  heavy: { clip: 'm_xrun1', speed: 6.5 },
};
// each character's, after its archetype (src/sim/chars/archetypes.js) and its weight; the others keep their own run
// (SKANKY on his skate, ANBUU gliding, PPROD's slide)
export const RUN_OF = {
  pandrezz: 'sprint', ronare: 'sprint', nymano: 'sprint', epektase: 'sprint', micron: 'sprint', pika: 'sprint', tices: 'sprint',
  frog: 'ninja', shark: 'ninja', jsan: 'ninja',
  bido: 'heavy', omfu: 'heavy', bubba: 'heavy', parmesan: 'heavy', aboueb: 'heavy', tung: 'heavy', catlady: 'heavy', lolobiscotto: 'heavy',
};

export function keysAt(keys, f) {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, t1] = keys[i];
    if (f <= f1) { const [f0, t0] = keys[i - 1]; return t0 + (t1 - t0) * (f - f0) / Math.max(1e-6, f1 - f0); }
  }
  return keys[keys.length - 1][1];
}

// Kerrian: BIDO's and Skanky's clips copied onto his rig (tools/art/model_clips.py); the moves without one of their
// own (hook, axe, coffee, fork, the syringe) keep the shared clips of their pose (CLIP_MOVES) or the procedural one
NATIVE_MOVES.kerrian = {
  jab1: { clip: 'm_rjab', from: 0.3, strike: 0.6, to: 1.0 },                // right
  jab2: { clip: 'm_ljab', from: 0.15, strike: 0.47, to: 0.9 },              // left (then the headbutt: NATIVE_POSES)
  ftilt: { clip: 'm_lhook', from: 0.1, strike: 0.32, to: 0.7 },             // the hook (library lot, 17 Oct 2026)
  utilt: { clip: 'm_knee', from: 0.45, strike: 0.9, to: 1.5 },              // the knee
  dtilt: { clip: 'm_axe2', from: 0.2, strike: 0.72, to: 1.4 },             // the axe, both hands locked (text to motion)
  dsmash: { clip: 'm_axe2', from: 0.15, strike: 0.75, to: 1.6 },
  dashattack: { clip: 'm_rhook', from: 0.2, strike: 0.62, to: 1.2 },        // the charged hook
  sp_n: { clip: 'm_dart', keys: [[0, 1.9], [9, 2.75], [28, 3.35]] },        // the syringe thrown like a dart
  insulin: { clip: 'm_inject', keys: [[0, 0.4], [8, 0.95], [20, 1.5], [44, 2.6]] }, // the shot in his arm (text to motion)
  sp_s: { clip: 'm_coffee', keys: [[0, 0.3], [12, 0.8], [30, 1.35], [46, 2.2]] },   // the hot coffee thrown (text to motion)
  // the ultimate, BOOGIE ROCKET: the bazooka up on his shoulder (intro), the shot and its recoil, held while it hits
  ult_a: { clip: 'm_bazooka', keys: [[0, 0.3], [40, 1.6], [54, 1.8]] },
  ult_b: { clip: 'm_bazooka', keys: [[0, 1.8], [6, 2.05], [26, 2.35]] },
  ult_c: { clip: 'm_bazooka', keys: [[0, 2.35], [60, 2.9]] },
  sp_d: { clip: 'm_forkslam', keys: [[0, 0.6], [10, 1.35], [17, 1.6], [40, 2.6]] }, // he calls the giant fork down
  smash: { clip: 'm_straightkick', from: 0.3, strike: 0.72, to: 1.2 },      // the Paraboot kick
  usmash: { clip: 'm_uppercut', from: 0.3, strike: 0.6, to: 0.95 },
  nair: { clip: 'a_spinkick', from: 0.2, strike: 0.9, to: 1.2 },
  fair: { clip: 'a_flykick', from: 0.2, strike: 0.55, to: 0.9 },
  bair: { clip: 'a_spinkick', from: 0.2, strike: 0.6, to: 1.0 },
  uair: { clip: 'm_highkick', from: 0.6, strike: 1.05, to: 1.5 },
  dair: { clip: 'a_jumppunch', from: 0.1, strike: 0.45, to: 0.8 },
  grab: { clip: 'm_grabthrow', from: 0.35, strike: 0.8, to: 1.2 },          // the tackle at the waist
  throw: { clip: 'm_grabthrow', keys: [[0, 3.0], [13, 3.45], [30, 4.2]],
    byKind: { b: { clip: 'm_suplex', keys: [[0, 1.0], [13, 2.35], [30, 3.4]] } } }, // back: the German suplex (text to motion)
  sp_u: { clip: 'a_hdash', keys: [[0, 0.0], [4, 0.25], [15, 0.6], [26, 1.1]] }, // the hollow dash (text to motion, stood up)
};
EMOTES.kerrian = { select: { emote: 'cheer' }, win: { emote: 'm_victory' } };
RUN_OF.kerrian = 'heavy';
