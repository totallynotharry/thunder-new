/**
 * THUNDER shared ad popup (A-Ads unit rendered inside a themed box).
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
  // A-Ads adaptive unit - the site's only ad platform. It is a plain iframe:
  // no global config, no loader script, it just fills the box we give it.
  // One unit per document - the slot is built once and reused, so a document
  // never mounts a second iframe.
  const AD_UNIT_ID = "2457264";
  const AD_UNIT_SRC = "https://acceptable.a-ads.com/2457264/?size=Adaptive";
  // Nominal box each placement reserves for the unit. The adaptive creative
  // fills whatever box it gets; the fit wrapper scales that box down on narrow
  // or short screens (displayScale lets a placement ask for less than full
  // size - e.g. the home dock wants 85%).
  const AD_UNITS = {
    popup: { width: 300, height: 250 },
    dock: { width: 300, height: 250, displayScale: 0.85 },
  };
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
      /* The unit is an iframe that fills this box - centre it so a 300x250 /
         728x90 sits evenly in the card. */
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
      /* Also the positioning context for the dock's hide ✕, which must sit on
         the ad itself (the bar is full width - the ✕ would end up miles away). */
      position: relative;
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
    /* Hide-for-this-visit control on the home dock (temporary: nothing is
       stored, so the ad returns on the next page load). */
    .thunder-ad-hide {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 6;
      width: 26px;
      height: 26px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid var(--third-bg, #444f60);
      background: var(--button-bg, #2b384d);
      color: var(--text-color, #d5dce8);
      font-size: 15px;
      line-height: 1;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.15s ease, color 0.15s ease;
    }
    /* Grows the hit target past the button so the edges work too. */
    .thunder-ad-hide::before {
      content: "";
      position: absolute;
      inset: -8px;
      border-radius: 12px;
    }
    .thunder-ad-hide i {
      pointer-events: none;
    }
    .thunder-ad-hide:hover {
      background: var(--button-hover, #3c4a5d);
    }
    .thunder-ad-hide:focus-visible {
      outline: 2px solid var(--accent, var(--primary, #a4b8db));
      outline-offset: 2px;
    }
  `;

  let popup = null;
  let dock = null;
  let adSlot = null;
  // Live banner fit boxes, re-measured on resize (stale ones are pruned).
  let fits = [];
  let countdownTimer = null;
  let lockRemaining = 0;

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
   * The A-Ads unit for this document, built as a plain iframe inside the slot
   * so the creative lands INSIDE our box rather than somewhere on the page:
   * one iframe, no global config, no loader script, no document.write.
   *
   * The slot is built once per document and reused across opens, so reopening
   * a game never piles up a second unit - same iframe, same impression slot.
   */
  function getAdSlot(kind) {
    if (adSlot) return adSlot;

    const unit = AD_UNITS[kind] || AD_UNITS.popup;

    adSlot = document.createElement("div");
    adSlot.className = "thunder-ad-slot";
    adSlot.style.minHeight = unit.height + "px";

    const frame = document.createElement("iframe");
    frame.setAttribute("data-aa", AD_UNIT_ID);
    frame.src = AD_UNIT_SRC;
    frame.title = "Advertisement";
    frame.setAttribute("scrolling", "no");
    // Adaptive by design: fill the box the fit wrapper hands us exactly, so
    // there is no gap under the creative and nothing gets clipped.
    frame.style.border = "0";
    frame.style.padding = "0";
    frame.style.margin = "0";
    frame.style.width = "100%";
    frame.style.height = unit.height + "px";
    frame.style.display = "block";
    frame.style.overflow = "hidden";
    // Creatives arrive after the box is measured - re-measure when it lands.
    frame.addEventListener("load", applyFits);

    adSlot.appendChild(frame);

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
    // Per-unit size preference: e.g. Home wants its dock shown a bit smaller
    // than the unit's full size (85%), never bigger.
    if (entry.unit.displayScale > 0 && entry.unit.displayScale < 1) {
      scale = Math.min(scale, entry.unit.displayScale);
    }

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
   *  / 728x90 box; the slot with the A-Ads unit lives inside it).
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
   * Sticky bottom ad. When `options.container` is given the ad is appended
   * inside it (so it can sit directly above existing bottom content, e.g. the
   * home page footer text); otherwise a fixed bottom bar is used. Never
   * affected by close() / Escape.
   *
   * Unless `options.hideable === false` it carries a small ✕ that hides it for
   * the rest of this page load only - nothing is written anywhere, so a reload
   * brings the ad straight back.
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
    if (options.hideable !== false) bar.className += " thunder-ad-dock--hideable";

    const label = document.createElement("div");
    label.className = "thunder-ad-label";
    label.textContent = "Advertisement";

    bar.appendChild(label);

    const banner = makeBanner("dock", {
      clearOf: options.clearOf,
      anchorBox: bar,
    });

    // Temporary hide: only affects this page load - no storage, so reloading
    // the page brings the ad back exactly as before. The button is appended to
    // the ad box itself (.thunder-ad-fit is position:relative and is pinned to
    // the scaled creative's exact size), so it lands on the square ad's corner
    // instead of the far edge of the full-width bar.
    if (options.hideable !== false) {
      const hideBtn = document.createElement("button");
      hideBtn.type = "button";
      hideBtn.className = "thunder-ad-hide";
      hideBtn.setAttribute("aria-label", "Hide this ad for this visit");
      hideBtn.title = "Hide ad (comes back on reload)";
      hideBtn.innerHTML = '<i class="ri-close-line"></i>';
      hideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hideDockForNow();
      });
      banner.appendChild(hideBtn);
    }

    bar.appendChild(banner);
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

  /**
   * Hide button handler: drop the dock for this page load only - no storage, so
   * the next load shows the ad again.
   */
  function hideDockForNow() {
    removeDock();
  }

  window.ThunderAdPopup = { show: show, close: close, showDocked: showDocked, removeDock: removeDock };
})();
