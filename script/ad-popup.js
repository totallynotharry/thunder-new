/**
 * THUNDER shared ad popup (A-Ads unit 2456981).
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
  const AADS_AD_UNIT = "2456981";
  const DEFAULT_LOCK_SECONDS = 5;
  const STYLE_ID = "thunder-ad-popup-style";

  const CSS = `
    .thunder-ad-popup {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background-color: var(--bg);
      background-color: color-mix(in srgb, var(--bg) 70%, transparent);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
    }
    .thunder-ad-card {
      position: relative;
      width: min(520px, 100%);
      box-sizing: border-box;
      background: var(--fourth-bg);
      color: var(--text-color);
      border: 1px solid var(--third-bg);
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
      padding-right: 36px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      opacity: 0.7;
    }
    .thunder-ad-close {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 3;
      width: 30px;
      height: 30px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid var(--third-bg);
      background: var(--button-bg);
      color: var(--text-color);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }
    .thunder-ad-close:hover:not(:disabled) {
      background: var(--button-hover);
    }
    .thunder-ad-close:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .thunder-ad-close:disabled {
      cursor: default;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.85;
      color: var(--accent);
    }
    .thunder-ad-frame {
      width: 100%;
      margin: auto;
      position: relative;
      z-index: 1;
    }
    .thunder-ad-frame iframe {
      border: 0;
      padding: 0;
      width: 70%;
      height: auto;
      overflow: hidden;
      display: block;
      margin: auto;
    }
    .thunder-ad-hint {
      margin-top: 10px;
      min-height: 14px;
      text-align: right;
      font-size: 11px;
      color: var(--secondary-text-color);
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
      background-color: var(--bg);
      background-color: color-mix(in srgb, var(--bg) 75%, transparent);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
    }
  `;

  let popup = null;
  let dock = null;
  let countdownTimer = null;
  let lockRemaining = 0;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
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

  function show(options) {
    options = options || {};
    close(true);
    ensureStyle();

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

    const label = document.createElement("div");
    label.className = "thunder-ad-label";
    label.textContent = "Advertisement";

    // BEGIN AADS AD UNIT 2456981
    const adFrame = document.createElement("div");
    adFrame.id = "frame";
    adFrame.className = "thunder-ad-frame";

    const adIframe = document.createElement("iframe");
    adIframe.setAttribute("data-aa", AADS_AD_UNIT);
    adIframe.src = `https://acceptable.a-ads.com/${AADS_AD_UNIT}/?size=Adaptive`;
    adFrame.appendChild(adIframe);
    // END AADS AD UNIT 2456981

    const hint = document.createElement("div");
    hint.className = "thunder-ad-hint";

    card.appendChild(closeBtn);
    card.appendChild(label);
    card.appendChild(adFrame);
    card.appendChild(hint);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    popup = overlay;

    function tick() {
      if (lockRemaining > 0) {
        closeBtn.disabled = true;
        closeBtn.textContent = String(lockRemaining);
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
      closeBtn.innerHTML = '<i class="ri-close-line"></i>';
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
    if (dock) dock.remove();

    const container = options.container || document.body;

    const bar = document.createElement("div");
    bar.className = options.container
      ? "thunder-ad-dock"
      : "thunder-ad-dock thunder-ad-dock--fixed";

    const label = document.createElement("div");
    label.className = "thunder-ad-label";
    label.textContent = "Advertisement";

    // BEGIN AADS AD UNIT 2456981
    const adFrame = document.createElement("div");
    adFrame.id = "frame";
    adFrame.className = "thunder-ad-frame";

    const adIframe = document.createElement("iframe");
    adIframe.setAttribute("data-aa", AADS_AD_UNIT);
    adIframe.src = `https://acceptable.a-ads.com/${AADS_AD_UNIT}/?size=Adaptive`;
    adFrame.appendChild(adIframe);
    // END AADS AD UNIT 2456981

    bar.appendChild(label);
    bar.appendChild(adFrame);
    // Insert at the top of the container so the ad sits above existing content
    // (e.g. above the "813 games and counting! v2" footer text on Home).
    if (options.container) container.insertBefore(bar, container.firstChild);
    else container.appendChild(bar);
    dock = bar;
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
