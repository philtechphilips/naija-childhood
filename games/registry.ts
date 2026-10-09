import type { GameDefinition, GameSlug } from "./types";

const DIFFICULTY = {
  id: "difficulty",
  label: "Opponent",
  choices: [
    { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard" },
  ],
  defaultValue: "normal",
};

export const GAMES: GameDefinition[] = [
  {
    slug: "ten-ten",
    name: "Ten-Ten",
    tagline: "Clap, clap, jump — throw your leg!",
    description:
      "The school-yard rhythm battle. Clap and jump on the beat, then throw a foot left or right. Read your opponent, keep the rhythm, and race to ten points.",
    photo: "ten-ten",
    accent: "#ffd166",
    difficulty: "Medium",
    players: "1–2 players",
    sessionLength: "2–3 min",
    howTo: [
      { title: "Keep the beat", body: "Clap, clap, jump… then throw one foot out on THROW. Late or early is a foul." },
      { title: "Leader matches", body: "When you lead, you score if both feet land on the SAME side." },
      { title: "Follower dodges", body: "When she leads, you score by landing on the OTHER side. Winner leads next." },
    ],
    controlsHelp: "Tap Left foot / Right foot, or press A/D or ←/→.",
    modes: [
      { id: "cpu", label: "vs CPU", description: "First to 10 against a CPU that learns your habits.", available: true },
      { id: "practice", label: "Practice", description: "First to 5 against an easy opponent, with coaching.", available: true },
      { id: "local", label: "Pass & play", description: "Two players on one phone. Split the controls.", available: true },
      { id: "online", label: "1v1 online", description: "Private rooms with friends.", available: false, badge: "Soon" },
    ],
    options: [
      { ...DIFFICULTY, modes: ["cpu"] },
      {
        id: "place",
        label: "Place",
        choices: [
          { value: "street", label: "Market street" },
          { value: "school", label: "School yard" },
          { value: "compound", label: "Compound" },
        ],
        defaultValue: "street",
      },
      {
        id: "time",
        label: "Time of day",
        choices: [
          { value: "afternoon", label: "Afternoon" },
          { value: "evening", label: "Evening" },
          { value: "rainy", label: "Rainy day" },
        ],
        defaultValue: "afternoon",
      },
    ],
    load: () => import("./ten-ten").then((m) => m.default),
  },
  {
    slug: "police-thief",
    name: "Police & Thief",
    tagline: "Run through Lagos traffic. Don't let them catch you!",
    description:
      "You snatched the meat pie and now the police dey pursue you through Lagos traffic. Dodge danfos, okadas and hawker tables, slide under fallen NEPA poles, and snatch sausage rolls and energy drinks from the roadside hawkers to keep your energy up. They only catch you when you crash.",
    photo: "police-thief",
    accent: "#7ec8ff",
    difficulty: "Medium",
    players: "1 player",
    sessionLength: "Endless",
    howTo: [
      { title: "Dodge", body: "Swipe left or right to change lanes around danfos, kekes and okadas." },
      { title: "Jump & slide", body: "Swipe up over barriers, tables and potholes. Swipe down under poles and banners." },
      { title: "Snatch from hawkers", body: "Grab a sausage roll from the roadside hawker to refill your energy, or an energy drink for a rush. Tired thieves get caught." },
    ],
    controlsHelp: "Swipe, or use the arrow keys / WASD. Space jumps, Shift slides.",
    modes: [
      { id: "run", label: "Street run", description: "Endless chase through Lagos traffic.", available: true },
      { id: "classic", label: "Compound chase", description: "90 seconds of hide-and-catch. Pick your side.", available: true },
      { id: "jailbreak", label: "Jailbreak", description: "Compound chase, two teammates already in jail.", available: true },
    ],
    options: [
      {
        id: "time",
        label: "Time of day",
        choices: [
          { value: "afternoon", label: "Afternoon" },
          { value: "evening", label: "Evening" },
          { value: "rainy", label: "Rainy day" },
        ],
        defaultValue: "afternoon",
        modes: ["run"],
      },
      {
        id: "role",
        label: "Play as",
        choices: [
          { value: "thief", label: "Thief" },
          { value: "police", label: "Police" },
        ],
        defaultValue: "thief",
        modes: ["classic"],
      },
      { ...DIFFICULTY, label: "Difficulty", modes: ["classic", "jailbreak"] },
    ],
    load: () => import("./police-thief").then((m) => m.default),
  },
  {
    slug: "suwe",
    name: "Suwe",
    tagline: "Throw the stone. Hop the boxes. No step on line!",
    description:
      "Nigerian hopscotch. Land your stone in the right box, then hop and split your way up the board and back without touching a line.",
    photo: "suwe",
    accent: "#7ee08a",
    difficulty: "Easy",
    players: "1 player",
    sessionLength: "3–5 min",
    howTo: [
      { title: "Throw", body: "Tap when the glow is on the target box to land your stone." },
      { title: "Hop & split", body: "Single box: HOP. Side-by-side boxes: SPLIT. On Easy the game waits for you; Normal and Hard keep a beat, so press as the ring closes." },
      { title: "Skip the stone", body: "Never step in the stone's box on the way up. Pick it up on the way back." },
    ],
    controlsHelp: "Tap Hop / Split on the ring, or press F / J (Space works for throws).",
    modes: [
      { id: "classic", label: "Classic", description: "Clear boxes 1 to the top. Three lives.", available: true },
      { id: "daily", label: "Daily board", description: "Everyone gets the same board today.", available: true },
    ],
    options: [
      {
        id: "difficulty",
        label: "Difficulty",
        choices: [
          { value: "easy", label: "Easy" },
          { value: "normal", label: "Normal" },
          { value: "hard", label: "Hard" },
        ],
        defaultValue: "easy",
      },
    ],
    load: () => import("./suwe").then((m) => m.default),
  },
  {
    slug: "sack-race",
    name: "Sack Race",
    tagline: "Inter-house sports! Hop am reach finish line!",
    description:
      "Sports day on the school field. Four houses, four sacks, one finish tape. Time each hop as you land to build speed, chain perfect hops for GINGER, and leap the foam hurdles on the obstacle course. Mash the button and you go fall for your sack!",
    photo: "sack-race",
    accent: "#ff9f43",
    difficulty: "Medium",
    players: "1 player vs CPU",
    sessionLength: "30–45 sec",
    howTo: [
      { title: "Hop as you land", body: "Press HOP just as your sack touches the ground. The ring shows when. Go right on the whistle for a rocket start, but press before it and na false start." },
      { title: "Get ginger", body: "Four Perfect hops in a row and you get GINGER: more top speed until you miss one. Press too early twice and you fall in your sack (not on Easy)." },
      { title: "Obstacle course", body: "LEAP over the foam hurdles (the ring turns purple). Hop into one and you knock it down and fall. Land in mud and you go wobble till you hop out." },
    ],
    controlsHelp: "Tap HOP, or press Space / ↑. On the obstacle course, LEAP is J / Shift / →.",
    modes: [
      { id: "race", label: "Sports day race", description: "30 m flat. You're Blue House against Red, Green and Yellow.", available: true },
      { id: "obstacles", label: "Obstacle course", description: "34 m with foam hurdles to leap and mud to dodge.", available: true, badge: "New" },
    ],
    options: [
      {
        id: "difficulty",
        label: "Difficulty",
        choices: [
          { value: "easy", label: "Easy" },
          { value: "normal", label: "Normal" },
          { value: "hard", label: "Hard" },
        ],
        defaultValue: "easy",
      },
    ],
    load: () => import("./sack-race").then((m) => m.default),
  },
  {
    slug: "skipping",
    name: "Skipping Rope",
    tagline: "Jump in! One, two, three… PEPPER!",
    description:
      "Two friends turn the long rope and everybody counts. Jump every time the rope comes round. It gets faster and faster, and when they shout PEPPER, hold on!",
    photo: "skipping",
    accent: "#ff6fae",
    difficulty: "Medium",
    players: "1 player",
    sessionLength: "1–3 min",
    howTo: [
      { title: "Jump on time", body: "Press JUMP when the rope dot reaches the yellow wedge, so the rope passes under you." },
      { title: "Count it up", body: "Every clean jump counts. Streaks of 10 multiply your points." },
      { title: "Pepper!", body: "Every 15 jumps the turners go fast for 6 rounds. Pepper jumps score double." },
    ],
    controlsHelp: "Tap JUMP, or press Space / ↑.",
    modes: [{ id: "classic", label: "Long rope", description: "Three lives. How many can you do?", available: true }],
    options: [
      {
        id: "difficulty",
        label: "Difficulty",
        choices: [
          { value: "easy", label: "Easy" },
          { value: "normal", label: "Normal" },
          { value: "hard", label: "Hard" },
        ],
        defaultValue: "easy",
      },
      {
        id: "place",
        label: "Place",
        choices: [
          { value: "school", label: "School yard" },
          { value: "compound", label: "Compound" },
          { value: "street", label: "Street" },
        ],
        defaultValue: "school",
      },
    ],
    load: () => import("./skipping").then((m) => m.default),
  },
];

export const ROADMAP = ["Ayo Olopon", "Tin game", "Hide & seek", "Dodgeball", "Egg & spoon", "Freeze", "Tinko tinko", "Ludo"];

export function getGame(slug: string): GameDefinition | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function gameName(slug: GameSlug): string {
  return getGame(slug)?.name ?? slug;
}
