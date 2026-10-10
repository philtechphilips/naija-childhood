import type { GameSlug } from "@/games/types";

/**
 * CPU benchmark scores shown alongside your own until online leaderboards
 * are enabled. Always labelled as CPU in the UI.
 */
export const RIVALS: Record<GameSlug, { name: string; score: number }[]> = {
  "ten-ten": [
    { name: "Mama Put Champion", score: 2850 },
    { name: "Rhythm Queen Ada", score: 2320 },
    { name: "Break-time Bisi", score: 1890 },
    { name: "Ngozi from Aba", score: 1460 },
    { name: "Small Tolu", score: 980 },
  ],
  "police-thief": [
    { name: "Inspector Musa", score: 3900 },
    { name: "Escape Artist Emeka", score: 3150 },
    { name: "Corporal Kemi", score: 2480 },
    { name: "Swift Sani", score: 1720 },
    { name: "New Recruit Obi", score: 900 },
  ],
  suwe: [
    { name: "Suwe Oracle Halima", score: 9800 },
    { name: "One-Leg Funke", score: 7200 },
    { name: "Chalk Master Ebere", score: 5100 },
    { name: "Hop-Hop Zainab", score: 3300 },
    { name: "Learner Ronke", score: 1500 },
  ],
  "sack-race": [
    { name: "Red House Captain Femi", score: 1900 },
    { name: "Kangaroo Kelechi", score: 1720 },
    { name: "Sports Prefect Zainab", score: 1450 },
    { name: "Bumpy Bayo", score: 1100 },
    { name: "Wobbly Wale", score: 700 },
  ],
  skipping: [
    { name: "Pepper Queen Amaka", score: 6200 },
    { name: "Double Dutch Dami", score: 4300 },
    { name: "Cinderella Chioma", score: 2900 },
    { name: "Tiny Toyin", score: 1500 },
    { name: "Shoelace Segun", score: 600 },
  ],
  "hide-seek": [
    { name: "Invisible Ifeoma", score: 2100 },
    { name: "Behind-the-Tank Bolu", score: 1750 },
    { name: "Sneaky Sadiq", score: 1380 },
    { name: "Giggly Gbemi", score: 900 },
    { name: "Always-Found Femi", score: 450 },
  ],
  "hand-slap": [
    { name: "Iron Palms Ikenna", score: 1300 },
    { name: "Quick-Draw Kemi", score: 1120 },
    { name: "Feint King Fola", score: 940 },
    { name: "Red Hands Rotimi", score: 600 },
    { name: "Flinchy Fatima", score: 250 },
  ],
};
