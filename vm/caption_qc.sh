#!/bin/bash
# QC variant of caption.sh: identical to the production script, but it also moves
# the word-confidence JSON that test_qc.py writes alongside the transcript into the
# ephemeral dir so the TUI can fetch it. The original caption.sh is left untouched.
#
# Deploy to: ~/caption_qc.sh  (invoked from ~ as `bash caption_qc.sh <in> <out>`).
# Names are sanitized space-free by the TUI (sanitizeRemoteName), so the unquoted
# `$1 $2` and `${2%.*}` are safe.
source virtual/bin/activate
cd virtual
python3 test_qc.py $1 $2
mv $2 /home/azureuser/ephemeral
# `${2%.*}.json` is the transcript name with its extension swapped for .json — the
# sidecar test_qc.py writes next to the transcript.
mv "${2%.*}.json" /home/azureuser/ephemeral
# rm $1
deactivate
