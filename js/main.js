(function () {
  const canvas = document.getElementById("game");
  if (!canvas) return;

  if (Input.prefersCoarsePointer()) {
    document.documentElement.classList.add("touch-input");
  }
  Input.init(canvas);
  Game.init(canvas);
})();
