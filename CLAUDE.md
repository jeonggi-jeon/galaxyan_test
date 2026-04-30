# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GALAXYAN** is an HTML5 Canvas arcade shoot'em up game (Galaga-style), built with vanilla JavaScript. It features a neon aesthetic, progressive difficulty levels, multiple weapon types, and full mobile/touch support.

- **Supported platforms**: Any modern browser (mobile and desktop)
- **No build system**: Vanilla JS loaded directly via `<script>` tags in `index.html`
- **Language**: Korean UI text throughout

## Architecture

The codebase is organized with IIFE (Immediately Invoked Function Expression) patterns to avoid global scope pollution. The game uses a single Canvas element for rendering and runs a game loop via `requestAnimationFrame`.

### Core Modules

- **`input.js`** (226 lines): Handles all input — keyboard keys, mouse, and touch events. Provides the `Input` global object with methods like `init()`, `isKeyPressed()`, and touch/pointer coordinate translation. Touch input uses relative movement (delta tracking) rather than absolute positioning.

- **`entities.js`** (1862 lines): Game constants and configuration. Defines entity specs:
  - `PLAYER`: dimensions, speed, fire cooldown, max HP
  - `ENEMY`: grid layout (5 rows × 11 cols), formation movement, dive behavior
  - `BULLET`: projectile dimensions and velocities
  - `LEVEL`: difficulty scaling (bullet speed, spread, cooldown penalties)
  - `WEAPON`: 14 weapon types (standard, plasma, shard, bolt, rail, ember, nova, burst, arc, comet, prism, ion, specter, ripple) with distinct visual styles and fire rates
  - Helper functions for color lookup by enemy row, shot patterns, weapon rendering

- **`game.js`** (1821 lines): Game loop and core simulation. Contains:
  - `Game.init(canvas)`: Sets up the game state and starts the animation loop
  - `update(dt)`: Advances frame-based physics and logic (player movement, shooting, enemy AI, collision detection, particle effects, explosions)
  - Rendering functions for all entities (player, enemies, bullets, HUD, particles, rings)
  - Enemy formation control, dive behavior, hit flash animation
  - Collision detection (AABB) for bullets/enemies, player/enemies

- **`main.js`** (10 lines): Entry point. Detects touch input, initializes `Input` and `Game`.

### Key Constants & Tuning

All gameplay parameters are centralized in `entities.js` and `game.js` for easy balancing:
- **`DAMAGE_BULLET`** / **`DAMAGE_CONTACT`**: Damage per enemy bullet / contact (game.js, line 10–11)
- **`DIVE_MAX_SECONDS`**: Max dive duration before AI returns to formation (game.js, line 13)
- **`FORMATION_EXTRA_STOP_ABOVE`**: Extra descend penalty when formation hits screen edges (game.js, line 21)
- **Level scaling**: Each level increases bullet speed (`bulletSpeedPerLevel`), spread angle, and shot count
- **Weapon balance**: `cdMul` (cooldown multiplier), `vyMul` (velocity multiplier), `pierce` (piercing rounds)

## Development Workflow

### Running the Game

1. **Local development**: Open `index.html` in a browser (no server required for basic testing)
2. **Mobile testing**: Deploy to a web server or use a tunneling tool (ngrok, Tailscale) to test touch input on a real device

### Making Changes

- **Tuning gameplay**: Edit constants in `entities.js` (weapon specs, enemy behavior, player speed) or `game.js` (damage, formation descent, etc.)
- **Adding visuals**: Update render functions in `game.js` (entity drawing, particle effects, HUD rendering)
- **Input behavior**: Modify `input.js` to adjust key bindings, touch sensitivity, or movement mechanics
- **Styling**: Edit `css/style.css` for UI, animations, and neon effects

### Testing Approach

- Test in multiple browsers (Chrome, Firefox, Safari) for rendering consistency
- Test on actual mobile devices (iOS/Android) to verify touch input, which has different latency/precision than desktop
- Check at different screen sizes (portrait vs. landscape)
- Profile performance (FPS drops, CPU usage) on lower-end devices

### Common Debugging Patterns

- **Game state inspection**: Game state is stored in a global `state` object passed through `update()` and render functions
- **Particle/ring effects**: Managed in `state.fxParticles` and `state.fxRings`; tweak spawn counts, lifetime, velocity, and colors in the spawn functions
- **Collision bugs**: Use hit flash animation (`enemy.hitFlash`) and spark spawning (`spawnEnemyHitSparks()`) to visually confirm hits
- **Enemy AI**: Dive behavior is controlled by internal enemy state; check formation anchor position (`anchorX`, `anchorY`) and individual dive timers

## File Map

```
D:\workspace\galaxyan_test\
├── index.html           # HTML structure, canvas, UI overlays, game entry point
├── manifest.json        # PWA metadata
├── css/style.css        # All styling (neon theme, animations, responsive layout)
└── js/
    ├── main.js          # Entry point (10 lines)
    ├── input.js         # Input handling (keyboard, touch, pointers)
    ├── entities.js      # Game constants, entity specs, helper functions
    ├── game.js          # Game loop, update/render logic
    └── ... (no other files)
```

## Notes

- The game uses **no external libraries** — all rendering and game logic is custom Canvas/DOM code
- Touch input converts absolute pointer positions to relative movement deltas for smoother mobile gameplay
- The neon aesthetic is achieved through CSS glows, text shadows, and procedural particle colors
- Enemy formation is handled as a single group with an anchor point; individual enemies track their offset within the formation
- Difficulty ramping is smooth: each level increases challenge via bullet speed, enemy spread, and shot count

## Korean Key Points

The UI is in Korean. Key terms used in the codebase and git commits:
- **위치조정**: Position adjustment
- **탄 종류**: Bullet types / weapons
- **적기 수정**: Enemy fixes
- **정보 변경**: Information/UI changes
