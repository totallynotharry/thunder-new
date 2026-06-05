const browserView = document.getElementById("browser-view");
const grid = document.getElementById("grid");
const noResultsMessage = document.querySelector(".no-results-message");
const listDescription = document.getElementById("list-description");
const dropdowns = document.querySelectorAll(".dropdown-wrapper");
const gameOverlay = document.getElementById("game-overlay");
const sourceDropdownWrapper = document.getElementById(
  "source-dropdown-wrapper"
);
const sourceOptionsContainer = document.getElementById("source-options-container");
const sourceSelectorText = sourceDropdownWrapper.querySelector(
  ".dropdown-menu .dropdown-text"
);
const sourceSelectorIcon = document.getElementById("current-source-icon");
const searchBar = document.querySelector(".search-bar");
const input = searchBar.querySelector("input");
const filterDropdownIcon = document.querySelector(".filter-icon");
const filterDropdownWrapper = document.getElementById(
  "filter-dropdown-wrapper"
);
const backdrop = document.getElementById("backdrop");
const iframe = document.getElementById("game-content-frame");
const loadingContainer = document.getElementById("loading-container");
const loadingMessage = document.getElementById("loading-message");
const buttonPanel = document.getElementById("button-panel");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const backBtn = document.getElementById("back-btn");
const globalSearchBtn = document.getElementById("global-search-btn");
const globalStatusText = document.getElementById("global-status-text");

let currentFilteredList = [];
let renderedCount = 0;
const BATCH_SIZE = 50;
const sentinel = document.createElement("div");
sentinel.style.height = "20px";
sentinel.style.width = "100%";

let imageObserver;
let scrollObserver;
let currentSourceData = null;
let currentFilter = "default";
let allGames = [];
let switchTextTimeout;
let gameLists = [];
let userIPPrefix = "";

// state.
let isGlobalSearchActive = false;
let debounceTimer;

