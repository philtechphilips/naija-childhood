"""
Builds public/audio/skipping-count.mp3: kids counting skips ("one" ... "twenty",
then the tens up to "hundred") and shouting "pepper!". Same Piper setup and
public-domain LJ Speech voice as build_chant.py.
Run:
  ./venv/bin/python scripts/chant/build_counts.py <folder with lj.onnx>
  ffmpeg -i <folder>/counts.wav -ar 44100 -ac 1 -c:a libmp3lame -b:a 64k public/audio/skipping-count.mp3
Then copy the printed offsets into COUNT_SPRITE in games/skipping/shared.ts.
"""
import json, os, sys, unicodedata, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

WORDS = {
    "1": "wˈʌn!", "2": "tˈuː!", "3": "θɹˈiː!", "4": "fˈɔːɹ!", "5": "fˈaɪv!", "6": "sˈɪks!", "7": "sˈɛvən!", "8": "ˈeɪt!",
    "9": "nˈaɪn!", "10": "tˈɛn!", "11": "ɪlˈɛvən!", "12": "twˈɛlv!", "13": "θɜːtˈiːn!", "14": "fɔːɹtˈiːn!", "15": "fɪftˈiːn!",
    "16": "sɪkstˈiːn!", "17": "sɛvəntˈiːn!", "18": "eɪtˈiːn!", "19": "naɪntˈiːn!", "20": "twˈɛnti!", "30": "θˈɜːɾi!",
    "40": "fˈɔːɹɾi!", "50": "fˈɪfti!", "60": "sˈɪksti!", "70": "sˈɛvənti!", "80": "ˈeɪɾi!", "90": "nˈaɪnti!", "100": "hˈʌndɹɪd!",
    "pepper": "pˈɛpɚ!",
}

folder = sys.argv[1] if len(sys.argv) > 1 else "."
voice = PiperVoice.load(os.path.join(folder, "lj.onnx"))
sr = voice.config.sample_rate
cfg = SynthesisConfig(length_scale=0.78, noise_scale=0.5, noise_w_scale=0.6)
gap = np.zeros(int(sr * 0.15), dtype=np.float32)
parts, meta, t = [gap], {}, len(gap) / sr
for name, ipa in WORDS.items():
    ph = list(unicodedata.normalize("NFD", ipa))
    ph = [p for p in ph if p in voice.config.phoneme_id_map]
    a = voice.phoneme_ids_to_audio(voice.phonemes_to_ids(ph), cfg)
    a = (a / max(1e-4, np.abs(a).max()) * 0.95).astype(np.float32)
    env = np.convolve(np.abs(a), np.ones(110) / 110, mode="same")
    idx = np.where(env > 0.02)[0]
    a = a[max(0, idx[0] - int(sr * 0.008)) : min(len(a), idx[-1] + int(sr * 0.03))].copy()
    fade = int(sr * 0.012)
    a[-fade:] *= np.linspace(1, 0, fade)
    meta[name] = [round(t, 4), round(len(a) / sr, 4)]
    parts += [a, gap]
    t += (len(a) + len(gap)) / sr
with wave.open(os.path.join(folder, "counts.wav"), "wb") as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sr)
    f.writeframes((np.concatenate(parts) * 32767).astype(np.int16).tobytes())
print(json.dumps(meta))
