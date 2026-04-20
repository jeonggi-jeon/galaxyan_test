(function () {
  const canvas = document.getElementById("game");
  if (!canvas) return;

  Input.init(canvas);
  Game.init(canvas);
})();
