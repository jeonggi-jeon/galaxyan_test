(function (global) {
  const E = global.Entities;
  const W = E.W;
  const H = E.H;
  const PL = E.PLAYER;
  const EN = E.ENEMY;
  const BU = E.BULLET;
  const MAX_LIVES = 5;
  /** 적 탄 한 방 / 충돌 한 번당 피해량 */
  const DAMAGE_BULLET = 28;
  const DAMAGE_CONTACT = 36;
  /** 다이빙이 비정상적으로 길어질 때 포메이션으로 복귀 (초) */
  const DIVE_MAX_SECONDS = 14;
  /** 다이빙 중 적이 화면(여유 패딩) 밖으로 나가면 포메이션 복귀 */
  const DIVE_OFFSCREEN_PAD = 48;
  /**
   * 다이빙 적이 바닥에서 멈출 때 적 상단 y의 하한.
   * 예전에는 margin*3이라 적 하단이 플레이어 최하단(H-m-ph)보다 위에만 있어 충돌이 안 났음.
   * 플레이어와 AABB가 겹치도록 하단 여백은 margin 한 번 수준으로 둔다.
   */
  const DIVE_STOP_BOTTOM_GAP = EN.margin;
  /** 벽에 부딪힐 때마다 내려오는 포메이션 전체가 더 위에서 멈추도록 anchorY 상한을 추가로 줄임(px) */
  const FORMATION_EXTRA_STOP_ABOVE = 36;
  /** 적 탄 낙하 속도 상한 (고레벨 폭주 완화, px/s) */
  const ENEMY_BULLET_VY_MAX = 385;

  function enemyBulletVyMultiplier(lv) {
    const l = Math.max(1, lv | 0);
    const lowLevels = Math.min(Math.max(0, l - 1), 16);
    const past17 = Math.max(0, l - 17);
    return 1 + lowLevels * 0.052 + past17 * 0.011;
  }

  function enemyBulletHighLvBoost(lv) {
    const l = Math.max(1, lv | 0);
    const mid = Math.min(Math.max(0, l - 5), 15);
    const tail = Math.min(Math.max(0, l - 17), 18);
    const b = 1 + mid * 0.038 + tail * 0.0085;
    return Math.min(b, 1.46);
  }

  /** 레벨이 높을수록 변동폭이 넓어지는 낙하 속도 지터 */
  function enemyBulletSpeedJitter(lv) {
    const l = Math.max(1, lv | 0);
    const widen = Math.min(l, 30);
    const lo = 0.74 + widen * 0.0048;
    const hi = 1 + widen * 0.007;
    return rngRange(lo, hi);
  }

  function formationSpeedForLevel(lv) {
    const l = Math.max(1, lv | 0);
    const level1Ease = l === 1 ? 0.78 : 1;
    const ramp =
      1 +
      Math.min(l - 1, 22) * 0.092 +
      Math.max(0, l - 10) * 0.045;
    return EN.formationSpeed * level1Ease * ramp;
  }

  function formationDescendStep() {
    const lv = state ? state.level | 0 : 1;
    if (lv <= 1) return EN.descend * 0.5;
    if (lv <= 2) return EN.descend * 0.72;
    return EN.descend * (1 + Math.min(lv - 3, 18) * 0.055);
  }

  function diveIntervalRange() {
    const lv = state ? state.level | 0 : 1;
    if (lv <= 1) return [3.2, 5.0];
    if (lv <= 2) return [2.7, 4.2];
    return [EN.diveInterval[0], EN.diveInterval[1]];
  }

  function diveSpeedScale() {
    const lv = state ? state.level | 0 : 1;
    if (lv <= 1) return 0.72;
    if (lv <= 2) return 0.86;
    return 1;
  }

  function enemyFireTimerRange() {
    const lv = state ? state.level | 0 : 1;
    let min = EN.shootMin;
    let max = EN.shootMax;
    if (lv <= 1) {
      min *= 1.5;
      max *= 1.45;
    } else if (lv <= 2) {
      min *= 1.2;
      max *= 1.12;
    }
    if (lv >= 6) {
      min *= 0.88;
      max *= 0.88;
    }
    if (lv >= 12) {
      min *= 0.88;
      max *= 0.88;
    }
    return { min, max };
  }

  let canvas;
  let ctx;
  let lastTs = 0;
  let state;
  let audioCtx = null;
  let diveTimer = 0;
  let enemyShootTimer = 0;
  let flankSpawnTimer = 0;
  let powerupSpawnTimer = 0;
  let spacePrev = false;
  let renderTimeSec = 0;

  function rngRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, ms, gainVal) {
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    const t0 = ac.currentTime;
    gain.gain.setValueAtTime(gainVal, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000);
  }

  function createPlayer() {
    const maxHp = PL.maxHp != null ? PL.maxHp : 100;
    return {
      x: W / 2 - PL.w / 2,
      y: PL.y,
      w: PL.w,
      h: PL.h,
      cooldown: 0,
      invuln: 0,
      shieldHits: 0,
      hp: maxHp,
    };
  }

  const WEAPON_PICK_IDS = [
    "plasma",
    "shard",
    "bolt",
    "rail",
    "ember",
    "nova",
    "burst",
    "arc",
    "comet",
    "prism",
    "ion",
    "specter",
    "ripple",
  ];

  function rollPowerupKind() {
    const r = Math.random();
    if (r < 0.056) {
      if (state.lives < MAX_LIVES) return "heart";
      return "gem";
    }
    if (r < 0.12) return "gem";
    if (r < 0.182) return "shield";
    if (r < 0.258) return Math.random() < 0.5 ? "healPill" : "healHeart";
    return WEAPON_PICK_IDS[
      (Math.random() * WEAPON_PICK_IDS.length) | 0
    ];
  }

  function eliteSpawnChance(lv, row, rows) {
    if (lv <= 1) return 0;
    let p = Math.min(0.06 + Math.max(0, lv - 2) * 0.026, 0.34);
    if (rows >= 2 && row >= rows - 2) p *= 1.38;
    return p;
  }

  function enemyRowThreatBulletMul(row, rows, lv) {
    const l = Math.max(1, lv | 0);
    if (rows <= 1) return 1;
    const depth = row / Math.max(1, rows - 1);
    const lvRamp = Math.min(l - 1, 16) * 0.036;
    return 1 + depth * lvRamp * 1.05;
  }

  function diveThreatMul(e, rows, lv) {
    const l = Math.max(1, lv | 0);
    const depth =
      rows <= 1 ? 0 : e.row / Math.max(1, rows - 1);
    const rowMul = 1 + depth * Math.min(l - 1, 14) * 0.014;
    const eliteMul = e.elite ? 1.14 : 1;
    return rowMul * eliteMul;
  }

  function createEnemies(level) {
    const lv = Math.max(1, level | 0);
    const extraR = Math.min(Math.floor((lv - 1) / 2), 3);
    const extraC = Math.min(Math.floor((lv - 1) / 4), 2);
    const rows = Math.min(EN.rows + extraR, 8);
    const cols = Math.min(EN.cols + extraC, 14);
    let spacingX = EN.spacingX;
    if (cols >= 13) spacingX = 26;
    else if (cols >= 12) spacingX = 28;
    let spacingY = EN.spacingY;
    if (rows >= 7) spacingY *= 0.92;

    const list = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = eliteSpawnChance(lv, row, rows);
        const elite = Math.random() < p;
        const hp = elite ? 2 : 1;
        list.push({
          kind: "grid",
          col,
          row,
          alive: true,
          diving: false,
          diveVx: 0,
          diveVy: 0,
          x: 0,
          y: 0,
          divePhase: 0,
          elite,
          hp,
          maxHp: hp,
        });
      }
    }
    return { enemies: list, spacingX, spacingY, rows };
  }

  function resetRun() {
    const wave = createEnemies(1);
    flankSpawnTimer = 5;
    powerupSpawnTimer = 8;
    state = {
      phase: "playing",
      player: createPlayer(),
      bullets: [],
      enemyBullets: [],
      flankers: [],
      powerups: [],
      weapon: "standard",
      enemies: wave.enemies,
      formation: {
        anchorX: 28,
        anchorY: 62,
        vx: formationSpeedForLevel(1),
        spacingX: wave.spacingX,
        spacingY: wave.spacingY,
      },
      waveRows: wave.rows,
      score: 0,
      lives: 3,
      level: 1,
    };
    clampFormationAnchorY();
    const iv = diveIntervalRange();
    diveTimer = rngRange(iv[0], iv[1]);
    const ft = enemyFireTimerRange();
    enemyShootTimer = rngRange(ft.min * 1.35, ft.max * 1.28);
    syncHud();
    hideOverlay();
  }

  function syncHud() {
    const scoreEl = document.getElementById("score");
    const livesEl = document.getElementById("lives");
    const levelEl = document.getElementById("level");
    const hpFill = document.getElementById("hp-fill");
    const hpTrack = hpFill ? hpFill.closest(".hud-hp-track") : null;
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (livesEl) livesEl.textContent = String(state.lives);
    if (levelEl) levelEl.textContent = String(state.level);
    if (hpFill && state.player && PL.maxHp != null) {
      const mx = PL.maxHp;
      const h = Math.max(0, Math.min(mx, state.player.hp != null ? state.player.hp : mx));
      const pct = mx > 0 ? (h / mx) * 100 : 0;
      hpFill.style.width = pct + "%";
      if (hpTrack) {
        hpTrack.setAttribute("aria-valuenow", String(Math.round(h)));
        hpTrack.setAttribute("aria-valuemax", String(mx));
      }
      if (pct < 28) {
        hpFill.style.background =
          "linear-gradient(180deg,#ff9088 0%,#d83838 55%,#801010 100%)";
        hpFill.style.boxShadow = "0 0 10px rgba(255,100,90,0.5)";
      } else if (pct < 55) {
        hpFill.style.background =
          "linear-gradient(180deg,#ffe060 0%,#e8a020 50%,#a86008 100%)";
        hpFill.style.boxShadow = "0 0 10px rgba(255,200,80,0.4)";
      } else {
        hpFill.style.background =
          "linear-gradient(180deg,#9fff80 0%,#40d868 45%,#108848 100%)";
        hpFill.style.boxShadow = "0 0 10px rgba(100,255,160,0.45)";
      }
    }
  }

  function showOverlay(title, hint) {
    const overlay = document.getElementById("overlay");
    const titleEl = document.getElementById("overlay-title");
    const hintEl = document.getElementById("overlay-hint");
    const btn = document.getElementById("btn-restart");
    if (titleEl) titleEl.textContent = title;
    if (hintEl) hintEl.textContent = hint || "다시 하기 버튼 또는 스페이스";
    if (overlay) overlay.classList.remove("hidden");
    if (btn) {
      requestAnimationFrame(() => {
        btn.focus({ preventScroll: true });
      });
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function hideStartOverlay() {
    const el = document.getElementById("start-overlay");
    if (el) el.classList.add("hidden");
  }

  function beginGame() {
    hideStartOverlay();
    ensureAudio();
    const hud = document.getElementById("hud");
    if (hud) hud.classList.remove("hud-idle");
    resetRun();
  }

  function enemyRect(state, e) {
    /** 다이빙 중에는 포메이션 좌표가 아니라 독립 이동 좌표로 충돌 판정 */
    if (e.diving) {
      return { x: e.x, y: e.y, w: EN.w, h: EN.h };
    }
    const p = E.enemyWorldPos(e, state.formation);
    return { x: p.x, y: p.y, w: EN.w, h: EN.h };
  }

  function aliveEnemyCount() {
    return state.enemies.filter((e) => e.alive).length;
  }

  /** 포메이션 최하단 행이 화면 아래로 나가지 않도록 하는 anchorY 상한 */
  function maxFormationAnchorY() {
    const rows = state.waveRows || EN.rows;
    const sy =
      state.formation && state.formation.spacingY != null
        ? state.formation.spacingY
        : EN.spacingY;
    const floorGap = EN.margin * 3;
    return (
      H -
      EN.h -
      floorGap -
      Math.max(0, rows - 1) * sy -
      FORMATION_EXTRA_STOP_ABOVE
    );
  }

  function clampFormationAnchorY() {
    const cap = maxFormationAnchorY();
    if (state.formation.anchorY > cap) state.formation.anchorY = cap;
  }

  function resolveFormationWall(dt) {
    const anchor = state.formation;
    let hasGrid = false;
    for (const e of state.enemies) {
      if (e.alive && !e.diving) {
        hasGrid = true;
        break;
      }
    }
    if (!hasGrid) return;

    const sx = anchor.spacingX != null ? anchor.spacingX : EN.spacingX;
    const predictedX = anchor.anchorX + anchor.vx * dt;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of state.enemies) {
      if (!e.alive || e.diving) continue;
      const x = predictedX + e.col * sx;
      const x2 = x + EN.w;
      if (x < minX) minX = x;
      if (x2 > maxX) maxX = x2;
    }

    if (minX < EN.margin || maxX > W - EN.margin) {
      anchor.vx *= -1;
      anchor.anchorY += formationDescendStep();
      clampFormationAnchorY();
      playTone(110, 60, 0.03);
    } else {
      anchor.anchorX = predictedX;
    }
  }

  function startDiveIfNeeded(dt) {
    diveTimer -= dt;
    if (diveTimer > 0) return;

    const candidates = state.enemies.filter(
      (e) => e.alive && !e.diving && e.kind !== "flank"
    );
    if (candidates.length === 0) {
      const iv = diveIntervalRange();
      diveTimer = rngRange(iv[0], iv[1]);
      return;
    }

    const ds = diveSpeedScale();
    const rows = state.waveRows || EN.rows;
    const e = candidates[(Math.random() * candidates.length) | 0];
    const pos = E.enemyWorldPos(e, state.formation);
    e.diving = true;
    e.x = pos.x;
    e.y = pos.y;
    const tcx = state.player.x + state.player.w / 2;
    const tcy = state.player.y + state.player.h / 2;
    const mx = tcx - (e.x + EN.w / 2);
    const my = tcy - (e.y + EN.h / 2);
    const len = Math.hypot(mx, my) || 1;
    const dThreat = diveThreatMul(e, rows, state.level);
    e.diveVx = (mx / len) * EN.diveSpeed * ds * dThreat;
    e.diveVy = (my / len) * EN.diveSpeed * ds * dThreat;
    e.diveDuration = 0;
    const iv = diveIntervalRange();
    diveTimer = rngRange(iv[0], iv[1]);
    playTone(330, 40, 0.035);
  }

  function endEnemyDive(e) {
    e.diving = false;
    e.diveVx = 0;
    e.diveVy = 0;
    e.diveDuration = 0;
  }

  function updateDivingEnemies(dt) {
    const pad = DIVE_OFFSCREEN_PAD;
    const diveFloorY = H - EN.h - DIVE_STOP_BOTTOM_GAP;
    for (const e of state.enemies) {
      if (!e.alive || !e.diving) continue;
      e.x += e.diveVx * dt;
      e.y += e.diveVy * dt;
      e.diveDuration = (e.diveDuration || 0) + dt;

      if (e.y >= diveFloorY) {
        e.y = diveFloorY;
        endEnemyDive(e);
        continue;
      }

      const offScreen =
        e.y + EN.h < -pad ||
        e.y > H + pad ||
        e.x + EN.w < -pad ||
        e.x > W + pad;
      const bottomExit = e.y > H - EN.margin * 2;
      const topExit =
        e.y + EN.h < EN.margin ||
        e.y < EN.margin * 0.35;
      const diveTimeout = e.diveDuration > DIVE_MAX_SECONDS;
      if (offScreen || bottomExit || topExit || diveTimeout) {
        endEnemyDive(e);
        continue;
      }

      if (e.x < EN.margin) e.x = EN.margin;
      if (e.x + EN.w > W - EN.margin) e.x = W - EN.margin - EN.w;
    }
  }

  function tryEnemyShoot(dt) {
    enemyShootTimer -= dt;
    if (enemyShootTimer > 0) return;

    const bottom = [];
    for (const e of state.enemies) {
      if (!e.alive || e.diving || e.kind === "flank") continue;
      bottom.push(e);
    }
    if (bottom.length === 0) {
      const ft = enemyFireTimerRange();
      enemyShootTimer = rngRange(ft.min, ft.max);
      return;
    }

    const byCol = {};
    for (const e of bottom) {
      if (!byCol[e.col] || e.row > byCol[e.col].row) byCol[e.col] = e;
    }
    const cols = Object.keys(byCol);
    const pick = byCol[cols[(Math.random() * cols.length) | 0]];
    const r = enemyRect(state, pick);
    const lv = Math.max(1, state.level | 0);
    const rows = state.waveRows || EN.rows;
    const enemyVyMul = enemyBulletVyMultiplier(lv);
    const lv1Ease = lv <= 1 ? 0.75 : 1;
    const highLvBoost = enemyBulletHighLvBoost(lv);
    const rowThreat = enemyRowThreatBulletMul(
      pick.row,
      rows,
      lv
    );
    const eliteShot = pick.elite ? 1.09 : 1;
    let baseVy =
      BU.enemyVy *
      enemyVyMul *
      lv1Ease *
      highLvBoost *
      rowThreat *
      eliteShot;
    baseVy *= enemyBulletSpeedJitter(lv);

    const roll = Math.random();
    let ebW = BU.enemyW;
    let ebH = BU.enemyH;
    let ebStyle = "bar";
    let ebVx = 0;
    let ebWobbleAmp = 0;
    let ebWobblePhase = Math.random() * Math.PI * 2;
    if (roll < 0.16) {
      ebStyle = "pod";
      ebW = 9;
      ebH = 10;
    } else if (roll < 0.3) {
      ebStyle = "needle";
      ebW = 3;
      ebH = 14;
      ebVx = (Math.random() - 0.5) * 42;
    } else if (roll < 0.42) {
      ebStyle = "plasma";
      ebW = 8;
      ebH = 8;
    } else if (roll < 0.54) {
      ebStyle = "bolt";
      ebW = 4;
      ebH = 22;
    } else if (roll < 0.66) {
      ebStyle = "ember";
      ebW = 6;
      ebH = 13;
    } else if (roll < 0.76) {
      ebStyle = "shard";
      ebW = 10;
      ebH = 12;
      ebVx = (Math.random() - 0.5) * 26;
    } else if (roll < 0.88) {
      ebStyle = "arc";
      ebW = 8;
      ebH = 18;
      ebWobbleAmp = 56;
      ebWobblePhase = Math.random() * Math.PI * 2;
    }

    const styleVyMul =
      ebStyle === "pod" ? 0.92 : ebStyle === "needle" ? 1.06 : 1;
    const vyRaw = baseVy * styleVyMul;
    state.enemyBullets.push({
      x: r.x + EN.w / 2 - ebW / 2,
      y: r.y + EN.h,
      w: ebW,
      h: ebH,
      vy: Math.min(vyRaw, ENEMY_BULLET_VY_MAX),
      vx: ebVx,
      style: ebStyle,
      wobbleAmp: ebWobbleAmp || undefined,
      wobbleFreq: ebWobbleAmp ? 11 : undefined,
      wobblePhase: ebWobbleAmp ? ebWobblePhase : undefined,
    });
    const ft = enemyFireTimerRange();
    const pace = 1 / (1 + Math.min(lv - 1, 26) * 0.058);
    enemyShootTimer = rngRange(ft.min * pace, ft.max * pace);
    playTone(180, 45, 0.028);
  }

  function updatePlayer(dt) {
    const p = state.player;
    if (p.invuln > 0) p.invuln -= dt;

    const touchMode = global.Input.prefersCoarsePointer();
    let dx = 0;
    let dy = 0;
    if (global.Input.isDown("ArrowLeft") || global.Input.isDown("KeyA"))
      dx -= 1;
    if (global.Input.isDown("ArrowRight") || global.Input.isDown("KeyD"))
      dx += 1;
    if (global.Input.isDown("ArrowUp") || global.Input.isDown("KeyW"))
      dy -= 1;
    if (global.Input.isDown("ArrowDown") || global.Input.isDown("KeyS"))
      dy += 1;

    if (touchMode && global.Input.isTouching()) {
      const tx = global.Input.getTouchPlayerLeftX();
      const ty = global.Input.getTouchPlayerTopY();
      if (tx != null) p.x = tx;
      if (ty != null) p.y = ty;
    } else if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      const sp = PL.speed / len;
      p.x += dx * sp * dt;
      p.y += dy * sp * dt;
    }

    p.x = global.Input.clampPlayerLeftGame(p.x);
    p.y = global.Input.clampPlayerTopGame(p.y);

    if (p.cooldown > 0) p.cooldown -= dt;

    const fire =
      state.phase === "playing" &&
      p.cooldown <= 0 &&
      (touchMode || global.Input.isDown("Space"));
    if (fire) {
      const cx = p.x + p.w / 2;
      const cdMul = E.spawnPlayerBullets(
        cx,
        p.y,
        state.level,
        state.bullets,
        state.weapon
      );
      p.cooldown = PL.fireCooldown * cdMul;
      playTone(620, 35, 0.03);
    }
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      const vx = b.vx || 0;
      b.x += vx * dt;
      b.y += b.vy * dt;
      if (b.waveAmp) {
        if (b.wavePhase == null) b.wavePhase = 0;
        b.wavePhase += dt * (b.waveFreq || 12);
        b.x += Math.cos(b.wavePhase) * b.waveAmp * dt;
      }
    }
    state.bullets = state.bullets.filter(
      (b) =>
        b.y + b.h > 0 &&
        b.y < H &&
        b.x + b.w > 0 &&
        b.x < W
    );

    for (const b of state.enemyBullets) {
      b.y += b.vy * dt;
      const vx = b.vx || 0;
      if (vx) b.x += vx * dt;
      if (b.wobbleAmp && b.wobblePhase != null) {
        b.wobblePhase += dt * (b.wobbleFreq || 8);
        b.x += Math.sin(b.wobblePhase) * b.wobbleAmp * dt;
      }
    }
    state.enemyBullets = state.enemyBullets.filter(
      (b) => b.y < H + 40
    );
  }

  function handleCollisions() {
    const p = state.player;
    const pRect = { x: p.x, y: p.y, w: p.w, h: p.h };
    const rowScore = (row) => {
      const i = Math.min(row, EN.scoreByRow.length - 1);
      return EN.scoreByRow[i] ?? 10;
    };

    function consumePlayerBullet(idx) {
      const bb = state.bullets[idx];
      const hl = bb.hitsLeft != null ? bb.hitsLeft : 1;
      bb.hitsLeft = hl - 1;
      if (bb.hitsLeft <= 0) state.bullets.splice(idx, 1);
    }

    outer: for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      const br = { x: b.x, y: b.y, w: b.w, h: b.h };

      const flankArr = state.flankers || [];
      for (let fi = 0; fi < flankArr.length; fi++) {
        const fk = flankArr[fi];
        if (!fk.alive) continue;
        const fr = { x: fk.x, y: fk.y, w: fk.w, h: fk.h };
        if (E.rectIntersect(br, fr)) {
          fk.alive = false;
          consumePlayerBullet(i);
          state.score += 28 + Math.min(state.level * 6, 72);
          playTone(520, 45, 0.042);
          syncHud();
          continue outer;
        }
      }

      for (const e of state.enemies) {
        if (!e.alive) continue;
        const er = enemyRect(state, e);
        if (E.rectIntersect(br, er)) {
          const hp0 = e.hp != null ? e.hp : 1;
          e.hp = hp0 - 1;
          const basePts = rowScore(e.row);
          if (e.hp <= 0) {
            e.alive = false;
            const mult = e.elite ? 1.35 : 1;
            state.score += Math.floor(basePts * mult);
            playTone(440, 50, 0.04);
          } else {
            state.score += Math.max(2, Math.floor(basePts * 0.14));
            playTone(370, 32, 0.032);
          }
          syncHud();
          consumePlayerBullet(i);
          continue outer;
        }
      }
    }

    if (p.invuln <= 0 && state.phase === "playing") {
      for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
        const b = state.enemyBullets[i];
        const br = { x: b.x, y: b.y, w: b.w, h: b.h };
        if (E.rectIntersect(br, pRect)) {
          state.enemyBullets.splice(i, 1);
          playerDamage(DAMAGE_BULLET);
          return;
        }
      }

      const flankHit = state.flankers || [];
      for (let fi = 0; fi < flankHit.length; fi++) {
        const fk = flankHit[fi];
        if (!fk.alive) continue;
        const fr = { x: fk.x, y: fk.y, w: fk.w, h: fk.h };
        if (E.rectIntersect(pRect, fr)) {
          playerDamage(DAMAGE_CONTACT);
          return;
        }
      }

      for (const e of state.enemies) {
        if (!e.alive) continue;
        const er = enemyRect(state, e);
        if (E.rectIntersect(pRect, er)) {
          if (e.diving) {
            const hp0 = e.hp != null ? e.hp : 1;
            e.hp = hp0 - 1;
            const basePts = rowScore(e.row);
            if (e.hp <= 0) {
              e.alive = false;
              endEnemyDive(e);
              const mult = e.elite ? 1.35 : 1;
              state.score += Math.floor(basePts * mult);
              playTone(440, 50, 0.04);
            } else {
              state.score += Math.max(2, Math.floor(basePts * 0.14));
              playTone(370, 32, 0.032);
            }
            syncHud();
          }
          playerDamage(DAMAGE_CONTACT);
          return;
        }
      }
    }
  }

  function updateFlankers(dt) {
    if (!state || state.phase !== "playing") return;
    const lv = state.level | 0;
    if (lv < 2) {
      state.flankers.length = 0;
      return;
    }

    flankSpawnTimer -= dt;
    if (flankSpawnTimer <= 0) {
      const fromLeft = Math.random() > 0.32;
      const count = Math.min(2 + Math.floor(lv / 3), 8);
      const spd = 54 + lv * 17;
      for (let i = 0; i < count; i++) {
        state.flankers.push({
          x: fromLeft ? -30 - i * 18 : W + 30 + i * 18,
          y: 58 + ((i * 67 + lv * 23) % 268),
          vx: fromLeft ? spd : -spd,
          vy: 0,
          w: 22,
          h: 17,
          alive: true,
        });
      }
      flankSpawnTimer = rngRange(6.2, 9.8) / (1 + lv * 0.085);
    }

    for (const f of state.flankers) {
      if (!f.alive) continue;
      f.x += f.vx * dt;
      if (f.x < -48 || f.x > W + 48) f.alive = false;
    }
    state.flankers = state.flankers.filter((ff) => ff.alive);
  }

  function updatePowerups(dt) {
    if (!state || state.phase !== "playing") return;

    powerupSpawnTimer -= dt;
    if (powerupSpawnTimer <= 0) {
      state.powerups.push({
        x: rngRange(22, W - 54),
        y: -34,
        vy: 72 + rngRange(0, 52),
        w: 30,
        h: 30,
        kind: rollPowerupKind(),
        alive: true,
      });
      powerupSpawnTimer = rngRange(11, 18);
    }

    const t = renderTimeSec;
    for (const pu of state.powerups) {
      if (!pu.alive) continue;
      pu.y += pu.vy * dt;
      pu.x += Math.sin(t * 3.8 + pu.y * 0.024) * 32 * dt;
      if (pu.x < EN.margin) pu.x = EN.margin;
      if (pu.x + pu.w > W - EN.margin) pu.x = W - EN.margin - pu.w;
    }
    state.powerups = state.powerups.filter(
      (pu) => pu.alive && pu.y < H + 36
    );
  }

  function collectPowerups() {
    if (!state || state.phase !== "playing") return;
    const pr = {
      x: state.player.x,
      y: state.player.y,
      w: state.player.w,
      h: state.player.h,
    };
    for (const pu of state.powerups) {
      if (!pu.alive) continue;
      if (
        E.rectIntersect(pr, {
          x: pu.x,
          y: pu.y,
          w: pu.w,
          h: pu.h,
        })
      ) {
        pu.alive = false;
        const k = pu.kind;
        if (k === "gem") {
          const bonus = 460 + ((Math.random() * 440) | 0);
          state.score += bonus;
          playTone(920, 40, 0.042);
          playTone(620, 35, 0.036);
        } else if (k === "heart") {
          const mx = PL.maxHp != null ? PL.maxHp : 100;
          const curHp = state.player.hp != null ? state.player.hp : mx;
          if (state.lives < MAX_LIVES) {
            state.lives += 1;
            state.player.hp = mx;
            playTone(660, 55, 0.048);
            playTone(880, 45, 0.038);
          } else {
            state.score += 820;
            state.player.hp = Math.min(mx, curHp + Math.floor(mx * 0.42));
            playTone(780, 38, 0.036);
          }
          syncHud();
        } else if (k === "healPill" || k === "healHeart") {
          const mx = PL.maxHp != null ? PL.maxHp : 100;
          const curHp = state.player.hp != null ? state.player.hp : mx;
          const add = Math.max(24, Math.floor(mx * 0.38));
          state.player.hp = Math.min(mx, curHp + add);
          playTone(620, 48, 0.038);
          playTone(880, 42, 0.032);
          playTone(740, 55, 0.028);
        } else if (k === "shield") {
          const sh = state.player.shieldHits || 0;
          state.player.shieldHits = Math.min(2, sh + 1);
          playTone(540, 45, 0.04);
          playTone(780, 35, 0.032);
        } else {
          state.weapon = k;
          playTone(840, 55, 0.048);
          playTone(520, 45, 0.036);
        }
        syncHud();
      }
    }
  }

  /** 피해를 입힙니다. 체력이 0이 되면 목숨 1을 잃고 리스폰합니다. */
  function playerDamage(amount) {
    const p = state.player;
    const maxHp = PL.maxHp != null ? PL.maxHp : 100;
    if ((p.shieldHits || 0) > 0) {
      p.shieldHits--;
      playTone(380, 70, 0.042);
      p.invuln = Math.max(p.invuln, 0.4);
      syncHud();
      return;
    }
    const prevHp = p.hp != null ? p.hp : maxHp;
    p.hp = Math.max(0, prevHp - amount);
    if (p.hp > 0) {
      playTone(160, 100, 0.055);
      p.invuln = Math.max(p.invuln, 1.05);
      syncHud();
      return;
    }

    p.shieldHits = 0;
    p.hp = 0;
    state.lives -= 1;
    playTone(120, 220, 0.05);
    syncHud();
    if (state.lives <= 0) {
      state.phase = "gameover";
      showOverlay("게임 오버", "다시 하기 버튼 또는 스페이스");
      return;
    }
    p.hp = maxHp;
    p.x = W / 2 - PL.w / 2;
    p.y = PL.y;
    p.invuln = PL.invulnAfterHit;
    state.bullets.length = 0;
    state.weapon = "standard";
    syncHud();
  }

  function advanceWave() {
    state.level += 1;
    if (state.lives < MAX_LIVES) state.lives += 1;

    const wave = createEnemies(state.level);
    state.enemies = wave.enemies;
    state.formation.anchorX = 28;
    state.formation.spacingX = wave.spacingX;
    state.formation.spacingY = wave.spacingY;
    state.waveRows = wave.rows;
    state.formation.anchorY = Math.min(
      48 + state.level * 2.8,
      94,
      maxFormationAnchorY()
    );
    state.formation.vx = formationSpeedForLevel(state.level);

    state.bullets.length = 0;
    state.enemyBullets.length = 0;
    state.flankers.length = 0;
    state.powerups.length = 0;
    flankSpawnTimer = rngRange(3.5, 5.5);
    powerupSpawnTimer = rngRange(5, 8);

    const iv = diveIntervalRange();
    diveTimer = rngRange(iv[0], iv[1]);
    const ft = enemyFireTimerRange();
    const pace = 1 / (1 + Math.min(state.level - 1, 18) * 0.045);
    enemyShootTimer = rngRange(ft.min * pace, ft.max * pace);
    syncHud();
    playTone(520 + state.level * 22, 90, 0.045);
    playTone(780 + state.level * 18, 70, 0.038);
  }

  function checkWinLose() {
    if (state.phase !== "playing") return;

    if (aliveEnemyCount() === 0) {
      advanceWave();
      return;
    }
  }

  function render() {
    if (state.phase === "title") {
      E.drawSpaceBackground(ctx, renderTimeSec);
      ctx.fillStyle = "rgba(4, 8, 22, 0.38)";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    E.drawSpaceBackground(ctx, renderTimeSec);

    for (const e of state.enemies) {
      E.drawEnemy(ctx, e, state.formation);
    }
    const flankList = state.flankers || [];
    for (let fi = 0; fi < flankList.length; fi++) {
      E.drawFlanker(ctx, flankList[fi]);
    }

    const pup = state.powerups || [];
    for (let pi = 0; pi < pup.length; pi++) {
      const pu = pup[pi];
      if (pu.alive) E.drawPowerup(ctx, pu, renderTimeSec);
    }

    E.drawPlayer(ctx, state.player, renderTimeSec);

    for (const b of state.bullets) {
      E.drawBullet(ctx, b, {
        timeSec: renderTimeSec,
        player: true,
      });
    }
    for (const b of state.enemyBullets) {
      E.drawBullet(ctx, b, {
        color: "#ff7a8c",
        timeSec: renderTimeSec,
        glow: true,
      });
    }

    if (state.phase !== "playing") {
      ctx.fillStyle = "rgba(4, 8, 22, 0.42)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function update(dt) {
    const spaceDown = global.Input.isDown("Space");
    if (spaceDown && !spacePrev && state.phase === "title") {
      spacePrev = spaceDown;
      beginGame();
      return;
    }
    if (spaceDown && !spacePrev && state.phase === "gameover") {
      spacePrev = spaceDown;
      resetRun();
      ensureAudio();
      return;
    }
    spacePrev = spaceDown;

    if (state.phase !== "playing") return;

    updatePlayer(dt);
    resolveFormationWall(dt);
    startDiveIfNeeded(dt);
    updateDivingEnemies(dt);
    updateFlankers(dt);
    updatePowerups(dt);
    collectPowerups();
    tryEnemyShoot(dt);
    updateBullets(dt);
    handleCollisions();
    checkWinLose();
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;

    renderTimeSec = ts / 1000;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  global.Game = {
    init(c) {
      canvas = c;
      ctx = canvas.getContext("2d");

      state = { phase: "title" };
      const hud = document.getElementById("hud");
      if (hud) hud.classList.add("hud-idle");

      const btnStart = document.getElementById("btn-start");
      if (btnStart) {
        btnStart.addEventListener("click", beginGame);
        requestAnimationFrame(() =>
          btnStart.focus({ preventScroll: true })
        );
      }

      const btnRestart = document.getElementById("btn-restart");
      if (btnRestart) {
        btnRestart.addEventListener("click", () => {
          ensureAudio();
          resetRun();
        });
      }

      requestAnimationFrame(loop);
    },
    restart() {
      hideStartOverlay();
      const hud = document.getElementById("hud");
      if (hud) hud.classList.remove("hud-idle");
      resetRun();
    },
  };
})(typeof window !== "undefined" ? window : this);
