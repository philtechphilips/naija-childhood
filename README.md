# Naija Childhood: frontend

The Next.js PWA. The API lives in [`../backend`](../backend); see the [root README](../README.md) for running both together.

The childhood games you grew up playing — now on your phone. An installable PWA with **Ten-Ten**, **Police & Thief**, **Suwe**, **Sack Race** and **Skipping Rope**, played by realistic 3D Nigerian kids on a busy Lagos street (Three.js), with a lightweight 2D fallback for older phones.

## Run it

```bash
# from frontend/
npm install
npm run dev        # http://localhost:3000
npm test           # game rules, scoring, validation (Vitest)
npm run typecheck
npm run lint
npm run build && npm start
```

The service worker (offline play, installability) only registers in production builds.

### Graphics tiers

- **Realistic 3D** (default when the browser has WebGL2): `games/*/engine3d.ts`, built on `games/core3d/`.
- **Lite 2D**: `games/*/engine.ts` (canvas). Chosen automatically without WebGL2, or via Profile → Graphics.

Both tiers share each game's rules and match logic (`rules.ts`, `match.ts` / `sim.ts`) and HUD, so scoring and validation are identical.

## What's here

| Area | Where |
| --- | --- |
| Hub: home, games, challenges, leaderboards, profile | `app/`, `components/hub/` |
| Pre-game → play → results flow (shared by every game) | `components/game/` |
| Game plug-in contract (`GameDefinition`, `GameEngine`) | `games/types.ts`, `games/registry.ts` |
| Shared engine kit: loop, canvas/DPR, RNG, synth audio, drawing, kid renderer, scenery | `games/core/` |
| 3D kit: renderer + sky lighting presets, avatar loading/retargeting, procedural Lagos street (shophouses, signboards, danfos, kekes, market, power lines), school yard and compound places, pedestrian crowd, tyre-rolling and watching kids, street ambience | `games/core3d/` |
| Ten-Ten: rhythm timeline, pattern-learning CPU, pass & play, beat-synced music | `games/ten-ten/` |
| Police & Thief: **Street run** endless runner (`run-*.ts`) plus the original compound chase (map, A* nav grid, chase AI, jail/rescue) | `games/police-thief/` |
| Suwe: board generation, hop plan, Easy/Normal/Hard | `games/suwe/` |
| Sack Race: inter-house sports day, hop timing, CPU houses | `games/sack-race/` |
| Skipping Rope: long rope, counting crowd, PEPPER rounds | `games/skipping/` |
| Sports-day dressing (canopies, bunting, chalk lanes, finish tape) | `games/core3d/sportsday.ts` |
| XP, levels, achievements, daily challenge, score validation | `lib/` |
| Guest profile, settings (persisted to localStorage) | `stores/` |
| Online: API client, optional account, background score sync, remote config | `lib/api.ts`, `stores/account-store.ts`, `stores/sync-store.ts`, `stores/remote-config.ts` |
| PWA manifest + service worker | `app/manifest.ts`, `public/sw.js` |

Each game's rules live in a pure `rules.ts` (no DOM) so they can be unit-tested and reused server-side. Every result carries a compact log; `lib/validation.ts` replays it and rejects scores that don't match, so tampered scores never reach a leaderboard.

Game loops never run through React: engines own a fixed-timestep `requestAnimationFrame` loop on a canvas, and React only mounts the canvas, forwards input and receives the final result. Engines are lazy-loaded per game.

### Adding a game

1. Create `games/<slug>/` with `rules.ts`, an engine implementing `GameEngine`, and an `index.ts` exporting a `GameModule`.
2. Add a `GameDefinition` to `games/registry.ts` (name, photo, how-to, modes, options, `load`).
3. Add a case to `lib/validation.ts`.

## Ten-Ten rules used

Players clap, clap, jump and throw one foot LEFT or RIGHT on the beat. The **leader** scores when both feet land on the same side; the other player scores when they're on opposite sides. Late/early throws are fouls. The winner of each throw leads the next. First to 10.

Tempo starts at 96/112/126 bpm (easy/normal/hard) and rises 3 bpm per throw up to 172. Players pick a **place** (market street, school yard, compound) and a **time of day** (afternoon, evening, rainy). The music in `games/ten-ten/music.ts` is an original synthesised groove (log drum, talking drum, shekere, agogo, claps and a chant line). It is scheduled bar-by-bar on the match clock with output-latency compensation, so it speeds up with the game. It is not a recording of the traditional playground song.

## Police & Thief: Street run

An endless runner down a chaotic Lagos road. You're the thief and the police are on your heels. They only catch you when you crash:
- Running head-on into a danfo, BRT bus, keke or okada gets you caught.
- Tripping on a barrier, hawker table, pothole or hawker, or clipping a vehicle's side, brings the police right behind you. A second trip while they're close gets you caught.
- Energy drains as you run. Snatch a sausage roll from a roadside hawker to refill it, or an energy drink from the cooler for a short rush (faster, untrippable). A tired thief slows down and the police creep up.

