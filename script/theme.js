(function () {
  const THEME_KEY = "current_theme";
  const FONT_KEY = "current_font";
  const CUSTOM_CONFIG_KEY = "custom_theme_config";
  const DEFAULT_THEME = "midnight";
  const updateFaviconForTheme = () => {
    const link = document.getElementById("favicon-link");
    if (!link) return;
    const theme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    const darkThemes = new Set([
      "midnight",
      "vapor",
      "amoled",
      "nebula",
      "nordic",
      "ocean",
      "forest",
      "earth",
      "sunset",
      "amethyst",
      "sakura",
      "rose",
      "lavender",
    ]);
    const iconFill = darkThemes.has(theme) ? "white" : "black";
    const loadingLogo = document.getElementById("loading-logo");
    if (loadingLogo) {
      loadingLogo.style.filter = darkThemes.has(theme) ? "invert(1)" : "none";
    }
    const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"${iconFill}\" viewBox=\"0 0 16 16\"><path d=\"M13.405 4.027a5.001 5.001 0 0 0-9.499-1.004A3.5 3.5 0 1 0 3.5 10H13a3 3 0 0 0 .405-5.973M8.5 1a4 4 0 0 1 3.976 3.555.5.5 0 0 0 .5.445H13a2 2 0 0 1 0 4H3.5a2.5 2.5 0 1 1 .605-4.926.5.5 0 0 0 .596-.329A4 4 0 0 1 8.5 1M7.053 11.276A.5.5 0 0 1 7.5 11h1a.5.5 0 0 1 .474.658l-.28.842H9.5a.5.5 0 0 1 .39.812l-2 2.5a.5.5 0 0 1-.875-.433L7.36 14H6.5a.5.5 0 0 1-.447-.724z\"/></svg>`;
    link.href = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  window.applyVtheme = () => {
    return new Promise((resolve) => {
      const theme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
      const root = document.documentElement;

      const vars = [
        "--bg",
        "--secondary-bg",
        "--third-bg",
        "--fourth-bg",
        "--primary",
        "--secondary",
        "--text-color",
        "--secondary-text-color",
        "--button-bg",
        "--button-hover",
        "--gradient-start",
        "--gradient-end",
        "--accent",
        "--cb",
        "--bc",
      ];

      if (theme === "custom") {
        const customConfig = JSON.parse(
          localStorage.getItem(CUSTOM_CONFIG_KEY) || "{}"
        );

        vars.forEach((v) => {
          if (customConfig[v]) {
            root.style.setProperty(v, customConfig[v]);
          }
        });

        root.setAttribute("data-theme", "custom");
        resolve();
        return;
      }

      vars.forEach((v) => {
        root.style.removeProperty(v);
      });

      const isAlt = localStorage.getItem("is_alt_theme") === "true";
      const folder = isAlt ? "alt-theme" : "theme";
      const themePath = `/style/${folder}/${theme}.css`;

      document.documentElement.setAttribute("data-theme", theme);

      let themeLink = document.getElementById("theme-link");
      if (!themeLink) {
        themeLink = document.createElement("link");
        themeLink.id = "theme-link";
        themeLink.rel = "stylesheet";
        document.head.appendChild(themeLink);
      }

      const timeout = setTimeout(resolve, 1500);
      themeLink.onload = () => {
        updateFaviconForTheme();
        clearTimeout(timeout);
        resolve();
      };
      themeLink.onerror = () => {
        updateFaviconForTheme();
        clearTimeout(timeout);
        resolve();
      };

      themeLink.href = themePath;
    });
  };

  window.applyVfont = () => {
    const fontName = localStorage.getItem(FONT_KEY);
    let styleEl = document.getElementById("dynamic-font-style");
    if (
      !fontName ||
      fontName.trim() === "" ||
      fontName.toLowerCase() === "default"
    ) {
      if (styleEl) styleEl.remove();
      return;
    }
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(
      / /g,
      "+"
    )}:wght@400;700&display=swap`;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-font-style";
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `@import url('${fontUrl}'); * { font-family: '${fontName}', sans-serif !important; }`;
  };

  applyVtheme();
  applyVfont();
  updateFaviconForTheme();

  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY || e.key === CUSTOM_CONFIG_KEY) applyVtheme();
    if (e.key === FONT_KEY) applyVfont();
  });
})();
