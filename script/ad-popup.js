/**
 * THUNDER shared ad popup (Adsterra inline banner units).
 *
 * Usage:
 *   ThunderAdPopup.show();                 // show with the default 5s lock on the X
 *   ThunderAdPopup.show({ lockSeconds: 0 }); // no lock
 *   ThunderAdPopup.close();                 // respects the lock
 *   ThunderAdPopup.close(true);             // force close (used when a game exits)
 *   ThunderAdPopup.showDocked({ container }); // sticky bottom ad, no close button
 *
 * Colors come from the theme CSS variables (--bg, --fourth-bg, --third-bg,
 * --button-bg, --button-hover, --text-color, --secondary-text-color, --accent),
 * so the popup follows whatever theme is active.
 */
(function () {
  // Adsterra banner units (format: 'iframe'). Rebuilt from the snippet their
  // dashboard gives out:
  //   <script>atOptions = {'key':…,'format':'iframe','height':250,'width':300,
  //     'params':{}};</script>
  //   <script src="https://www.highrevenueformat.com/<key>/invoke.js"></script>
  //
  // One snippet per document: the slot is built once and reused, so a document
  // never mounts two units (they share the one global atOptions and would race).
  const AD_UNITS = {
    popup: { key: "1fda902d1c0aca61e4cbabe3dfd67ae9", width: 300, height: 250 },
    // TODO: replace with the 728x90 leaderboard unit for the home dock.
    // Reusing the 300x250 until that snippet exists so Home still shows an ad.
    dock: { key: "1fda902d1c0aca61e4cbabe3dfd67ae9", width: 300, height: 250 },
  };
  const AD_HOST = "https://www.highrevenueformat.com";
  // Second Adsterra placement (pl<id> loader): no atOptions, async by design,
  // and it anchors itself to its own script tag - so it belongs in the box.
  const AD_LOADER_SRC =
    "https://pl31609483.profitableratecpmnetwork.com/90/e3/fb/90e3fba52de49dff491775fac150217e.js";
  // The Social Bar (pl tag) floats over the page and never leaves on its own:
  // show a visible countdown and auto-close it after a minute.
  const SOCIAL_AD_SECONDS = 60;
  const BADGE_ID = "thunder-ad-badge";
  // Matched against ancestors - anything inside these is never auto-closed
  // (site UI: error overlay / reveal screen, and our own banner area).
  const NEVER_CLOSE = [
    "#game-unavailable-overlay",
    ".initial-overlay",
    "#menu-dismiss-overlay",
    ".thunder-ad-fit",
  ];
  // Matched on the node itself - our own popup/dock chrome.
  const OUR_CHROME = [
    "thunder-ad-popup",
    "thunder-ad-close",
    "thunder-ad-card",
    "thunder-ad-label",
    "thunder-ad-hint",
    "thunder-ad-dock",
    "thunder-ad-fit",
    "thunder-ad-fit-inner",
    "thunder-ad-slot",
    "thunder-ad-badge",
  ];
  const DEFAULT_LOCK_SECONDS = 5;
  const STYLE_ID = "thunder-ad-popup-style";

  const CSS = `
    .thunder-ad-popup {
      position: fixed;
      inset: 0;
      /* The banner renders INSIDE the card, so nothing has to paint above this
         overlay - keep it well clear of #game-overlay (1000) / filters (999). */
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background-color: var(--bg, #0a111d);
      background-color: color-mix(in srgb, var(--bg, #0a111d) 70%, transparent);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
    }
    .thunder-ad-card {
      position: relative;
      width: min(520px, 100%);
      box-sizing: border-box;
      background: var(--fourth-bg, #212630);
      color: var(--text-color, #d5dce8);
      border: 1.5px solid rgba(var(--cb, 164, 184, 219), 0.12);
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
      font-family: inherit;
      animation: thunder-ad-in 0.22s ease;
    }
    @keyframes thunder-ad-in {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    .thunder-ad-label {
      margin: 0 0 10px;
      padding-right: 46px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color, #d5dce8);
      opacity: 0.7;
    }
    .thunder-ad-close {
      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 5;
      width: 32px;
      height: 32px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid var(--third-bg, #444f60);
      background: var(--button-bg, #2b384d);
      color: var(--text-color, #d5dce8);
      font-size: 17px;
      line-height: 1;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }
    /* Grows the hit target ~10px past the button so the centre AND edges work. */
    .thunder-ad-close::before {
      content: "";
      position: absolute;
      inset: -10px;
      border-radius: 12px;
    }
    /* The glyph is decoration only - clicks must land on the button itself. */
    .thunder-ad-close i {
      pointer-events: none;
    }
    .thunder-ad-close:hover:not(:disabled) {
      background: var(--button-hover, #3c4a5d);
    }
    .thunder-ad-close:focus-visible {
      outline: 2px solid var(--accent, var(--primary, #a4b8db));
      outline-offset: 2px;
    }
    .thunder-ad-close:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .thunder-ad-slot {
      position: relative;
      z-index: 1;
      /* invoke.js drops its creative next to its own tag, i.e. inside this
         box - centre it so a 300x250 / 728x90 sits evenly in the card. */
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 60px;
    }
    /* Fixed-size banner units are scaled down to the room the box actually
       has, so a 728x90 dock or a 300x250 popup never overflows a phone. */
    .thunder-ad-fit {
      width: 100%;
      margin: 0 auto;
      overflow: hidden;
    }
    .thunder-ad-fit-inner {
      transform-origin: top left;
    }
    .thunder-ad-hint {
      margin-top: 10px;
      min-height: 14px;
      text-align: right;
      font-size: 11px;
      color: var(--secondary-text-color, #d5dce8);
      opacity: 0.7;
    }
    .thunder-ad-hint:empty {
      display: none;
    }
    .thunder-ad-dock {
      position: relative;
      z-index: 60;
      width: 100%;
      margin: 0 auto 10px;
      animation: thunder-ad-in 0.3s ease;
    }
    .thunder-ad-dock .thunder-ad-label {
      padding-right: 0;
      text-align: center;
    }
    .thunder-ad-dock--fixed {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0;
      padding: 10px 16px;
      box-sizing: border-box;
      background-color: var(--bg, #0a111d);
      background-color: color-mix(in srgb, var(--bg, #0a111d) 75%, transparent);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
    }
    /* Countdown shown while a Social Bar ad is waiting to auto-close.
       Click it to close the ad immediately. */
    .thunder-ad-badge {
      position: fixed;
      z-index: 2147483647;
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      line-height: 1.3;
      color: var(--text-color, #d5dce8);
      background: var(--fourth-bg, #212630);
      border: 1px solid rgba(var(--cb, 164, 184, 219), 0.25);
      border-radius: 999px;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
    }
    .thunder-ad-badge:hover {
      background: var(--button-hover, #3c4a5d);
    }
  `;

  let popup = null;
  let dock = null;
  let adSlot = null;
  // Live banner fit boxes, re-measured on resize (stale ones are pruned).
  let fits = [];
  let countdownTimer = null;
  let lockRemaining = 0;
  // Social Bar auto-close state.
  let socialObserver = null;
  let socialTargets = null;
  let socialBadge = null;
  let socialTimer = null;
  let socialLeft = SOCIAL_AD_SECONDS;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /**
   * Safety net: if this document never got its theme stylesheet (e.g. theme.js
   * was cached out or failed), re-run it so --bg / --fourth-bg / --button-bg
   * exist before the popup paints.
   */
  function ensureTheme() {
    try {
      if (window.applyVtheme && !document.getElementById("theme-link")) {
        window.applyVtheme();
      }
    } catch (e) {}
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function close(force) {
    if (!popup) return;
    if (!force && lockRemaining > 0) return;
    clearCountdown();
    popup.remove();
    popup = null;
    lockRemaining = 0;
  }

  /**
   * The Adsterra snippet for `kind`, rebuilt as script elements inside the slot
   * so the creative lands inside our box rather than somewhere on the page:
   *   1. an inline script assigning the global atOptions (key / format /
   *      height / width), exactly like their snippet
   *   2. invoke.js with async=false so it always runs after step 1
   *
   * invoke.js contains no document.write: it builds an iframe and inserts it
   * next to its own script tag (script[src$=…] -> parentNode.insertBefore),
   * which from here is inside .thunder-ad-slot - i.e. inside the popup card or
   * the footer dock.
   *
   * The slot is built once per document and reused across opens: re-inserting
   * an already-inserted script does not execute it again, so reopening a game
   * never piles up duplicate units (and exactly one atOptions ever exists).
   */
  function getAdSlot(kind) {
    if (adSlot) return adSlot;

    const unit = AD_UNITS[kind] || AD_UNITS.popup;

    adSlot = document.createElement("div");
    adSlot.className = "thunder-ad-slot";
    adSlot.style.minHeight = unit.height + "px";

    const options = document.createElement("script");
    options.textContent =
      "atOptions = { 'key' : '" +
      unit.key +
      "', 'format' : 'iframe', 'height' : " +
      unit.height +
      ", 'width' : " +
      unit.width +
      ", 'params' : {} };";

    const invoke = document.createElement("script");
    invoke.src = AD_HOST + "/" + unit.key + "/invoke.js";
    invoke.async = false;
    invoke.addEventListener("load", applyFits);

    // Second unit: the pl<id> loader. Independent of atOptions, so it just
    // rides along in the same slot (and therefore in the same box).
    const loader = document.createElement("script");
    loader.src = AD_LOADER_SRC;
    loader.async = true;
    loader.setAttribute("data-cfasync", "false");
    loader.addEventListener("load", applyFits);

    adSlot.appendChild(options);
    adSlot.appendChild(invoke);
    adSlot.appendChild(loader);

    // From here on, watch for the Social Bar this loader may paint so it can
    // be counted down and closed after a minute.
    startSocialWatch();

    return adSlot;
  }

  function inDocument(node) {
    let n = node;
    while (n) {
      if (n === document.body) return true;
      n = n.parentNode || n.parent || null;
    }
    return false;
  }

  /**
   * Banner units are sold at fixed sizes (300x250, 728x90), so instead of
   * letting them overflow a narrow box we scale the creative to whatever room
   * the box really has: measure the wrapper while it is fluid, then pin it to
   * the scaled size so the card/dock reserves exactly the right height.
   */
  const DOCK_CLEAR_GAP = 16; // px of breathing room under the logo
  const MIN_BANNER_H = 70; // never shrink the ad out of existence

  function setFitScale(entry, scale) {
    entry.scale = scale;
    entry.outer.style.width =
      Math.max(1, Math.round(entry.naturalW * scale)) + "px";
    entry.outer.style.height =
      Math.max(1, Math.round(entry.naturalH * scale)) + "px";
    entry.inner.style.transform = "scale(" + scale + ")";
  }

  function applyFit(entry) {
    const outer = entry.outer;
    outer.style.width = "";
    outer.style.height = "";
    const avail = outer.clientWidth;
    if (!(avail > 0)) return;

    // The unit's nominal size is the floor, but if either tag renders
    // something bigger alongside it, scale to the real content instead of
    // clipping it.
    entry.naturalW = Math.max(entry.unit.width, entry.inner.scrollWidth || 0);
    entry.naturalH = Math.max(entry.unit.height, entry.inner.scrollHeight || 0);

    let scale = Math.min(1, avail / entry.naturalW);

    // Height budget: never let the box outrun a short viewport (Chromebooks,
    // small windows) - reserve the room the surrounding furniture needs.
    const vh = window.innerHeight || 0;
    if (vh > 0) {
      const reserve = entry.kind === "dock" ? 160 : 200;
      const budget = vh - reserve;
      if (budget > 60) scale = Math.min(scale, budget / entry.naturalH);
    }

    setFitScale(entry, scale);
    keepClearOfAnchor(entry);
  }

  /**
   * Home centres its logo (.content-container) and pins the ad to the bottom,
   * so on a short screen the banner grows up over the logo. Shrink - never
   * grow - until the top of the ad bar clears the anchor by DOCK_CLEAR_GAP.
   */
  function keepClearOfAnchor(entry) {
    if (!entry.clearOf || !entry.anchorBox) return;
    let anchor = null;
    try {
      anchor = document.querySelector(entry.clearOf);
    } catch (e) {}
    if (
      !anchor ||
      typeof anchor.getBoundingClientRect !== "function" ||
      typeof entry.anchorBox.getBoundingClientRect !== "function"
    )
      return;

    for (let i = 0; i < 8; i++) {
      const barTop = entry.anchorBox.getBoundingClientRect().top;
      const anchorBottom = anchor.getBoundingClientRect().bottom;
      const overshoot = anchorBottom + DOCK_CLEAR_GAP - barTop;
      if (!(overshoot > 0)) return; // already clear
      const height = parseFloat(entry.outer.style.height) || 0;
      if (!(height > 0)) return;
      const next = height - overshoot;
      if (!(next >= MIN_BANNER_H)) {
        setFitScale(entry, Math.max(entry.scale * (MIN_BANNER_H / height), 0.1));
        return;
      }
      setFitScale(entry, entry.scale * (next / height));
    }
  }

  function applyFits() {
    for (let i = fits.length - 1; i >= 0; i--) {
      const entry = fits[i];
      if (!inDocument(entry.outer)) fits.splice(i, 1);
      else applyFit(entry);
    }
  }

  if (window.addEventListener) window.addEventListener("resize", applyFits);

  /** The scaling wrapper around one banner unit (inner is the unscaled 300x250
   *  / 728x90 box; the slot with the Adsterra snippet lives inside it).
   *  `meta.clearOf` = selector whose bottom edge the ad must stay below
   *  (Home passes ".content-container" so the logo stays visible);
   *  `meta.anchorBox` = the element to measure that clearance against. */
  function makeBanner(kind, meta) {
    const unit = AD_UNITS[kind] || AD_UNITS.popup;
    meta = meta || {};

    const outer = document.createElement("div");
    outer.className = "thunder-ad-fit";

    const inner = document.createElement("div");
    inner.className = "thunder-ad-fit-inner";
    inner.style.width = unit.width + "px";
    inner.style.height = unit.height + "px";
    inner.appendChild(getAdSlot(kind));

    outer.appendChild(inner);
    fits.push({
      outer: outer,
      inner: inner,
      unit: unit,
      kind: kind,
      clearOf: meta.clearOf || null,
      anchorBox: meta.anchorBox || null,
      naturalW: unit.width,
      naturalH: unit.height,
      scale: 1,
    });
    // Creatives can arrive after their tags report load (and after that, some
    // networks inject a second element) - take one more measurement pass.
    setTimeout(applyFits, 1500);
    return outer;
  }

  function positionOf(node) {
    try {
      return window.getComputedStyle(node).position;
    } catch (e) {
      return "static";
    }
  }

  /**
   * The Social Bar (pl tag) paints a floating overlay and then stays put, so
   * we watch for it and give it a minute. Anything eligible must be:
   *  - an element (never the scripts/styles the tags add),
   *  - not our popup/dock chrome and not site UI (error overlay, reveal, ...),
   *  - positioned (fixed/sticky/absolute) - in-flow content such as the banner
   *    creative or page text is never touched.
   */
  function isSocialAdCandidate(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = String(node.tagName).toUpperCase();
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "LINK" ||
      tag === "META" ||
      tag === "NOSCRIPT" ||
      tag === "IFRAME"
    )
      return false;
    if (node.id === STYLE_ID || node.id === BADGE_ID) return false;

    const classes =
      typeof node.className === "string" ? node.className.split(/\s+/) : [];
    for (let i = 0; i < OUR_CHROME.length; i++) {
      if (classes.indexOf(OUR_CHROME[i]) !== -1) return false;
    }
    if (node.closest) {
      for (let i = 0; i < NEVER_CLOSE.length; i++) {
        try {
          if (node.closest(NEVER_CLOSE[i])) return false;
        } catch (e) {}
      }
    }

    const pos = positionOf(node);
    return pos === "fixed" || pos === "sticky" || pos === "absolute";
  }

  function considerSocialNode(node) {
    if (!isSocialAdCandidate(node)) return;
    if (!socialTargets) socialTargets = new Set();
    if (socialTargets.has(node)) return;
    socialTargets.add(node);
    startSocialCountdown(node);
  }

  function startSocialWatch() {
    if (socialObserver || !window.MutationObserver || !document.documentElement)
      return;
    socialObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type !== "childList") return;
        record.addedNodes.forEach((node) => considerSocialNode(node));
      });
    });
    socialObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function positionSocialBadge(node) {
    if (!socialBadge) return;
    let placed = false;
    try {
      if (node && typeof node.getBoundingClientRect === "function") {
        const rect = node.getBoundingClientRect();
        const vw = window.innerWidth;
        if (
          rect &&
          typeof rect.top === "number" &&
          typeof rect.right === "number" &&
          typeof vw === "number"
        ) {
          socialBadge.style.top = Math.max(6, rect.top - 30) + "px";
          socialBadge.style.right = Math.max(6, vw - rect.right + 6) + "px";
          placed = true;
        }
      }
    } catch (e) {}
    if (!placed) {
      socialBadge.style.top = "6px";
      socialBadge.style.right = "6px";
    }
  }

  function ensureSocialBadge(node) {
    if (!socialBadge) {
      socialBadge = document.createElement("div");
      socialBadge.className = "thunder-ad-badge";
      socialBadge.id = BADGE_ID;
      socialBadge.title = "Click to close this ad now";
      socialBadge.addEventListener("click", () => closeSocialAd());
      document.body.appendChild(socialBadge);
    }
    positionSocialBadge(node);
  }

  function renderSocialBadge() {
    if (!socialBadge) return;
    socialBadge.textContent = "ad closes in " + socialLeft + "s";
  }

  function startSocialCountdown(node) {
    ensureSocialBadge(node);
    if (socialTimer) return; // one clock covers every node of this ad
    socialLeft = SOCIAL_AD_SECONDS;
    renderSocialBadge();
    socialTimer = setInterval(socialTick, 1000);
  }

  function socialTick() {
    socialLeft -= 1;
    if (socialLeft < 0) socialLeft = 0;
    renderSocialBadge();
    if (socialLeft <= 0) closeSocialAd();
  }

  /** Manual close (badge click) or the 60s timer: drop the ad and its badge. */
  function closeSocialAd() {
    if (socialTimer) {
      clearInterval(socialTimer);
      socialTimer = null;
    }
    if (socialTargets) {
      socialTargets.forEach((node) => {
        try {
          node.remove();
        } catch (e) {}
      });
      socialTargets = null;
    }
    if (socialBadge) {
      socialBadge.remove();
      socialBadge = null;
    }
    socialLeft = SOCIAL_AD_SECONDS;
  }

  function show(options) {
    options = options || {};
    close(true);
    ensureStyle();
    ensureTheme();

    const lockSeconds =
      typeof options.lockSeconds === "number"
        ? Math.max(0, options.lockSeconds)
        : DEFAULT_LOCK_SECONDS;
    lockRemaining = lockSeconds;

    const overlay = document.createElement("div");
    overlay.className = "thunder-ad-popup";

    const card = document.createElement("div");
    card.className = "thunder-ad-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Advertisement");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "thunder-ad-close";
    closeBtn.innerHTML = '<i class="ri-close-line"></i>';

    const label = document.createElement("div");
    label.className = "thunder-ad-label";
    label.textContent = "Advertisement";

    const hint = document.createElement("div");
    hint.className = "thunder-ad-hint";

    card.appendChild(closeBtn);
    card.appendChild(label);
    card.appendChild(makeBanner("popup"));
    card.appendChild(hint);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    popup = overlay;
    applyFits();

    function tick() {
      if (lockRemaining > 0) {
        closeBtn.disabled = true;
        closeBtn.setAttribute(
          "aria-label",
          `Close ad in ${lockRemaining} second${lockRemaining === 1 ? "" : "s"}`
        );
        hint.textContent = `Ad can be closed in ${lockRemaining}s`;
        lockRemaining -= 1;
        return;
      }
      clearCountdown();
      closeBtn.disabled = false;
      closeBtn.setAttribute("aria-label", "Close ad");
      hint.textContent = "";
    }

    tick();
    if (lockSeconds > 0) countdownTimer = setInterval(tick, 1000);

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  /**
   * Sticky bottom ad with no close button. When `options.container` is given the
   * ad is appended inside it (so it can sit directly above existing bottom
   * content, e.g. the home page footer text); otherwise a fixed bottom bar is
   * used. Never affected by close() / Escape.
   */
  function showDocked(options) {
    options = options || {};
    ensureStyle();
    ensureTheme();
    if (dock) dock.remove();

    const container = options.container || document.body;

    const bar = document.createElement("div");
    bar.className = options.container
      ? "thunder-ad-dock"
      : "thunder-ad-dock thunder-ad-dock--fixed";

    const label = document.createElement("div");
    label.className = "thunder-ad-label";
    label.textContent = "Advertisement";

    bar.appendChild(label);
    bar.appendChild(
      makeBanner("dock", { clearOf: options.clearOf, anchorBox: bar })
    );
    // Insert at the top of the container so the ad sits above existing content
    // (e.g. above the "813 games and counting! v2" footer text on Home).
    if (options.container) container.insertBefore(bar, container.firstChild);
    else container.appendChild(bar);
    dock = bar;
    applyFits();
    return bar;
  }

  function removeDock() {
    if (dock) {
      dock.remove();
      dock = null;
    }
  }

  window.ThunderAdPopup = { show: show, close: close, showDocked: showDocked, removeDock: removeDock };
})();