function pickRandomGames(count = 3) {
  const pool = allGames.filter((g) => g && g.name && g.url);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function showGameUnavailablePopup(gameName) {
  const existing = document.getElementById("game-unavailable-overlay");
  if (existing) existing.remove();
  const recs = pickRandomGames(3);
  const overlay = document.createElement("div");
  overlay.id = "game-unavailable-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;";
  const box = document.createElement("div");
  box.style.cssText =
    "max-width:560px;width:100%;background:#111827;color:#e5e7eb;border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:18px;font-family:inherit;";
  const items = recs
    .map(
      (g) =>
        `<button data-url="${g.url}" style="width:100%;text-align:left;margin-top:8px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#1f2937;color:#e5e7eb;cursor:pointer;">${g.name}</button>`
    )
    .join("");
  box.innerHTML = `<h3 style="margin:0 0 8px 0;">This game is currently not available.</h3>
    <p style="margin:0 0 8px 0;opacity:.9;">Don't fret, ${gameName} will be back up soon. While you wait, check out some other games!:</p>
    ${items}
    <div style="text-align:right;margin-top:12px;"><button id="close-game-unavailable" style="padding:8px 12px;border-radius:10px;border:none;background:#3b82f6;color:white;cursor:pointer;">Close</button></div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  box.querySelector("#close-game-unavailable").onclick = () => overlay.remove();
  box.querySelectorAll("button[data-url]").forEach((btn) => {
    btn.onclick = () => {
      overlay.remove();
      playGame(btn.getAttribute("data-url"), true, btn.textContent, false, false);
    };
  });
}

const GRADIENT_PALETTE = [];
for (let i = 0; i < 20; i++) {
  const hue = Math.floor((360 / 20) * i);
  GRADIENT_PALETTE.push(
    `linear-gradient(135deg, hsl(${hue}, 55%, 65%), hsl(${
      (hue + 40) % 360
    }, 55%, 55%))`
  );
}

function getRandomSoftBackground() {
  return GRADIENT_PALETTE[Math.floor(Math.random() * GRADIENT_PALETTE.length)];
}

function runSearchDebounced() {
  clearTimeout(debounceTimer);
  const delay = isGlobalSearchActive ? 500 : 300;
  debounceTimer = setTimeout(() => {
    filterSortGames();
  }, delay);
}

async function fetchUserIP() {
  try {
    const response = await fetch(BURLFULL + "/api/ip");
    if (!response.ok) throw new Error("IP Fetch failed");
    const data = await response.json();
    userIPPrefix = data.ip.split(".")[0];
  } catch (error) {
    console.warn("Could not fetch user IP, ngg games will not work:", error);
    userIPPrefix = "";
  }
}

function setSearchPlaceholder() {
  if (isGlobalSearchActive) {
    input.placeholder = "Search all sources...";
  } else {
    input.placeholder = currentSourceData
      ? `Search ${currentSourceData.Name}...`
      : "Search Games...";
  }
}

function handleScrollMasks() {
  grid.classList.toggle("show-top-mask", grid.scrollTop > 10);
  const isAtBottom =
    grid.scrollHeight - grid.scrollTop <= grid.clientHeight + 10;
  grid.classList.toggle(
    "show-bottom-mask",
    !isAtBottom && grid.scrollHeight > grid.clientHeight
  );
}

async function performGlobalSearch() {
  const query = input.value.toLowerCase();
  if (!query) {
    clearGrid();
    noResultsMessage.style.display = "none";
    return;
  }

  globalStatusText.classList.add("visible");
  grid.classList.add("fade-games");

  try {
    const searchPromises = gameLists.map(async (source) => {
      try {
        const res = await fetch(source.File);
        if (!res.ok) return [];
        const games = await res.json();
        return games
          .filter((g) => g.name.toLowerCase().includes(query))
          .map((g) => {
            // Fix URL if it starts with /games/ or /gameimg/
            if (
              g.url &&
              (g.url.startsWith("/games/") || g.url.startsWith("/gameimg/"))
            ) {
              g.url = BURLFULL + g.url;
            }
            // Fix Cover if it starts with /games/ or /gameimg/
            if (
              g.cover &&
              (g.cover.startsWith("/games/") || g.cover.startsWith("/gameimg/"))
            ) {
              g.cover = BURLFULL + g.cover;
            }

            return {
              ...g,
              sourceName: source.Name,
              sourceIcon: source.Icon || "ri-file-line",
              sourceType: source.Type,
            };
          });
      } catch (e) {
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    let combinedResults = results.flat();

    const unique = [];
    const seen = new Set();
    combinedResults.forEach((item) => {
      const id = `${item.name}-${item.url}`;
      if (!seen.has(id)) {
        unique.push(item);
        seen.add(id);
      }
    });

    if (currentFilter === "alphabetical") {
      unique.sort((a, b) => a.name.localeCompare(b.name));
    }

    currentFilteredList = unique;
    clearGrid();

    noResultsMessage.style.display =
      currentFilteredList.length === 0 ? "block" : "none";

    renderNextBatch();
  } catch (err) {
    console.error("Global search failed:", err);
  } finally {
    globalStatusText.classList.remove("visible");
    grid.classList.remove("fade-games");
    handleScrollMasks();
  }
}
function clearGrid() {
  renderedCount = 0;
  const itemsToRemove = grid.querySelectorAll(
    ".card, .games-divider, #sentinel-marker"
  );
  itemsToRemove.forEach((item) => item.remove());
}

function filterSortGames() {
  if (isGlobalSearchActive) {
    performGlobalSearch();
    return;
  }

  const query = input.value.toLowerCase();
  let filteredGames = allGames.filter((game) =>
    game.name.toLowerCase().includes(query)
  );

  if (currentFilter === "alphabetical") {
    filteredGames.sort((a, b) => a.name.localeCompare(b.name));
    currentFilteredList = filteredGames;
  } else {
    const featured = filteredGames.filter((g) => g.featured);
    const regular = filteredGames.filter((g) => !g.featured);

    currentFilteredList = [...featured];
    if (featured.length > 0 && regular.length > 0) {
      currentFilteredList.push({ isDivider: true });
    }
    currentFilteredList.push(...regular);
  }

  clearGrid();
  noResultsMessage.style.display =
    filteredGames.length === 0 && query !== "" ? "block" : "none";

  renderNextBatch();
  handleScrollMasks();
}

function loadImage(card) {
  if (card.classList.contains("loaded")) return;
  const imageUrl = card.dataset.src;

  if (!imageUrl) {
    card.style.setProperty("--bg-image", getRandomSoftBackground());
    card.classList.add("no-image-style", "loaded");
    return;
  }

  const img = new Image();
  img.src = imageUrl;
  img.onload = () => {
    card.style.setProperty("--bg-image", `url('${imageUrl}')`);
    card.classList.remove("no-image-style");
    card.classList.add("loaded");
  };
  img.onerror = () => {
    card.style.setProperty("--bg-image", getRandomSoftBackground());
    card.classList.add("no-image-style", "loaded");
  };
}

function setupObservers() {
  imageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadImage(entry.target);
          imageObserver.unobserve(entry.target);
        }
      });
    },
    { root: grid, rootMargin: "200px" }
  );

  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        renderNextBatch();
      }
    },
    { root: grid, rootMargin: "600px" }
  );
}

function createCardElement(game) {
  const card = document.createElement("div");
  card.className = game.featured ? "card featured" : "card";

  const isDirect = game.direct === true || game.sourceType === "frame";
  const isNowgg = game.nowgg === true;
  const isPrx = game.prx === true || game.sourceType === "proxy";

  let displayType = "LOCAL";
  if (isNowgg) displayType = "NGG";
  else if (isPrx) displayType = "PRX";
  else if (isDirect) displayType = "FRAME";

  card.dataset.name = game.name.toLowerCase();

  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = game.name;
  card.appendChild(name);

  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info-container";

  const icon = document.createElement("i");
  icon.className = game.sourceIcon || sourceSelectorIcon.className;
  infoContainer.appendChild(icon);

  const textStack = document.createElement("div");
  textStack.className = "card-info-text";

  if (isGlobalSearchActive && game.sourceName) {
    const sourceLabel = document.createElement("div");
    sourceLabel.className = "card-source-name";
    sourceLabel.textContent = game.sourceName;
    textStack.appendChild(sourceLabel);
  } else {
    const typeLabel = document.createElement("div");
    typeLabel.className = "card-type";
    typeLabel.textContent = displayType;
    textStack.appendChild(typeLabel);
  }

  infoContainer.appendChild(textStack);
  card.appendChild(infoContainer);

  card.addEventListener("click", () => {
    playGame(game.url, isDirect, game.name, isNowgg, isPrx);
  });

  const imageUrl = game.cover;
  if (imageUrl && imageUrl !== "null" && imageUrl !== "") {
    card.dataset.src = imageUrl;
  }

  return card;
}

function renderNextBatch() {
  if (renderedCount >= currentFilteredList.length) return;

  const fragment = document.createDocumentFragment();
  const nextBatch = currentFilteredList.slice(
    renderedCount,
    renderedCount + BATCH_SIZE
  );

  nextBatch.forEach((item) => {
    if (item.isDivider) {
      const div = document.createElement("div");
      div.className = "games-divider";
      fragment.appendChild(div);
    } else {
      const card = createCardElement(item);
      fragment.appendChild(card);
      imageObserver.observe(card);
    }
  });

  sentinel.remove();
  grid.appendChild(fragment);
  renderedCount += nextBatch.length;

  if (renderedCount < currentFilteredList.length) {
    sentinel.id = "sentinel-marker";
    grid.appendChild(sentinel);
    scrollObserver.observe(sentinel);
  }
}

async function loadGames() {
  if (!currentSourceData || isGlobalSearchActive) return;
  const gamesURL = currentSourceData.File;
  const defaultListType = currentSourceData.Type;

  input.value = "";
  setSearchPlaceholder();

  if (currentSourceData.Description) {
    listDescription.innerHTML = currentSourceData.Description;
    listDescription.style.display = "block";
  } else {
    listDescription.style.display = "none";
  }

  try {
    const res = await fetch(gamesURL);
    if (!res.ok) throw new Error(`error loading list`);
    let loadedGames = await res.json();

    allGames = loadedGames.map((game) => {
      // Fix URL if it starts with /games/ or /gameimg/
      if (
        game.url &&
        (game.url.startsWith("/games/") || game.url.startsWith("/gameimg/"))
      ) {
        game.url = BURLFULL + game.url;
      }

      // Fix Cover if it starts with /games/ or /gameimg/
      if (
        game.cover &&
        (game.cover.startsWith("/games/") || game.cover.startsWith("/gameimg/"))
      ) {
        game.cover = BURLFULL + game.cover;
      }

      // Existing IP replacement logic
      if (game.url && game.url.includes("{IP_BEGINNING}") && userIPPrefix) {
        game.url = game.url.replace("{IP_BEGINNING}", userIPPrefix);
      }

      if (game.direct === undefined) game.direct = defaultListType === "frame";
      if (game.prx === undefined) game.prx = defaultListType === "proxy";
      return game;
    });

    filterSortGames();
  } catch (err) {
    console.error(err);
  }
}
async function init() {
  try {
    await fetchUserIP();

    const response = await fetch("/asset/json/gamelists.json");
    const columnData = await response.json();
    sourceOptionsContainer.innerHTML = "";
    gameLists = [];

    const sortedKeys = Object.keys(columnData).sort((a, b) => {
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    sortedKeys.forEach((colKey) => {
      const colItems = columnData[colKey];
      if (!Array.isArray(colItems)) return;

      const columnDiv = document.createElement("div");
      columnDiv.className = "dropdown-column";
      sourceOptionsContainer.appendChild(columnDiv);

      colItems.forEach((item) => {
        if (!item) return;

        if (item.Type === "divider") {
          const divider = document.createElement("div");
          divider.className = "dropdown-divider";
          columnDiv.appendChild(divider);
        } else if (item.Name) {
          const globalIndex = gameLists.length;
          gameLists.push(item);

          const opt = document.createElement("div");
          opt.className = "option";
          opt.dataset.index = globalIndex;
          opt.innerHTML = `<i class="${item.Icon || "ri-file-line"}"></i>${
            item.Name
          }`;
          columnDiv.appendChild(opt);
        }
      });
    });

    if (gameLists.length > 0) {
      currentSourceData = gameLists[0];
      sourceSelectorText.textContent = currentSourceData.Name;
      sourceSelectorIcon.className = currentSourceData.Icon || "ri-file-line";
      setupObservers();
      loadGames();
    }
  } catch (e) {
    console.error("Failed to init source dropdown:", e);
  }
}

function animateTextChange(text) {
  loadingMessage.classList.remove("fade-slide-in");
  loadingMessage.classList.add("fade-slide-out");
  const onEnd = () => {
    loadingMessage.textContent = text;
    loadingMessage.classList.remove("fade-slide-out");
    loadingMessage.classList.add("fade-slide-in");
    loadingMessage.removeEventListener("animationend", onEnd);
  };
  loadingMessage.addEventListener("animationend", onEnd, { once: true });
}

function exitGame() {
  gameOverlay.classList.remove("view-active");
  iframe.src = "about:blank";
  iframe.style.display = "none";
  iframe.style.opacity = "0";
  buttonPanel.style.display = "none";
  loadingContainer.style.display = "none";
  clearTimeout(switchTextTimeout);
  requestAnimationFrame(() => {
    browserView.classList.remove("view-hidden");
    setTimeout(() => {
      gameOverlay.style.display = "none";
    }, 300);
  });
}

function finishLoading() {
  loadingContainer.classList.add("fade-out");
  const onEnd = () => {
    loadingContainer.style.display = "none";
    requestAnimationFrame(() => {
      iframe.style.display = "block";
      buttonPanel.style.display = "flex";
      iframe.style.opacity = 1;
      iframe.focus();
    });
    loadingContainer.removeEventListener("animationend", onEnd);
  };
  loadingContainer.addEventListener("animationend", onEnd, { once: true });
}

async function playGame(url, isDirectLoad, gameName, isNowgg, isPrx) {
  const isMissingFreebuisnessFile = (text) =>
    typeof text === "string" &&
    text.includes("Couldn't find the requested file") &&
    text.includes("freebuisness/html");
  const isNotFoundDocument = (text) =>
    typeof text === "string" &&
    text.includes("<meta name=\"color-scheme\" content=\"light dark\">") &&
    text.includes("<pre") &&
    text.includes("Not found");

  const renderBrokenGameMessage = () => {
    const brokenHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#1d2a44,#0e1526);font-family:Inter,system-ui,sans-serif;color:#e8f0ff}
      .card{max-width:680px;margin:24px;padding:28px;border-radius:18px;background:rgba(255,255,255,.06);backdrop-filter:blur(8px);box-shadow:0 10px 40px rgba(0,0,0,.35);text-align:center}
      .emoji{font-size:34px;margin-bottom:12px}.title{font-size:24px;font-weight:700}.sub{opacity:.85;margin-top:10px}
    </style></head><body><div class="card"><div class="emoji">⚡</div><div class="title">This game is currently broken and we're working on fixing it :)</div><div class="sub">Please try another game for now.</div></div></body></html>`;
    iframe.contentDocument.open();
    iframe.contentDocument.write(brokenHtml);
    iframe.contentDocument.close();
    clearTimeout(switchTextTimeout);
    finishLoading();
  };

  gameOverlay.style.display = "block";
  void gameOverlay.offsetWidth;
  loadingMessage.textContent = "LOADING..";
  loadingMessage.classList.remove("fade-slide-out", "fade-slide-in");
  iframe.src = "about:blank";
  iframe.style.display = "none";
  buttonPanel.style.display = "none";
  loadingContainer.style.display = "block";
  loadingContainer.classList.remove("fade-out");
  requestAnimationFrame(() => {
    browserView.classList.add("view-hidden");
    gameOverlay.classList.add("view-active");
  });

  setTimeout(async () => {
    try {
      if (isDirectLoad || isPrx || isNowgg) {
        let finalGameUrl = url;
        if (isPrx && !isNowgg) {
          finalGameUrl = `/embed.html?url=${encodeURIComponent(finalGameUrl)}`;
        }
        if (
          isDirectLoad &&
          typeof finalGameUrl === "string" &&
          finalGameUrl.includes("freebuisness/html")
        ) {
          try {
            const precheck = await fetch(finalGameUrl, { cache: "no-store" });
            const text = await precheck.text();
            if (isMissingFreebuisnessFile(text)) {
              renderBrokenGameMessage();
              return;
            }
            iframe.contentDocument.open();
            iframe.contentDocument.write(text);
            iframe.contentDocument.close();
            clearTimeout(switchTextTimeout);
            finishLoading();
            return;
          } catch (e) {}
        }
        iframe.onload = () => {
          try {
            const docText =
              iframe.contentDocument?.documentElement?.innerHTML || "";
            if (isNotFoundDocument(docText)) {
              exitGame();
              showGameUnavailablePopup(gameName || "This game");
              return;
            }
          } catch (e) {}
          clearTimeout(switchTextTimeout);
          finishLoading();
        };
        iframe.src = finalGameUrl;
        switchTextTimeout = setTimeout(
          () => animateTextChange("STILL LOADING.."),
          4000
        );
        return;
      }
      try {
        const response = await fetch(url + "?t=" + Date.now());
        if (!response.ok) throw new Error("CORS or 404");
        const html = await response.text();
        if (isMissingFreebuisnessFile(html) || isNotFoundDocument(html)) {
          exitGame();
          showGameUnavailablePopup(gameName || "This game");
          return;
        }
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        setTimeout(finishLoading, 800);
      } catch (fetchError) {
        iframe.onload = () => {
          clearTimeout(switchTextTimeout);
          finishLoading();
        };
        iframe.src = url;
      }
    } catch (error) {
      loadingMessage.textContent = `ERROR: ${error.message}`;
      setTimeout(exitGame, 3000);
    }
  }, 100);
}

