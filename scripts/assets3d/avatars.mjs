// Avatar selection and retone specs (Microsoft Rocketbox, MIT licence).
// Regions are normalised texture coordinates [x0, y0, x1, y1], origin top-left.

export const AVATARS = [
  { id: "tunde", src: "Children/Male_Child_02", kind: "child", sex: "m", name: "Tunde" },
  {
    id: "emeka",
    src: "Children/Male_Child_01",
    kind: "child",
    sex: "m",
    name: "Emeka",
    spec: {
      skin: "#5c3a28",
      skinTolerance: { h: 22, s: 0.34 },
      // Bright forehead/nose highlights fall outside the colour match: sweep the face region too.
      skinRegions: { head: [[0.3, 0.15, 0.7, 0.62]] },
      hair: { hue: [0, 60], minSat: 0.05, maxL: 0.34, target: "#141010" },
      // Blue sweater -> green school jumper
      cloth: { body: [{ hue: [190, 250], to: "#2f6b3e", minSat: 0.2 }] },
    },
  },
  {
    id: "ada",
    src: "Children/Female_Child_01",
    kind: "child",
    sex: "f",
    name: "Ada",
    spec: {
      skin: "#5a3726",
      hair: { hue: [30, 62], minSat: 0.2, target: "#15100d" },
      // Magenta top -> sky-blue school blouse; jeans -> navy
      cloth: {
        body: [
          { hue: [280, 340], to: "#3d7cc9", minSat: 0.25 },
          { hue: [190, 235], to: "#1f2b4a", minSat: 0.05, regions: [[0, 0.5, 1, 1]] },
        ],
      },
    },
  },
  { id: "aisha", src: "Children/Female_Child_02", kind: "child", sex: "f", name: "Aisha", spec: { skin: "#634030" } },
  {
    id: "police",
    src: "Adults/Male_Adult_12",
    kind: "adult",
    sex: "m",
    name: "Sergeant",
    // Denim -> Nigeria Police black uniform
    // Everything that isn't skin becomes the black uniform (shirt, trousers, boots).
    spec: { cloth: { body: [{ hue: [0, 360], to: "#15171b", minSat: 0, minL: 0, maxL: 1, contrast: 0.35, keepSkin: true }] } },
  },
  { id: "man1", src: "Adults/Male_Adult_04", kind: "adult", sex: "m", name: "Chuka" },
  { id: "man2", src: "Adults/Male_Adult_15", kind: "adult", sex: "m", name: "Musa" },
  { id: "man3", src: "Adults/Male_Adult_18", kind: "adult", sex: "m", name: "Segun" },
  { id: "woman1", src: "Adults/Female_Adult_06", kind: "adult", sex: "f", name: "Hauwa", spec: { skin: "#5e3a29" } },
  {
    id: "woman2",
    src: "Adults/Female_Adult_11",
    kind: "adult",
    sex: "f",
    name: "Ngozi",
    spec: {
      skin: "#4d2f21",
      hair: { hue: [0, 60], minSat: 0.05, maxL: 0.27, target: "#120d0b" },
      // Her hands are pinker than her face; re-tone them by region instead of by colour match.
      skinRegions: { body: [[0, 0, 0.24, 0.3], [0.76, 0, 1, 0.3], [0, 0.55, 0.26, 0.9], [0.74, 0.55, 1, 0.9]] },
    },
  },
];

const S = "all_animations_max_motextr_static";
const XY = "all_animations_max_motextr_xy";

/** Animation clips: [output name, folder, source file stem]. */
export const ANIMS = [
  ["idle_m", S, "m_idle_neutral_01"],
  ["idle_f", S, "f_idle_neutral_01"],
  ["look_m", S, "m_idle_look_around_01"],
  ["clap_f", S, "f_claphands_01"],
  ["clap_m", S, "m_claphands_01"],
  ["cheer_f", S, "f_cheer_01"],
  ["cheer_m", S, "m_cheer_01"],
  ["talk_m", S, "m_gestic_talk_neutral_01"],
  ["talk_f", S, "f_gestic_talk_neutral_01"],
  ["phone_m", S, "m_cell_phone_talk_01"],
  ["sit_m", S, "m_sit_chair_idle_neutral_01"],
  ["sit_f", S, "f_sit_chair_idle_neutral_01"],
  ["crouch_m", S, "m_crouch_idle"],
  ["walk_m", XY, "m_walk_neutral_01"],
  ["walk_f", XY, "f_walk_neutral_01"],
  ["run_m", XY, "m_run_fast_01"],
  ["run_f", XY, "f_run_fast_01"],
];
