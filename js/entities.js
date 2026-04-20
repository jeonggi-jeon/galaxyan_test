(function (global) {
  const W = 480;
  const H = 640;
  const BG_SEED = 42;

  const PLAYER = {
    w: 36,
    h: 22,
    y: H - 52,
    speed: 240,
    fireCooldown: 0.25,
    invulnAfterHit: 2.2,
    maxHp: 100,
  };

  const ENEMY = {
    w: 28,
    h: 20,
    spacingX: 36,
    spacingY: 26,
    rows: 5,
    cols: 11,
    scoreByRow: [50, 40, 30, 20, 10],
    formationSpeed: 36,
    descend: 14,
    margin: 14,
    diveInterval: [2.5, 4.0],
    diveSpeed: 102,
    shootMin: 0.8,
    shootMax: 2.0,
  };

  const BULLET = {
    playerW: 4,
    playerH: 10,
    playerVy: -420,
    enemyW: 4,
    enemyH: 10,
    enemyVy: 168,
  };

  const LEVEL = {
    bulletSpeedPerLevel: -36,
    maxVolley: 9,
    spreadDegBase: 7,
    spreadDegPerLevel: 2.4,
    maxSpreadDeg: 28,
    maxDistinctLanes: 7,
    cooldownPenaltyPerExtra: 0.042,
    maxCooldownMul: 2.15,
  };

  const WEAPON = {
    standard: { bw: 5, bh: 12, style: "bar", cdMul: 1 },
    plasma: { bw: 15, bh: 20, style: "plasma", cdMul: 1.07 },
    shard: { bw: 11, bh: 18, style: "shard", cdMul: 1.03 },
    bolt: { bw: 5, bh: 30, style: "bolt", cdMul: 0.9 },
    rail: {
      bw: 28,
      bh: 5,
      style: "rail",
      cdMul: 1.05,
      vyMul: 1.12,
      pierce: 1,
    },
    ember: { bw: 7, bh: 16, style: "ember", cdMul: 1.02, vyMul: 1.06 },
    nova: { bw: 18, bh: 18, style: "nova", cdMul: 1.18, vyMul: 0.9 },
    burst: { bw: 4, bh: 11, style: "burst", cdMul: 0.84, vyMul: 1.08 },
    arc: { bw: 10, bh: 18, style: "arc", cdMul: 1.08, vyMul: 1.02 },
    comet: { bw: 7, bh: 24, style: "comet", cdMul: 0.96, vyMul: 1.05 },
    prism: { bw: 13, bh: 16, style: "prism", cdMul: 1.04 },
    ion: {
      bw: 4,
      bh: 15,
      style: "ion",
      cdMul: 0.93,
      vyMul: 1.12,
      pierce: 1,
    },
    specter: { bw: 17, bh: 22, style: "specter", cdMul: 1.2, vyMul: 0.88 },
    ripple: {
      bw: 9,
      bh: 15,
      style: "ripple",
      cdMul: 1.05,
      waveAmp: 88,
      waveFreq: 13,
    },
  };

  function getShotPattern(level) {
    const lv = Math.max(1, level | 0);
    const bulletVY =
      BULLET.playerVy + (lv - 1) * LEVEL.bulletSpeedPerLevel;
    const count = Math.min(1 + 2 * (lv - 1), LEVEL.maxVolley);
    const spreadDeg = Math.min(
      LEVEL.spreadDegBase + (lv - 1) * LEVEL.spreadDegPerLevel,
      LEVEL.maxSpreadDeg
    );
    let fireCooldownMul =
      1 +
      LEVEL.cooldownPenaltyPerExtra * Math.max(0, count - 1);
    if (fireCooldownMul > LEVEL.maxCooldownMul) {
      fireCooldownMul = LEVEL.maxCooldownMul;
    }
    return { bulletVY, count, spreadDeg, fireCooldownMul };
  }

  function spawnPlayerBullets(cx, topY, level, into, weaponKey) {
    const wp = WEAPON[weaponKey] || WEAPON.standard;
    const pat = getShotPattern(level);
    const mag = Math.abs(pat.bulletVY);
    const n = pat.count;
    const half = pat.spreadDeg / 2;
    const laneCount = Math.min(n, LEVEL.maxDistinctLanes);
    const step = laneCount > 1 ? pat.spreadDeg / (laneCount - 1) : 0;
    const bw = wp.bw;
    const bh = wp.bh;

    const vyM = wp.vyMul != null ? wp.vyMul : 1;
    const stackTight =
      wp.style === "bolt" || wp.style === "burst" ? 1.8 : 2.8;
    const hitsLeft = wp.pierce != null ? wp.pierce + 1 : 1;
    const waveAmp = wp.waveAmp != null ? wp.waveAmp : 0;
    const waveFreq = wp.waveFreq != null ? wp.waveFreq : 12;

    for (let i = 0; i < n; i++) {
      const lane = laneCount === 1 ? 0 : i % laneCount;
      const stack = laneCount <= 1 ? 0 : Math.floor(i / laneCount);
      const deg =
        laneCount === 1 ? 0 : -half + step * lane;
      const rad = (deg * Math.PI) / 180;
      let vx = Math.sin(rad) * mag * vyM;
      let vy = -Math.cos(rad) * mag * vyM;
      const stackShiftX = stack * stackTight;
      const bullet = {
        x: cx - bw / 2 + stackShiftX,
        y: topY,
        w: bw,
        h: bh,
        vx,
        vy,
        style: wp.style,
        hitsLeft,
      };
      if (waveAmp) {
        bullet.waveAmp = waveAmp;
        bullet.waveFreq = waveFreq;
        bullet.wavePhase = i * 1.05 + lane * 0.4;
      }
      into.push(bullet);
    }
    return pat.fireCooldownMul * wp.cdMul;
  }

  function rectIntersect(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function enemyWorldPos(e, formation) {
    if (e.diving) return { x: e.x, y: e.y };
    if (e.kind === "flank") return { x: e.x, y: e.y };
    const sx =
      formation && formation.spacingX != null
        ? formation.spacingX
        : ENEMY.spacingX;
    const sy =
      formation && formation.spacingY != null
        ? formation.spacingY
        : ENEMY.spacingY;
    return {
      x: formation.anchorX + e.col * sx,
      y: formation.anchorY + e.row * sy,
    };
  }

  function drawFlanker(ctx, f) {
    if (!f.alive) return;
    ctx.save();
    ctx.shadowColor = "#ff88aa";
    ctx.shadowBlur = 10;
    const g = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
    g.addColorStop(0, "#ffa8c8");
    g.addColorStop(1, "#c04070");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(f.x + f.w / 2, f.y);
    ctx.lineTo(f.x + f.w, f.y + f.h / 2);
    ctx.lineTo(f.x + f.w / 2, f.y + f.h);
    ctx.lineTo(f.x, f.y + f.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawStars(ctx, seed, timeSec) {
    ctx.save();
    const rnd = mulberry32(seed);
    const t = timeSec || 0;
    for (let i = 0; i < 120; i++) {
      const sx = (rnd() * W) | 0;
      const sy = (rnd() * H) | 0;
      const baseR = rnd() * 1.4 + 0.25;
      const tw =
        0.55 +
        0.45 *
          Math.sin(t * (1.2 + rnd() * 2) + i * 0.37 + rnd() * 6);
      ctx.globalAlpha = (0.2 + rnd() * 0.45) * tw;
      ctx.fillStyle = rnd() > 0.65 ? "#ffffff" : "#a8c4f0";
      ctx.beginPath();
      ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
      ctx.fill();
      if (rnd() > 0.92) {
        ctx.globalAlpha *= 0.6;
        ctx.strokeStyle = "#e8f4ff";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy);
        ctx.lineTo(sx + 4, sy);
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx, sy + 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawNebula(ctx, timeSec) {
    const t = timeSec || 0;
    ctx.save();
    const ox = Math.sin(t * 0.15) * 24;
    const oy = Math.cos(t * 0.11) * 18;

    const g1 = ctx.createRadialGradient(
      W * 0.25 + ox,
      H * 0.2 + oy,
      0,
      W * 0.35,
      H * 0.35,
      H * 0.55
    );
    g1.addColorStop(0, "rgba(120, 60, 200, 0.22)");
    g1.addColorStop(0.5, "rgba(40, 80, 180, 0.08)");
    g1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(
      W * 0.85 - ox * 0.5,
      H * 0.45,
      0,
      W * 0.75,
      H * 0.5,
      H * 0.45
    );
    g2.addColorStop(0, "rgba(40, 180, 220, 0.14)");
    g2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    const g3 = ctx.createRadialGradient(
      W * 0.5,
      H * 1.05,
      0,
      W * 0.5,
      H * 0.85,
      H * 0.55
    );
    g3.addColorStop(0, "rgba(255, 80, 120, 0.06)");
    g3.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawSpaceBackground(ctx, timeSec) {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#070d22");
    grd.addColorStop(0.45, "#0c1638");
    grd.addColorStop(1, "#050810");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    drawNebula(ctx, timeSec);

    ctx.save();
    ctx.globalAlpha = 0.45;
    drawStars(ctx, BG_SEED + 7, timeSec * 0.85);
    ctx.restore();

    drawStars(ctx, BG_SEED, timeSec);

    ctx.save();
    ctx.strokeStyle = "rgba(80, 140, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 48) {
      const wave = Math.sin(timeSec * 0.4 + y * 0.02) * 6;
      ctx.beginPath();
      ctx.moveTo(0, y + wave);
      ctx.lineTo(W, y + wave * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function colorForRow(row) {
    const palette = ["#ff6b8a", "#ffb84d", "#fff06a", "#5dffa8", "#6ecbff"];
    return palette[row % palette.length];
  }

  function drawPlayer(ctx, p, timeSec) {
    const t = timeSec || 0;
    const flash =
      p.invuln > 0 && Math.floor(p.invuln * 8) % 2 === 0 ? 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = flash;

    const cx = p.x + p.w / 2;
    const flicker = 0.85 + 0.15 * Math.sin(t * 28);

    ctx.shadowColor = "#60c8ff";
    ctx.shadowBlur = 14;
    const bodyGrad = ctx.createLinearGradient(
      p.x,
      p.y,
      p.x + p.w,
      p.y + p.h
    );
    bodyGrad.addColorStop(0, "#b8e8ff");
    bodyGrad.addColorStop(0.5, "#5cb0ff");
    bodyGrad.addColorStop(1, "#2868c8");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(cx, p.y);
    ctx.lineTo(p.x + p.w, p.y + p.h);
    ctx.lineTo(p.x, p.y + p.h);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#1e5088";
    ctx.fillRect(cx - 7, p.y + p.h - 7, 14, 7);

    const flameH = 10 + flicker * 6;
    const fGrad = ctx.createLinearGradient(
      cx,
      p.y + p.h,
      cx,
      p.y + p.h + flameH
    );
    fGrad.addColorStop(0, "rgba(255,200,80,0.95)");
    fGrad.addColorStop(0.45, "rgba(255,120,60,0.65)");
    fGrad.addColorStop(1, "rgba(255,80,40,0)");
    ctx.globalAlpha = flash * 0.92;
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 5, p.y + p.h);
    ctx.lineTo(cx + 5, p.y + p.h);
    ctx.lineTo(cx, p.y + p.h + flameH);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(ctx, e, formation) {
    if (!e.alive || e.kind === "flank") return;
    const pos = enemyWorldPos(e, formation);
    const fill = colorForRow(e.row);
    ctx.save();
    ctx.translate(pos.x + ENEMY.w / 2, pos.y + ENEMY.h / 2);
    if (e.diving) ctx.rotate(Math.sin(e.divePhase || 0) * 0.35);

    ctx.shadowColor = fill;
    ctx.shadowBlur = 10;

    const g = ctx.createLinearGradient(
      -ENEMY.w / 2,
      -ENEMY.h / 2,
      ENEMY.w / 2,
      ENEMY.h / 2
    );
    g.addColorStop(0, fill);
    g.addColorStop(1, "rgba(20,15,40,0.95)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -ENEMY.h / 2);
    ctx.lineTo(ENEMY.w / 2, ENEMY.h / 2);
    ctx.lineTo(-ENEMY.w / 2, ENEMY.h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = e.elite
      ? "rgba(255, 220, 120, 0.95)"
      : "rgba(255,255,255,0.55)";
    ctx.lineWidth = e.elite ? 2.4 : 1.25;
    ctx.stroke();

    if (e.elite && e.hp != null && e.hp > 1) {
      ctx.fillStyle = "rgba(255,210,90,0.9)";
      ctx.font = "bold 9px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(e.hp), 0, -ENEMY.h * 0.42);
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(-ENEMY.w * 0.15, -ENEMY.h * 0.15, 2.2, 0, Math.PI * 2);
    ctx.arc(ENEMY.w * 0.12, -ENEMY.h * 0.12, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    if (e.diving) e.divePhase = (e.divePhase || 0) + 0.18;
  }

  function drawBullet(ctx, b, opts) {
    const opt =
      typeof opts === "string" ? { color: opts } : opts || {};
    const style = b.style || "bar";
    const timeSec = opt.timeSec || 0;
    const phase = timeSec * 14 + b.x * 0.08 + b.y * 0.06;
    const styleColor = {
      plasma: "#8ffff4",
      shard: "#f0c8ff",
      bolt: "#d0f0ff",
      rail: "#a8f0ff",
      ember: "#ff9040",
      nova: "#ff88c8",
      burst: "#fff090",
      arc: "#c0a8ff",
      comet: "#ffc890",
      prism: "#90ffc8",
      ion: "#68ff88",
      specter: "#a8d8ff",
      ripple: "#88ffd0",
      needle: "#ffb0c8",
      pod: "#ff9ec8",
      bar: "#9cf0ff",
    };
    let color =
      opt.color ||
      styleColor[style] ||
      styleColor.bar;
    const glow = opt.glow !== false;
    const isPlayer = opt.player === true;
    ctx.save();

    if (style === "shard") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (isPlayer && glow) {
        ctx.shadowColor = "#ff88ff";
        ctx.shadowBlur = 22 + Math.sin(phase * 0.5) * 6;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgba(200,100,255,0.35)";
        ctx.beginPath();
        ctx.moveTo(cx, b.y - 3);
        ctx.lineTo(b.x + b.w + 4, cy);
        ctx.lineTo(cx, b.y + b.h + 3);
        ctx.lineTo(b.x - 4, cy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      const g = ctx.createRadialGradient(cx, cy * 0.92, 0, cx, cy, b.w * 1.1);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, color);
      g.addColorStop(0.75, "#c060e8");
      g.addColorStop(1, "rgba(60,10,90,0.95)");
      ctx.shadowBlur = isPlayer ? 16 : 8;
      ctx.shadowColor = "#ffa8ff";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, b.y);
      ctx.lineTo(b.x + b.w, cy);
      ctx.lineTo(cx, b.y + b.h);
      ctx.lineTo(b.x, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = isPlayer ? 1.8 : 1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,200,255,0.5)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, b.y + 2);
      ctx.lineTo(b.x + b.w - 2, cy);
      ctx.lineTo(cx, b.y + b.h - 2);
      ctx.lineTo(b.x + 2, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (style === "plasma") {
      const r = Math.min(b.w, b.h) * 0.42;
      const hx = b.x + b.w / 2;
      const hy = b.y + b.h / 2;
      if (isPlayer) {
        const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, b.w * 0.85);
        halo.addColorStop(0, "rgba(120,255,250,0.5)");
        halo.addColorStop(0.45, "rgba(40,200,255,0.15)");
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(hx, hy, b.w * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(180,255,255,0.35)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(
          hx,
          hy,
          b.w * 0.55 + Math.sin(phase * 0.4) * 3,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.shadowColor = "#40fff0";
      ctx.shadowBlur = isPlayer ? 20 : 14;
      const g = ctx.createLinearGradient(b.x, b.y + b.h, b.x, b.y);
      g.addColorStop(0, "#00c8e8");
      g.addColorStop(0.35, "rgba(255,255,255,0.98)");
      g.addColorStop(0.65, color);
      g.addColorStop(1, "#20ffd0");
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, r);
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(
          b.x + b.w * 0.15,
          b.y + b.h * 0.12,
          b.w * 0.35,
          b.h * 0.35,
          4
        );
      }
      ctx.fill();
      ctx.restore();
      return;
    }

    if (style === "bolt") {
      const hx = b.x + b.w / 2;
      if (isPlayer) {
        for (let k = 0; k < 3; k++) {
          const off = k * 2.5;
          ctx.globalAlpha = 0.25 - k * 0.06;
          ctx.fillStyle = "#80f0ff";
          ctx.shadowColor = "#00ffff";
          ctx.shadowBlur = 18;
          ctx.fillRect(b.x - off, b.y - k, b.w + off * 2, b.h + k * 2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.shadowColor = "#a0ffff";
      ctx.shadowBlur = isPlayer ? 18 : 10;
      const g = ctx.createLinearGradient(hx, b.y + b.h, hx, b.y);
      g.addColorStop(0, "#0060a8");
      g.addColorStop(0.4, color);
      g.addColorStop(0.55, "#ffffff");
      g.addColorStop(0.7, color);
      g.addColorStop(1, "#40c8ff");
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(hx, b.y);
      ctx.lineTo(hx, b.y + b.h);
      ctx.stroke();
      if (isPlayer) {
        const flick = Math.sin(phase * 0.8);
        ctx.strokeStyle = `rgba(200,255,255,${0.4 + flick * 0.25})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x - 1, b.y + b.h * 0.35);
        ctx.lineTo(b.x + b.w + 1, b.y + b.h * 0.42);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (style === "rail") {
      const hx = b.x + b.w / 2;
      const hy = b.y + b.h / 2;
      if (isPlayer) {
        ctx.shadowColor = "#80e8ff";
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "rgba(120,220,255,0.45)";
        ctx.fillRect(b.x - 4, b.y - 3, b.w + 8, b.h + 6);
        ctx.globalAlpha = 1;
      }
      const g = ctx.createLinearGradient(b.x, hy, b.x + b.w, hy);
      g.addColorStop(0, "rgba(0,80,140,0.95)");
      g.addColorStop(0.35, color);
      g.addColorStop(0.5, "#ffffff");
      g.addColorStop(0.65, color);
      g.addColorStop(1, "rgba(40,180,255,0.9)");
      ctx.shadowBlur = isPlayer ? 16 : 10;
      ctx.shadowColor = color;
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      ctx.restore();
      return;
    }

    if (style === "ember") {
      const hx = b.x + b.w / 2;
      const hy = b.y + b.h / 2;
      if (isPlayer) {
        ctx.shadowColor = "#ff8040";
        ctx.shadowBlur = 18 + Math.sin(phase * 0.6) * 4;
      }
      const g = ctx.createLinearGradient(hx, b.y + b.h, hx, b.y);
      g.addColorStop(0, "#601000");
      g.addColorStop(0.35, "#ff6010");
      g.addColorStop(0.55, "#fff0a0");
      g.addColorStop(0.72, color);
      g.addColorStop(1, "#ffa020");
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(255,220,120,0.5)";
      ctx.fillRect(hx - 1.2, b.y + b.h * 0.15, 2.4, b.h * 0.55);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    if (style === "nova") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const r = Math.min(b.w, b.h) * 0.48;
      if (isPlayer) {
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
        halo.addColorStop(0, "rgba(255,160,220,0.55)");
        halo.addColorStop(0.45, "rgba(255,100,180,0.12)");
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowColor = "#ff88cc";
      ctx.shadowBlur = isPlayer ? 22 : 14;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.15);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, color);
      g.addColorStop(0.85, "#c04090");
      g.addColorStop(1, "rgba(60,10,60,0.95)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (style === "burst") {
      const hx = b.x + b.w / 2;
      if (isPlayer) {
        ctx.shadowColor = "#fff8a0";
        ctx.shadowBlur = 14;
      }
      const g = ctx.createLinearGradient(hx, b.y + b.h, hx, b.y);
      g.addColorStop(0, "#c89820");
      g.addColorStop(0.45, "#fffce8");
      g.addColorStop(0.62, color);
      g.addColorStop(1, "#ffd040");
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, 2);
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    if (style === "arc") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.shadowColor = "#c8a8ff";
      ctx.shadowBlur = isPlayer ? 18 : 11;
      ctx.strokeStyle = color;
      ctx.lineWidth = isPlayer ? 2.4 : 1.8;
      ctx.lineJoin = "round";
      ctx.beginPath();
      const seg = 5;
      for (let s = 0; s <= seg; s++) {
        const ty = b.y + (b.h * s) / seg;
        const jag = Math.sin(phase * 1.2 + s * 1.7) * (b.w * 0.35);
        const tx = cx + jag;
        if (s === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = 0; s <= seg; s++) {
        const ty = b.y + (b.h * s) / seg;
        const jag = Math.sin(phase * 1.2 + s * 1.7 + 0.5) * (b.w * 0.28);
        const tx = cx + jag;
        if (s === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    if (style === "comet") {
      const cx = b.x + b.w / 2;
      if (isPlayer) {
        ctx.shadowColor = "#ffb060";
        ctx.shadowBlur = 16;
      }
      for (let k = 3; k >= 1; k--) {
        ctx.globalAlpha = 0.18 + k * 0.08;
        ctx.fillStyle = `rgba(255,160,80,${0.15 + k * 0.08})`;
        ctx.fillRect(
          b.x - k * 1.2,
          b.y + b.h + k * 3,
          b.w + k * 2.4,
          k * 4
        );
      }
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(cx, b.y + b.h, cx, b.y);
      g.addColorStop(0, "#603010");
      g.addColorStop(0.35, "#ff9040");
      g.addColorStop(0.62, "#fff8e0");
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, 4);
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    if (style === "prism") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (isPlayer) {
        ctx.shadowColor = "#80ffc0";
        ctx.shadowBlur = 18;
      }
      const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      g.addColorStop(0, "#fff06a");
      g.addColorStop(0.35, color);
      g.addColorStop(0.65, "#60ffa8");
      g.addColorStop(1, "#2060c8");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, b.y);
      ctx.lineTo(b.x + b.w, cy);
      ctx.lineTo(cx, b.y + b.h);
      ctx.lineTo(b.x, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    if (style === "ion") {
      const hx = b.x + b.w / 2;
      if (isPlayer) {
        ctx.shadowColor = "#40ff80";
        ctx.shadowBlur = 16;
      }
      const g = ctx.createLinearGradient(hx, b.y + b.h, hx, b.y);
      g.addColorStop(0, "#004018");
      g.addColorStop(0.45, color);
      g.addColorStop(0.58, "#e8fff0");
      g.addColorStop(1, "#60ffb0");
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(hx - 0.9, b.y + b.h * 0.2, 1.8, b.h * 0.45);
      ctx.restore();
      return;
    }

    if (style === "specter") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.globalAlpha = isPlayer ? 0.42 : 0.65;
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = "rgba(140,200,255,0.55)";
      ctx.fillRect(b.x + 5, b.y + 3, b.w - 10, b.h - 6);
      ctx.globalAlpha = isPlayer ? 0.55 : 0.72;
      ctx.fillStyle = "rgba(180,220,255,0.4)";
      ctx.fillRect(b.x - 3, b.y - 2, b.w + 6, b.h + 4);
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.w * 0.65);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.45, color);
      g.addColorStop(1, "rgba(40,60,120,0.85)");
      ctx.shadowBlur = isPlayer ? 14 : 10;
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, 6);
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (style === "ripple") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (isPlayer) {
        const ring = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.w);
        ring.addColorStop(0, "rgba(120,255,200,0.35)");
        ring.addColorStop(0.55, "rgba(40,200,180,0.12)");
        ring.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(cx, cy, b.w * 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowColor = "#60ffc8";
      ctx.shadowBlur = isPlayer ? 15 : 10;
      const g = ctx.createLinearGradient(cx, b.y + b.h, cx, b.y);
      g.addColorStop(0, "#008868");
      g.addColorStop(0.5, color);
      g.addColorStop(1, "#c8fff0");
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, 5);
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(phase * 0.25) * 0.25})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.restore();
      return;
    }

    if (style === "needle") {
      const hx = b.x + b.w / 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = isPlayer ? 10 : 7;
      const g = ctx.createLinearGradient(hx, b.y + b.h, hx, b.y);
      g.addColorStop(0, "rgba(120,20,40,0.95)");
      g.addColorStop(0.5, color);
      g.addColorStop(1, "#ffffff");
      ctx.fillStyle = g;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(2, b.w * 0.5));
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    if (style === "pod") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const rx = b.w * 0.48;
      const ry = b.h * 0.48;
      ctx.shadowColor = color;
      ctx.shadowBlur = isPlayer ? 12 : 9;
      const g = ctx.createRadialGradient(cx, cy * 0.92, 0, cx, cy, Math.max(rx, ry) * 1.2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.45, color);
      g.addColorStop(1, "rgba(120,30,60,0.92)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = isPlayer ? 12 : 8;
    }
    const g = ctx.createLinearGradient(b.x, b.y + b.h, b.x, b.y);
    g.addColorStop(0, color);
    g.addColorStop(0.55, "rgba(255,255,255,0.95)");
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
    } else {
      ctx.rect(b.x, b.y, b.w, b.h);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawHealPillPowerup(ctx, p, timeSec) {
    const t = timeSec || 0;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const pulse = 0.88 + 0.12 * Math.sin(t * 7 + p.y * 0.045);
    const sway = Math.sin(t * 2.4 + p.x * 0.04) * 0.09;
    const rw = p.w * 0.76;
    const rh = p.h * 0.42;
    const rr = rh * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sway);
    ctx.scale(pulse, pulse);

    for (let ring = 0; ring < 4; ring++) {
      ctx.globalAlpha = 0.22 - ring * 0.045;
      ctx.strokeStyle =
        ring % 2 === 0 ? "rgba(80,255,200,0.9)" : "rgba(255,140,220,0.85)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -t * 18 - ring * 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, rw * 0.55 + ring * 5, rh * 0.65 + ring * 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, rw * 1.15);
    halo.addColorStop(0, "rgba(140,255,230,0.55)");
    halo.addColorStop(0.45, "rgba(255,120,200,0.22)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 0, rw * 1.05, rh * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "#50ffd8";
    ctx.shadowBlur = 22;
    const cap = ctx.createLinearGradient(-rw / 2, -rh / 2, rw / 2, rh / 2);
    cap.addColorStop(0, "#109078");
    cap.addColorStop(0.22, "#6effd8");
    cap.addColorStop(0.5, "#ffffff");
    cap.addColorStop(0.78, "#ffa0e8");
    cap.addColorStop(1, "#9040c0");
    ctx.fillStyle = cap;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-rw / 2, -rh / 2, rw, rh, rr);
    } else {
      ctx.rect(-rw / 2, -rh / 2, rw, rh);
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.ellipse(-rw * 0.06, -rh * 0.22, rw * 0.38, rh * 0.28, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-rw / 2, -rh / 2, rw, rh, rr);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i < 8; i++) {
      const a = t * 3.5 + i * (Math.PI / 4);
      const rad = rw * 0.68 + Math.sin(t * 5.5 + i * 1.3) * 4;
      const sx = Math.cos(a) * rad;
      const sy = Math.sin(a) * rad * 0.75;
      ctx.globalAlpha = 0.35 + Math.sin(t * 8 + i) * 0.28;
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#80ffe0" : "#ffa0f0";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6 + (i % 3) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(0,40,35,0.65)";
    ctx.font = "bold 8px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+HP", 0, 1);

    ctx.restore();
  }

  function drawHealHeartPowerup(ctx, p, timeSec) {
    const t = timeSec || 0;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const pulse = 0.9 + 0.1 * Math.sin(t * 8 + p.y * 0.05);
    const beat = 1 + Math.sin(t * 10) * 0.04;
    const sc = (p.w * 0.42) * pulse * beat;

    ctx.save();
    ctx.translate(cx, cy);

    for (let ring = 0; ring < 5; ring++) {
      ctx.globalAlpha = 0.18 - ring * 0.028;
      ctx.strokeStyle =
        ring % 2 === 0 ? "rgba(255,160,200,0.95)" : "rgba(255,230,140,0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, sc * 1.35 + ring * 6 + Math.sin(t * 4 + ring) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const aur = ctx.createRadialGradient(0, -sc * 0.15, 0, 0, 0, sc * 2);
    aur.addColorStop(0, "rgba(255,220,240,0.65)");
    aur.addColorStop(0.35, "rgba(255,100,160,0.35)");
    aur.addColorStop(0.7, "rgba(255,80,120,0.12)");
    aur.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aur;
    ctx.beginPath();
    ctx.arc(0, 0, sc * 1.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(pulse * beat, pulse * beat);

    ctx.shadowColor = "#ff6090";
    ctx.shadowBlur = 26;
    const g = ctx.createRadialGradient(0, -sc * 0.35, 0, 0, sc * 0.1, sc * 1.5);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, "#ffa8d8");
    g.addColorStop(0.55, "#ff4088");
    g.addColorStop(0.82, "#c01850");
    g.addColorStop(1, "#501028");

    const hs = sc * 0.88;
    ctx.beginPath();
    ctx.moveTo(0, hs * 0.28);
    ctx.bezierCurveTo(0, -hs * 0.12, -hs * 0.58, -hs * 0.42, -hs * 0.58, hs * 0.12);
    ctx.bezierCurveTo(-hs * 0.58, hs * 0.48, 0, hs * 0.72, 0, hs * 1.05);
    ctx.bezierCurveTo(0, hs * 0.72, hs * 0.58, hs * 0.48, hs * 0.58, hs * 0.12);
    ctx.bezierCurveTo(hs * 0.58, -hs * 0.42, 0, -hs * 0.12, 0, hs * 0.28);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55;
    const hl = ctx.createRadialGradient(-sc * 0.32, -sc * 0.5, 0, -sc * 0.32, -sc * 0.5, sc * 0.52);
    hl.addColorStop(0, "rgba(255,255,255,0.95)");
    hl.addColorStop(0.45, "rgba(255,200,240,0.35)");
    hl.addColorStop(1, "rgba(255,80,140,0)");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(-sc * 0.26, -sc * 0.42, sc * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, hs * 0.28);
    ctx.bezierCurveTo(0, -hs * 0.12, -hs * 0.58, -hs * 0.42, -hs * 0.58, hs * 0.12);
    ctx.bezierCurveTo(-hs * 0.58, hs * 0.48, 0, hs * 0.72, 0, hs * 1.05);
    ctx.bezierCurveTo(0, hs * 0.72, hs * 0.58, hs * 0.48, hs * 0.58, hs * 0.12);
    ctx.bezierCurveTo(hs * 0.58, -hs * 0.42, 0, -hs * 0.12, 0, hs * 0.28);
    ctx.stroke();

    const sparkN = 10;
    for (let i = 0; i < sparkN; i++) {
      const ang = t * 4 + (i / sparkN) * Math.PI * 2;
      const rad = sc * (1.15 + Math.sin(t * 6 + i * 1.4) * 0.06);
      const sx = Math.cos(ang) * rad;
      const sy = Math.sin(ang) * rad * 0.92;
      ctx.globalAlpha = 0.4 + Math.sin(t * 9 + i * 1.1) * 0.35;
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#ffc8e8";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4 + (i % 4) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = "bold 8px system-ui,sans-serif";
    ctx.fillStyle = "rgba(40,0,16,0.65)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", 0, sc * 0.38);

    ctx.restore();
  }

  function drawPowerup(ctx, p, timeSec) {
    const t = timeSec || 0;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const pulse = 0.92 + 0.08 * Math.sin(t * 6 + p.y * 0.04);

    if (p.kind === "healPill") {
      drawHealPillPowerup(ctx, p, timeSec);
      return;
    }
    if (p.kind === "healHeart") {
      drawHealHeartPowerup(ctx, p, timeSec);
      return;
    }

    const spin = t * 2.8 + p.x * 0.02;

    let core = "#66ffe8";
    let rim = "#ffffff";
    let halo = "rgba(100,255,240,0.45)";
    let accent = "#00ffd8";
    if (p.kind === "plasma") {
      core = "#48fff8";
      rim = "#e0ffff";
      halo = "rgba(80,240,255,0.55)";
      accent = "#20e8ff";
    } else if (p.kind === "shard") {
      core = "#d898ff";
      rim = "#ffe8ff";
      halo = "rgba(220,140,255,0.5)";
      accent = "#ff60f0";
    } else if (p.kind === "bolt") {
      core = "#88d0ff";
      rim = "#f5fbff";
      halo = "rgba(120,200,255,0.5)";
      accent = "#40a8ff";
    } else if (p.kind === "rail") {
      core = "#78e8ff";
      rim = "#f0ffff";
      halo = "rgba(100,230,255,0.55)";
      accent = "#40d0ff";
    } else if (p.kind === "ember") {
      core = "#ff9040";
      rim = "#fff0c8";
      halo = "rgba(255,140,60,0.55)";
      accent = "#ffb020";
    } else if (p.kind === "nova") {
      core = "#ff70c8";
      rim = "#ffe8ff";
      halo = "rgba(255,120,200,0.5)";
      accent = "#ff50b0";
    } else if (p.kind === "burst") {
      core = "#ffe850";
      rim = "#fffce8";
      halo = "rgba(255,240,80,0.45)";
      accent = "#ffd020";
    } else if (p.kind === "arc") {
      core = "#c0a0ff";
      rim = "#f0e8ff";
      halo = "rgba(180,140,255,0.48)";
      accent = "#a070ff";
    } else if (p.kind === "comet") {
      core = "#ffb060";
      rim = "#fff0d0";
      halo = "rgba(255,180,80,0.5)";
      accent = "#ff8020";
    } else if (p.kind === "prism") {
      core = "#80f0b0";
      rim = "#f0fff8";
      halo = "rgba(100,255,180,0.45)";
      accent = "#40c888";
    } else if (p.kind === "ion") {
      core = "#50f070";
      rim = "#e8ffe8";
      halo = "rgba(80,255,120,0.5)";
      accent = "#20c040";
    } else if (p.kind === "specter") {
      core = "#a0c8f0";
      rim = "#f0f8ff";
      halo = "rgba(160,200,255,0.45)";
      accent = "#6080c0";
    } else if (p.kind === "ripple") {
      core = "#70f0c0";
      rim = "#e0fff5";
      halo = "rgba(100,255,200,0.48)";
      accent = "#30d0a0";
    } else if (p.kind === "gem") {
      core = "#ffd84a";
      rim = "#fff8c8";
      halo = "rgba(255,220,80,0.55)";
      accent = "#e8a010";
    } else if (p.kind === "heart") {
      core = "#ff6088";
      rim = "#ffe0e8";
      halo = "rgba(255,100,140,0.5)";
      accent = "#ff2040";
    } else if (p.kind === "shield") {
      core = "#60b0ff";
      rim = "#e8f4ff";
      halo = "rgba(100,180,255,0.5)";
      accent = "#2080e0";
    }

    ctx.save();
    ctx.translate(cx, cy);

    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, p.w * 1.4);
    bg.addColorStop(0, halo);
    bg.addColorStop(0.55, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = pulse * 0.85;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, p.w * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = pulse;

    ctx.rotate(spin * 0.35);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, p.w * 0.55 + i * 6 + Math.sin(t * 4 + i) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = pulse;

    ctx.rotate(-spin * 0.35 + Math.sin(t * 3 + p.y * 0.02) * 0.12);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    const gem = ctx.createLinearGradient(-p.w / 2, -p.h / 2, p.w / 2, p.h / 2);
    gem.addColorStop(0, rim);
    gem.addColorStop(0.35, core);
    gem.addColorStop(0.65, accent);
    gem.addColorStop(1, "rgba(20,40,80,0.95)");
    ctx.fillStyle = gem;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -p.h / 2);
    ctx.lineTo(p.w / 2, 0);
    ctx.lineTo(0, p.h / 2);
    ctx.lineTo(-p.w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.moveTo(0, -p.h * 0.35);
    ctx.lineTo(p.w * 0.22, 0);
    ctx.lineTo(0, p.h * 0.08);
    ctx.lineTo(-p.w * 0.22, 0);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    for (let i = 0; i < 6; i++) {
      const ang = spin * 1.5 + (i / 6) * Math.PI * 2;
      const rad = p.w * 0.72 + Math.sin(t * 5 + i) * 4;
      const sx = Math.cos(ang) * rad;
      const sy = Math.sin(ang) * rad;
      ctx.globalAlpha = 0.35 + Math.sin(t * 8 + i * 1.2) * 0.25;
      ctx.fillStyle = i % 2 === 0 ? rim : accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = pulse;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "bold 9px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labels = {
      plasma: "P",
      shard: "S",
      bolt: "L",
      rail: "R",
      ember: "E",
      nova: "N",
      burst: "B",
      arc: "A",
      comet: "C",
      prism: "I",
      ion: "O",
      specter: "G",
      ripple: "W",
      gem: "$",
      heart: "+",
      shield: "K",
    };
    const label = labels[p.kind] || "?";
    ctx.fillText(label, 0, 1);

    ctx.restore();
  }

  global.Entities = {
    W,
    H,
    PLAYER,
    ENEMY,
    BULLET,
    LEVEL,
    WEAPON,
    getShotPattern,
    spawnPlayerBullets,
    rectIntersect,
    enemyWorldPos,
    drawStars,
    drawSpaceBackground,
    colorForRow,
    drawPlayer,
    drawEnemy,
    drawFlanker,
    drawBullet,
    drawPowerup,
  };
})(typeof window !== "undefined" ? window : this);
