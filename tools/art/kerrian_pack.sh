#!/bin/bash
# Kerrian's game model, rebuilt in order (free): his rig and his own Meshy clips (meshy_pack.py), then the clips
# copied from BIDO and Skanky (model_clips.py: the pack rebuilds the model without them, so always the three steps)
#   bash tools/art/kerrian_pack.sh [python]      (python: one with numpy and Pillow; default python3)
cd "$(dirname "$0")/../.."
PY=${1:-python3}
"$PY" tools/art/meshy_pack.py kerrian || exit 1
"$PY" tools/art/model_clips.py bido kerrian --keep walk,run | tail -1
"$PY" tools/art/model_clips.py skanky kerrian --ref idle \
  --only m_rjab,m_ljab,m_straightkick,m_uppercut,m_grabthrow,a_spinkick,a_flykick,a_jumppunch,m_highkick,m_flyup,m_bothfists,a_risekick,m_victory | tail -1
