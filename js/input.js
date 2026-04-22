(function (global) {
  const keys = Object.create(null);

  let canvasEl = null;
  let touching = false;
  /** 플레이어 왼쪽 x · 위쪽 y (게임 좌표). 터치 한 번도 없으면 null */
  let touchPlayerLeftX = null;
  let touchPlayerTopY = null;
  /** 터치/포인터로 누른 #btn-bomb 한 번 — 프레임당 1회 소비 */
  let bombButtonPending = false;

  function gameMetrics() {
    const E = global.Entities;
    const W = E && E.W ? E.W : 480;
    const H = E && E.H ? E.H : 640;
    const pw = E && E.PLAYER && E.PLAYER.w ? E.PLAYER.w : 36;
    const ph = E && E.PLAYER && E.PLAYER.h ? E.PLAYER.h : 22;
    const margin = E && E.ENEMY && E.ENEMY.margin ? E.ENEMY.margin : 14;
    return { W, H, pw, ph, margin };
  }

  function clampPlayerLeft(left) {
    const { W, pw, margin } = gameMetrics();
    const minX = margin;
    const maxX = W - margin - pw;
    if (left < minX) return minX;
    if (left > maxX) return maxX;
    return left;
  }

  function clampPlayerTop(top) {
    const { H, ph, margin } = gameMetrics();
    const minY = margin + 8;
    const maxY = H - margin - ph;
    if (top < minY) return minY;
    if (top > maxY) return maxY;
    return top;
  }

  function updateTouchFromEvent(e) {
    if (!canvasEl || !e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    const rect = canvasEl.getBoundingClientRect();
    const { W, H, pw, ph } = gameMetrics();
    const sx = W / rect.width;
    const sy = H / rect.height;
    const cx = (t.clientX - rect.left) * sx;
    const cy = (t.clientY - rect.top) * sy;
    touchPlayerLeftX = clampPlayerLeft(cx - pw / 2);
    touchPlayerTopY = clampPlayerTop(cy - ph / 2);
  }

  function onTouchStart(e) {
    touching = true;
    updateTouchFromEvent(e);
    if (e.cancelable) e.preventDefault();
  }

  function onTouchMove(e) {
    touching = e.touches.length > 0;
    updateTouchFromEvent(e);
    if (e.cancelable) e.preventDefault();
  }

  function onTouchEnd(e) {
    touching = e.touches.length > 0;
    if (!touching) {
      /* 손가락을 떼도 기체 위치 유지 */
    }
  }

  function onTouchCancel() {
    touching = false;
  }

  const UI_BOMB_REARM_MS = 200;
  let lastBombUiAt = 0;

  function setBombFromUi() {
    const t =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    if (t - lastBombUiAt < UI_BOMB_REARM_MS) return;
    lastBombUiAt = t;
    bombButtonPending = true;
  }

  function bindBombButton(bombEl) {
    if (!bombEl) return;
    const onPtr = (e) => {
      if (e && e.button != null && e.button !== 0) return;
      e.preventDefault();
      setBombFromUi();
    };
    bombEl.addEventListener("pointerdown", onPtr, { passive: false });
    bombEl.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (e.repeat) return;
      setBombFromUi();
    });
  }

  global.Input = {
    init(canvas) {
      canvasEl = canvas;
      if (!canvasEl) return;
      bindBombButton(document.getElementById("btn-bomb"));
      canvasEl.addEventListener("touchstart", onTouchStart, {
        passive: false,
      });
      canvasEl.addEventListener("touchmove", onTouchMove, { passive: false });
      canvasEl.addEventListener("touchend", onTouchEnd, { passive: true });
      canvasEl.addEventListener("touchcancel", onTouchCancel, {
        passive: true,
      });
    },

    isDown(code) {
      return !!keys[code];
    },

    /** 스마트폰·태블릿 등 손가락 조작이 주 입력으로 감지될 때 true */
    prefersCoarsePointer() {
      try {
        const mq = window.matchMedia;
        if (!mq) return false;
        if (mq("(pointer: coarse)").matches) return true;
        if (
          navigator.maxTouchPoints > 0 &&
          mq("(hover: none)").matches
        ) {
          return true;
        }
        if (
          typeof navigator !== "undefined" &&
          navigator.maxTouchPoints > 0 &&
          mq("(max-width: 1024px)").matches
        ) {
          return true;
        }
      } catch (_e) {
        /* ignore */
      }
      return false;
    },

    /** 터치 쪽 폭탄 버튼(HTML)에서 한 프레임만 true */
    consumeBombButton() {
      const t = bombButtonPending;
      bombButtonPending = false;
      return t;
    },

    isTouching() {
      return touching;
    },

    /** 터치로 계산된 플레이어 왼쪽 x (클램프됨). 없으면 null */
    getTouchPlayerLeftX() {
      return touchPlayerLeftX;
    },

    /** 터치로 계산된 플레이어 위쪽 y (클램프됨). 없으면 null */
    getTouchPlayerTopY() {
      return touchPlayerTopY;
    },

    clampPlayerLeftGame(left) {
      return clampPlayerLeft(left);
    },

    clampPlayerTopGame(top) {
      return clampPlayerTop(top);
    },

    bindKeyboard() {
      window.addEventListener("keydown", onDown);
      window.addEventListener("keyup", onUp);
    },
  };

  function onDown(e) {
    keys[e.code] = true;
  }

  function onUp(e) {
    keys[e.code] = false;
  }

  global.Input.bindKeyboard();
})(typeof window !== "undefined" ? window : this);
