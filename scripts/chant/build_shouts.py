"""
Builds public/audio/street-shouts.mp3: crowd shouts for the Police & Thief street run
("Ole!" is Yoruba for "thief!", plus Pidgin "Hold am!" / "Catch am!").
Same setup and voice as build_chant.py (Piper, LJ Speech voice, public domain).
Run:
  ./venv/bin/python scripts/chant/build_shouts.py <folder with lj.onnx>
  ffmpeg -i <folder>/shouts.wav -ar 44100 -ac 1 -c:a libmp3lame -b:a 64k public/audio/street-shouts.mp3
Then copy the printed offsets into SHOUT_SPRITE in games/police-thief/run-voices.ts.
"""
import json, os, sys, unicodedata, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig
folder = sys.argv[1]
voice = PiperVoice.load(os.path.join(folder, "lj.onnx"))
sr = voice.config.sample_rate
# Street shouts: Yoruba "olè" (thief!) and Pidgin calls.
WORDS = {"ole": "ˈoʊlˌeɪ!", "ole2": "oʊlˈeɪ!", "holdam": "hˈoʊld ˈæm!", "catcham": "kˈætʃ ˈæm!", "thief": "θˈiːf!"}
gap = np.zeros(int(sr * 0.2), dtype=np.float32)
parts, meta, t = [gap], {}, len(gap) / sr
for name, ipa in WORDS.items():
    cfg = SynthesisConfig(length_scale=0.85, noise_scale=0.6, noise_w_scale=0.7)
    a = voice.phoneme_ids_to_audio(voice.phonemes_to_ids(list(unicodedata.normalize("NFD", ipa))), cfg)
    a = (a / max(1e-4, np.abs(a).max()) * 0.95).astype(np.float32)
    env = np.convolve(np.abs(a), np.ones(110) / 110, mode="same")
    idx = np.where(env > 0.02)[0]
    a = a[max(0, idx[0] - int(sr * 0.008)) : min(len(a), idx[-1] + int(sr * 0.03))].copy()
    fade = int(sr * 0.015)
    a[-fade:] *= np.linspace(1, 0, fade)
    meta[name] = [round(t, 4), round(len(a) / sr, 4)]
    parts += [a, gap]
    t += (len(a) + len(gap)) / sr
with wave.open(os.path.join(folder, "shouts.wav"), "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
    f.writeframes((np.concatenate(parts) * 32767).astype(np.int16).tobytes())
print(json.dumps(meta))