document.addEventListener("mousedown", (e) => {
  if (
    gameOverlay.classList.contains("view-active") &&
    !e.target.closest("#button-panel")
  ) {
    setTimeout(() => iframe.focus(), 10);
  }
});

fullscreenBtn.addEventListener("click", () => {
  if (iframe.requestFullscreen) iframe.requestFullscreen();
  else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
  setTimeout(() => iframe.focus(), 100);
});

backBtn.addEventListener("click", exitGame);

function closeAllDropdowns() {
  dropdowns.forEach((wrapper) => {
    wrapper.classList.remove("open");
    const chev = wrapper.querySelector(".ri-arrow-up-s-line");
    if (chev) {
      chev.classList.remove("ri-arrow-up-s-line");
      chev.classList.add("ri-arrow-down-s-line");
    }
  });
  backdrop.classList.remove("active");
}

input.addEventListener("input", runSearchDebounced);

globalSearchBtn.addEventListener("click", () => {
  isGlobalSearchActive = !isGlobalSearchActive;

  globalSearchBtn.classList.toggle("active", isGlobalSearchActive);
  sourceDropdownWrapper.classList.toggle(
    "searching-mode",
    isGlobalSearchActive
  );

  if (isGlobalSearchActive) {
    listDescription.style.display = "none";
    input.value = "";
    grid.classList.add("fade-games");
    setTimeout(() => {
      clearGrid();
      setSearchPlaceholder();
      input.focus();
      grid.classList.remove("fade-games");
    }, 400);
  } else {
    grid.classList.add("fade-games");
    setTimeout(() => {
      clearGrid();
      loadGames();
      setSearchPlaceholder();
      input.focus();
      grid.classList.remove("fade-games");
    }, 400);
  }
});

