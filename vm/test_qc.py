import whisperx
import gc
import sys
import torch

from whisperx.SubtitlesProcessor import SubtitlesProcessor

# torch.cuda.init()

device = "cuda"
audio_file = sys.argv[1]
batch_size = 8  # reduce if low on GPU mem
compute_type = "float16"  # change to "int8" if low on GPU mem (may reduce accuracy)

language = "en"

# 1. Transcribe with original whisper (batched)
model = whisperx.load_model("large-v2", device, compute_type=compute_type, language=language)

# save model to local path (optional)
# model_dir = "/path/"
# model = whisperx.load_model("large-v2", device, compute_type=compute_type, download_root=model_dir)

audio = whisperx.load_audio(audio_file)
result = model.transcribe(audio, language=language, batch_size=batch_size)
print(result["segments"])  # before alignment

# import gc; gc.collect(); torch.cuda.empty_cache(); del model

# 2. Align whisper output
model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

#### print(result["segments"]) # after alignment

# delete model if low on GPU resources
# import gc; gc.collect(); torch.cuda.empty_cache(); del model_a

# All variable names below apart from `result` are settings that can be exposed to the user.
subtitles_processor = SubtitlesProcessor(
    result["segments"],
    "en",  # two letter code to identify the language
    max_line_length=102,  # int, around 100 has been working for me
    min_char_length_splitter=72,  # int, around 70 has been working for me
    is_vtt=False,  # bool, true for vtt, false for srt format
)
subtitles_processor.save(sys.argv[2], advanced_splitting=True)  # output_path is a str with your desired filename

# QC addition: dump the aligned, word-level segments (each word carries a confidence
# `score`) next to the transcript as <output>.json. caption_qc.sh moves this into the
# ephemeral dir so the TUI can compute per-word confidence and flag lexical errors.
import json
import os

json_path = os.path.splitext(sys.argv[2])[0] + ".json"
with open(json_path, "w") as f:
    json.dump({"segments": result["segments"]}, f)

# # 3. Assign speaker labels
# diarize_model = whisperx.DiarizationPipeline(use_auth_token=YOUR_HF_TOKEN, device=device)
# # add min/max number of speakers if known
# diarize_segments = diarize_model(audio)
# # diarize_model(audio, min_speakers=min_speakers, max_speakers=max_speakers)

# result = whisperx.assign_word_speakers(diarize_segments, result)
# print(diarize_segments)
# print(result["segments"]) # segments are now assigned speaker IDs
