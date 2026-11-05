/* Sidenote website theme toggle. No dependencies, no tracking. */
(function () {
  var KEY = "sidenote-site-theme";
  var root = document.documentElement;
  var media = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  var toggles = document.querySelectorAll("[data-theme-toggle]");

  function theme() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function apply(next, persist) {
    root.dataset.theme = next;
    if (persist) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* Storage can be unavailable; the choice still applies this visit. */
      }
    }
    var dark = next === "dark";
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute("aria-checked", String(dark));
      toggles[i].setAttribute(
        "title",
        dark ? "Switch to light mode" : "Switch to dark mode",
      );
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#14120e" : "#f8f3e9");
  }

  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener("click", function () {
      apply(theme() === "dark" ? "light" : "dark", true);
    });
  }

  apply(theme(), false);

  function followSystem(event) {
    if (stored() !== "light" && stored() !== "dark") {
      apply(event.matches ? "dark" : "light", false);
    }
  }

  if (media && media.addEventListener) {
    media.addEventListener("change", followSystem);
  } else if (media && media.addListener) {
    media.addListener(followSystem);
  }
})();