filterDropdownIcon.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpening = !filterDropdownWrapper.classList.contains("open");
  closeAllDropdowns();
  if (isOpening) {
    filterDropdownWrapper.classList.add("open");
    backdrop.classList.add("active");
  }
});

dropdowns.forEach((wrapper) => {
  const menu = wrapper.querySelector(".dropdown-menu");
  const options = wrapper.querySelector(".dropdown-options");
  if (menu) {
    menu.addEventListener("click", (e) => {
      if (wrapper.classList.contains("searching-mode")) return;

      e.stopPropagation();
      const isOpening = !wrapper.classList.contains("open");
      closeAllDropdowns();
      if (isOpening) {
        wrapper.classList.add("open");
        backdrop.classList.add("active");
        const chev = menu.querySelector(".ri-arrow-down-s-line");
        if (chev) {
          chev.classList.remove("ri-arrow-down-s-line");
          chev.classList.add("ri-arrow-up-s-line");
        }
      }
    });
  }
  if (!options) return;
  options.addEventListener("click", (e) => {
    const opt = e.target.closest(".option");
    if (opt) {
      if (wrapper === sourceDropdownWrapper) {
        const index = opt.dataset.index;
        const listData = gameLists[index];
        if (listData && currentSourceData !== listData) {
          currentSourceData = listData;
          sourceSelectorText.textContent = listData.Name;
          sourceSelectorIcon.className = listData.Icon || "ri-file-line";
          loadGames();
        }
      } else if (wrapper === filterDropdownWrapper) {
        const value = opt.dataset.value;
        if (currentFilter !== value) {
          currentFilter = value;
          filterSortGames();
        }
      }
      closeAllDropdowns();
    }
  });
});

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".dropdown-wrapper") &&
    !e.target.closest(".search-bar")
  ) {
    closeAllDropdowns();
  }
});

backdrop.addEventListener("click", closeAllDropdowns);
grid.addEventListener("scroll", handleScrollMasks);
new ResizeObserver(handleScrollMasks).observe(grid);

init();