How it's built:
- **Rules:** `run-rules.ts` holds the pure rules and the seeded pattern generator. `run-sim.ts` runs the simulation, shared by the 3D (`run3d.ts`) and 2D (`run2d.ts`) renderers.
- **Tests:** `run.test.ts` includes a look-ahead bot that has to survive long runs on many seeds. That proves every generated pattern can be passed.
- **Street:** `run-world.ts` builds the endless road from 32 m slices that leapfrog ahead of the runner. The slices include shophouses, hawkers, parked kekes and danfos, a green CMS/Oshodi gantry, an "Eko o ni baje" footbridge, and lagoon stretches with the National Theatre and the Lekki–Ikoyi Link Bridge.
- **Validation:** run scores are distance + 10 × coins. `validateRun` checks them against the run log.
- **Dev testing:** in development builds, `window.__run` exposes the running sim so automated playtests can steer.

## Music

Every game has its own original Naija-style soundtrack, synthesised live in `games/core/naija-music.ts`. There are no files and nothing licensed:

| Game | Style | Builds up when |
| --- | --- | --- |
| Police & Thief (street run and chase) | Amapiano: log-drum bass, shakers, jazzy piano | You speed up or the police close in |
| Suwe | Highlife: palm-wine guitar (Karplus-Strong plucks), bell, walking bass | You reach later boards |
| Sack Race | Afrobeats: bouncy kick, offbeat keys, a lead hook | The final stretch |
| Skipping Rope | Fuji/Apala: talking drum, sakara, agogo, shekere | PEPPER rounds |
| Ten-Ten | The counting chant groove (`games/ten-ten/music.ts`) | The beat speeds up |

Everything plays through the shared audio bus. **Sound** (the in-game 🔊 button, the pause menu, or Me) mutes it all. **Music** (pause menu or Me) turns only the beats off.

## Voices

Two short voice sprites live in `public/audio/`. They were made with [Piper](https://github.com/rhasspy/piper) and the LJ Speech voice (public-domain dataset). The build scripts are in `scripts/chant/`.
- `ten-ten-chant.mp3`: the Ten-Ten counting chant, "ten… twenty… hundred" and "play!".
- `street-shouts.mp3`: the street crowd's "Ole!", "Hold am!" and "Catch am!".

The game layers these into a crowd with different pitches. Snacks use generic sausage-roll and energy-drink packaging rather than real brand logos.

## 3D assets

`npm run assets3d` builds the asset pack in `public/3d/` (~16 MB, downloaded only when a 3D game starts and cached by the service worker):

- **Characters + mocap animations**: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT), converted FBX → glTF with meshopt compression. `scripts/assets3d/avatars.mjs` lists the avatars and how each is re-toned (skin, hair, school uniforms, the black police uniform).
- **Surfaces + props**: [Poly Haven](https://polyhaven.com) (CC0) — laterite, cracked road, interlocking paving, plaster, rusty zinc, generators, jerrycans, crates, monobloc chairs, gate, etc.

Downloads are cached in `.cache/assets3d/`. If you change the pack, bump `VERSION` in `public/sw.js` so phones fetch the new files.

## Key art

The images in the menus are renders of the 3D scenes, not photos. To regenerate them: run `npm run dev`, open `/dev/keyart?shot=ten-ten` (also `police-thief`, `suwe`, `school-friends`, `school-yard`, `intensity`, `playground`), screenshot at 1600×1200 into `assets/renders/<shot>.png`, then `npm run images`. The `/dev/*` pages are disabled in production.

## Performance notes

The 3D tier auto-picks a quality level (pixel ratio, shadow resolution, number of pedestrians) from device memory and CPU cores; see `games/core3d/stage.ts`. It has been checked in desktop Chrome and phone-sized viewports, not yet on real low-end Android hardware — that's the next thing to test.

## Not built yet (next slices from the PRD)

- NestJS + PostgreSQL + Redis backend, accounts, global leaderboards. The client is ready for it: set `NEXT_PUBLIC_API_URL` and `lib/api.ts` posts sessions; `lib/analytics.ts` batches events to `/events`.
- Online multiplayer rooms (Ten-Ten 1v1, Police & Thief team battle) — shown as "Soon" in the mode pickers.
- Ten-Ten 2v2/3v3 and tournament, cosmetics, friends.

## Online features (optional)

Set `NEXT_PUBLIC_API_URL` (see `.env.example`, e.g. `http://localhost:4000/v1`) to connect to the backend. Without it the app is fully offline, exactly as before.

- **Guests** play everything on the phone. Their last 50 finished games wait in a local queue.
- **Accounts** (Me → Create account) upload that queue and every game after it. Scores reach the global leaderboards, and best scores come back when you log in on a new phone.
- **Remote config** can switch games on or off, badge them ("New") and feature one, set the home announcement and the "coming soon" list, all without a release.

Performance rules:
- Nothing online is on the critical path. Requests run in browser idle time and never while a game is on screen.
- Uploads are batched (up to 50 per request), idempotent, and back off on failure.
- Config and leaderboards show cached data first and refresh in the background.

For a second dev server or a test build, set `NEXT_DIST_DIR` (e.g. `NEXT_DIST_DIR=.next-build`) so it doesn't share `.next` with a running `npm run dev`.
