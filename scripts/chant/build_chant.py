"""
Builds public/audio/ten-ten-chant.mp3: the Ten-Ten counting chant words
("ten" ... "hundred", "play") voiced with Piper TTS and packed into one sprite.

Voice: Piper en_US-ljspeech-high (LJ Speech dataset, public domain).
  https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/high

Setup (in a scratch folder):
  python3 -m venv venv && ./venv/bin/pip install piper-tts
  download en_US-ljspeech-high.onnx and .onnx.json as lj.onnx / lj.onnx.json
Run:
  ./venv/bin/python scripts/chant/build_chant.py <folder with lj.onnx>
  ffmpeg -i <folder>/chant.wav -ar 44100 -ac 1 -c:a libmp3lame -b:a 64k public/audio/ten-ten-chant.mp3
Then copy the printed offsets into CHANT_SPRITE in games/ten-ten/chant.ts.

Phonemes are passed as IPA directly, so espeak-ng isn't needed.
"""
import json, os, sys, unicodedata, wave

import numpy as np
from piper import PiperVoice, SynthesisConfig

WORDS = {
    "ten": "tˈɛn!", "twenty": "twˈɛnti!", "thirty": "θˈɜːɾi!", "forty": "fˈɔːɹɾi!",
    "fifty": "fˈɪfti!", "sixty": "sˈɪksti!", "seventy": "sˈɛvənti!", "eighty": "ˈeɪɾi!",
    "ninety": "nˈaɪnti!", "hundred": "hˈʌndɹɪd!", "play": "plˈeɪ!",
}

folder = sys.argv[1] if len(sys.argv) > 1 else "."
voice = PiperVoice.load(os.path.join(folder, "lj.onnx"))
sr = voice.config.sample_rate
cfg = SynthesisConfig(length_scale=0.8, noise_scale=0.5, noise_w_scale=0.6)
gap = np.zeros(int(sr * 0.2), dtype=np.float32)

parts, meta, t = [gap], {}, len(gap) / sr
for name, ipa in WORDS.items():
    audio = voice.phoneme_ids_to_audio(voice.phonemes_to_ids(list(unicodedata.normalize("NFD", ipa))), cfg)
    a = (audio / max(1e-4, np.abs(audio).max()) * 0.95).astype(np.float32)
    # Trim silence, keep a few ms of lead-in, fade the tail.
    env = np.convolve(np.abs(a), np.ones(110) / 110, mode="same")
    idx = np.where(env > 0.02)[0]
    a = a[max(0, idx[0] - int(sr * 0.008)) : min(len(a), idx[-1] + int(sr * 0.03))].copy()
    fade = int(sr * 0.012)
    a[-fade:] *= np.linspace(1, 0, fade)
    meta[name] = [round(t, 4), round(len(a) / sr, 4)]
    parts += [a, gap]
    t += (len(a) + len(gap)) / sr

with wave.open(os.path.join(folder, "chant.wav"), "wb") as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sr)
    f.writeframes((np.concatenate(parts) * 32767).astype(np.int16).tobytes())
print(json.dumps(meta, indent=1))
