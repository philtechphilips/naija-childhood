/**
 * The Ten-Ten counting chant: each bar the number is called three times
 * (on CLAP, CLAP, JUMP) and everyone shouts "PLAY!" on the throw.
 * The count climbs by tens and a full round ends at a hundred.
 */
export const CHANT_NUMBERS = ["ten", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred"] as const;

export type ChantWord = (typeof CHANT_NUMBERS)[number] | "play";

export const chantNumber = (barIndex: number) => CHANT_NUMBERS[((barIndex % 10) + 10) % 10]!;

/** Word sung on beat 0..3 of a bar. */
export const chantWord = (barIndex: number, beat: number): ChantWord => (beat >= 3 ? "play" : chantNumber(barIndex));

/** [start, duration] in seconds inside public/audio/ten-ten-chant.mp3 (built by scripts/chant/build_chant.py). */
export const CHANT_SPRITE: Record<ChantWord, [number, number]> = {
  ten: [0.2, 0.301],
  twenty: [0.701, 0.3674],
  thirty: [1.2684, 0.4725],
  forty: [1.9409, 0.4222],
  fifty: [2.5631, 0.383],
  sixty: [3.1462, 0.4252],
  seventy: [3.7714, 0.5138],
  eighty: [4.4852, 0.2854],
  ninety: [4.9706, 0.3891],
  hundred: [5.5597, 0.4146],
  play: [6.1742, 0.2511],
};

export const CHANT_URL = "/audio/ten-ten-chant.mp3";
