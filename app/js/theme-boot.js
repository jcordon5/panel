// Applies the saved theme before the first paint (avoids a light flash in dark mode).
(function () {
  try {
    var p = JSON.parse(localStorage.getItem("panel.prefs") || "{}");
    if (p.theme === "light" || p.theme === "dark") document.documentElement.setAttribute("data-theme", p.theme);
  } catch (e) { /* storage blocked */ }
})();
