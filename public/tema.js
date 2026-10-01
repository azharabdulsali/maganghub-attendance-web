(function () {
  try {
    var t = localStorage.getItem("theme");
    var d =
      t === "dark" ||
      (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (d) {
      document.documentElement.classList.add("dark");
    }
  } catch {
    // Mode privat / storage mati: biarkan tema default. Jangan pernah gagal.
  }
})();
