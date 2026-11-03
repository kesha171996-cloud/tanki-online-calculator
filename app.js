(() => {
  "use strict";

  const DATA = window.TANKI_CALC_DATA;
  const INITIAL = window.TANKI_INITIAL_STATE || { discount: 0, theme: "none", cards: [] };
  const IMAGE_MAP = window.TANKI_IMAGE_MAP || {};
  if (!DATA || !DATA.items) {
    document.body.innerHTML = "<p style='padding:2rem;color:white'>Не удалось загрузить данные калькулятора. Проверь, что все файлы сайта загружены.</p>";
    return;
  }

  const STORAGE_KEY = "sw-kesha-tanki-calculator-v1";
  const items = DATA.items;
  const cardsByCategory = DATA.items_by_cat;
  const categories = DATA.category_order;
  const uploadedPhotos = Object.create(null); // user photos exist only in this browser tab session
  let activeCategory = categories[0];
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.trunc(Number(value) || 0)));
  const newId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  function normalizeCard(source) {
    let display = source && source.item;
    if (display === "Дроны · Любой дрон") display = "Дроны · Механик";
    if (!items[display]) return null;
    const item = items[display];
    const cur = clamp(source.cur, 0, item.max_pos);
    const tgt = Math.max(cur, clamp(source.tgt == null ? item.max_pos : source.tgt, 0, item.max_pos));
    return {
      id: source.id || newId(), item: display, cur, tgt,
      custom_on: Boolean(source.custom_on),
      custom_disc: source.custom_disc == null ? null : clamp(source.custom_disc, 0, 100),
    };
  }

  function normalizeState(source) {
    source = source && typeof source === "object" ? source : {};
    const sourceCards = Array.isArray(source.cards) ? source.cards : [];
    const seen = new Set();
    const cards = [];
    for (const raw of sourceCards) {
      const card = normalizeCard(raw || {});
      if (!card || seen.has(card.item)) continue;
      seen.add(card.item);
      cards.push(card);
    }
    const theme = ["none", "1", "2", "3", "5"].includes(String(source.theme)) ? String(source.theme) : "none";
    return { discount: clamp(source.discount, 0, 50), theme, cards };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn("Не удалось прочитать локальные настройки:", error);
    }
    return normalizeState(INITIAL);
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        discount: state.discount,
        theme: state.theme,
        cards: state.cards.map(({ item, cur, tgt, custom_on, custom_disc }) => ({ item, cur, tgt, custom_on, custom_disc })),
      }));
    } catch (error) {
      showToast("Браузер не смог сохранить настройки. Скачай JSON-файл.");
      console.warn("Не удалось сохранить локальные настройки:", error);
    }
  }

  function formatNumber(value) {
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  // Повторяет Python round() для неотрицательных чисел: половины округляются к чётному.
  function pythonRound(value) {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (fraction < 0.5) return lower;
    if (fraction > 0.5) return lower + 1;
    return lower % 2 === 0 ? lower : lower + 1;
  }

  function costBetween(priceList, from, to) {
    let total = 0;
    for (let i = from; i < to; i += 1) total += Number(priceList[i] || 0);
    return total;
  }

  function applyDiscount(raw, discount) {
    return pythonRound(raw * (100 - discount) / 100);
  }

  function mkLabel(item, position) {
    if (position <= 0) return "МК1 · ур.0";
    let start = 0;
    const tables = item.tables || [];
    for (let i = 0; i < tables.length; i += 1) {
      const length = tables[i].length;
      if (position <= start + length) return `МК${i + 1} · ур.${position - start}`;
      start += length;
    }
    const last = tables[tables.length - 1] || [];
    return `МК${tables.length} · ур.${last.length}`;
  }

  function positionText(item, position) {
    if (item.kind === "mk") return mkLabel(item, position);
    if (item.kind === "module") return `шаг ${position} · ${DATA.module_base_percent + position}%`;
    return `ур. ${position}`;
  }

  function getImagePath(display) {
    const item = items[display];
    if (item.img && item.img.startsWith(DATA.image_prefix)) {
      const fallback = IMAGE_MAP["Любой резист"];
      return fallback ? `images/${encodeURI(fallback)}` : "";
    }
    const relative = IMAGE_MAP[item.img];
    return relative ? `images/${encodeURI(relative)}` : "";
  }

  function imageMarkup(display, cardId = null) {
    const item = items[display];
    if (!item) return "";
    const name = String(item.name || display);
    const uploaded = cardId && uploadedPhotos[cardId];
    const fallback = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="16" fill="#283044"/><text x="50" y="61" font-size="42" text-anchor="middle" fill="#9aa4b7" font-family="Arial">${name.slice(0,1)}</text></svg>`)}`;
    const paths = [];
    const add = (url) => {
      if (typeof url === "string" && url && !paths.includes(url)) paths.push(url);
    };
    const addFile = (filename) => add(`images/${encodeURIComponent(filename)}`);

    if (uploaded) {
      add(uploaded);
    } else {
      if (item.kind === "module") {
        // Подставляем индивидуальные фото ВСЕХ модулей по названию предмета.
        // Ничего не нужно перечислять вручную: "Гром" => "Гром (защита).png".
        const names = [
          name,
          String(display).split("·").pop(),
          typeof item.img === "string" && typeof DATA.image_prefix === "string" &&
            item.img.startsWith(DATA.image_prefix)
              ? item.img.slice(DATA.image_prefix.length) : ""
        ];
        const usedNames = new Set();
        for (const raw of names) {
          let base = String(raw || "")
            .replace(/^\s*(?:модули?|защита|резисты?)\s*[·:—-]\s*/i, "")
            .replace(/^\s*защита\s+(?:от\s+)?/i, "")
            .replace(/\s*\(\s*(?:защита|модуль|резист)\s*\)\s*$/i, "")
            .trim();
          if (!base || usedNames.has(base.toLowerCase())) continue;
          usedNames.add(base.toLowerCase());
          const variants = [base];
          // В названии предмета "Гаусс", а на GitHub может быть "Гаус".
          if (/^гаусс$/i.test(base)) variants.push("Гаус");
          if (/^гаус$/i.test(base)) variants.push("Гаусс");
          for (const variant of variants) {
            addFile(`${variant} (защита).png`);
            addFile(`${variant} (Защита).png`);
            addFile(`${variant}.png`);
          }
        }
        // Дополнительный путь из image_map.js (включая Броненосца).
        const mapped = IMAGE_MAP[item.img];
        if (mapped) add(`images/${encodeURI(mapped)}`);
        // Старое изображение используем только если индивидуальные не найдены.
        add(getImagePath(display));
      } else {
        add(getImagePath(display));
      }
    }

    const src = paths.shift() || fallback;
    const rest = escapeHtml(JSON.stringify(paths));
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" data-next-images='${rest}' data-fallback="${fallback}" onerror="const a=JSON.parse(this.dataset.nextImages||'[]');if(a.length){this.dataset.nextImages=JSON.stringify(a.slice(1));this.src=a[0]}else{this.onerror=null;this.src=this.dataset.fallback}">`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function effectiveDiscount(card) {
    return card.custom_on ? clamp(card.custom_disc == null ? state.discount : card.custom_disc, 0, 100) : state.discount;
  }

  function resultFor(card) {
    const item = items[card.item];
    const current = clamp(card.cur, 0, item.max_pos);
    const target = Math.max(current, clamp(card.tgt, 0, item.max_pos));
    const raw = costBetween(item.prices, current, target);
    const discount = effectiveDiscount(card);
    const total = applyDiscount(raw, discount);
    const currentPercent = item.kind === "module" ? DATA.module_base_percent + current : null;
    const targetPercent = item.kind === "module" ? DATA.module_base_percent + target : null;
    let info = "Прокачка не нужна";
    if (target > current) {
      info = currentPercent !== null
        ? `${currentPercent}% → ${targetPercent}% (+${targetPercent - currentPercent}%)`
        : `+${target - current} ур.`;
    }
    return { raw, total, discount, saving: raw - total, info, current, target };
  }

  function applyTheme() {
    const themes = {
      none: { bg: "#0d0f14", bgSoft: "#10131a", panel: "#171b25", accent: "#5b8cff", accent2: "#4673e0", gold: "#ffc857", green: "#4ade80", text: "#e8ebf2", muted: "#8b93a7" },
      "1": { bg: "#08080a", bgSoft: "#0e0e10", panel: "#121214", accent: "#d4af5a", accent2: "#b8942f", gold: "#e8c877", green: "#e0c070", text: "#ecd9a8", muted: "#a89870" },
      "2": { bg: "#0f1218", bgSoft: "#0c0e13", panel: "#14161d", accent: "#ffb52e", accent2: "#e09a10", gold: "#ffc24a", green: "#ffd36b", text: "#f4efe6", muted: "#a39a8a" },
      "3": { bg: "#0a0706", bgSoft: "#0d0908", panel: "#140e0b", accent: "#ff8a1f", accent2: "#e06f0a", gold: "#ffb347", green: "#ffb347", text: "#ffe7cc", muted: "#b59a85" },
      "5": { bg: "#0a0a0a", bgSoft: "#0e0e0d", panel: "#111111", accent: "#d4b062", accent2: "#b8942f", gold: "#e6c36e", green: "#e6c36e", text: "#f0dfae", muted: "#a8966a" },
    };
    const t = themes[state.theme] || themes.none;
    const root = document.documentElement;
    root.style.setProperty("--bg", t.bg);
    root.style.setProperty("--bg-soft", t.bgSoft);
    root.style.setProperty("--panel", t.panel);
    root.style.setProperty("--accent", t.accent);
    root.style.setProperty("--accent-2", t.accent2);
    root.style.setProperty("--gold", t.gold);
    root.style.setProperty("--green", t.green);
    root.style.setProperty("--text", t.text);
    root.style.setProperty("--muted", t.muted);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function renderCategoryTabs() {
    const root = $("#category-tabs");
    root.innerHTML = categories.map((category) => `
      <button class="category-tab ${category === activeCategory ? "active" : ""}" type="button" role="tab" aria-selected="${category === activeCategory}" data-category="${escapeHtml(category)}">
        ${DATA.cat_icons[category]} ${escapeHtml(category)}
      </button>`).join("");
    root.querySelectorAll("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        renderShop();
      });
    });
  }

  function renderShop() {
    renderCategoryTabs();
    const select = $("#item-select");
    const options = cardsByCategory[activeCategory] || [];
    const current = select.value;
    select.innerHTML = options.map((display) => `<option value="${escapeHtml(display)}">${escapeHtml(items[display].name)}</option>`).join("");
    if (options.includes(current)) select.value = current;
    updateShopPreview();
  }

  function updateShopPreview() {
    const display = $("#item-select").value;
    const preview = $("#shop-preview");
    if (!display) { preview.innerHTML = ""; return; }
    preview.innerHTML = imageMarkup(display);
    const already = state.cards.some((card) => card.item === display);
    const button = $("#add-item");
    button.disabled = already;
    button.textContent = already ? "Уже добавлено" : "＋ Добавить в расчёт";
  }

  function renderCard(card) {
    const item = items[card.item];
    const categoryColor = DATA.cat_colors[item.category] || "var(--accent)";
    const r = resultFor(card);
    const customDiscount = card.custom_disc == null ? state.discount : card.custom_disc;
    return `
      <article class="item-card" data-card="${card.id}" style="--category-color:${categoryColor}">
        <div class="card-head">
          <div class="card-image-wrap" data-photo-view="${card.id}">${imageMarkup(card.item, card.id)}</div>
          <div><div class="card-title">${DATA.cat_icons[item.category]} ${escapeHtml(item.name)}</div><div class="card-category">${escapeHtml(item.category)} · ${item.max_pos} шагов прокачки</div></div>
          <button class="remove-button" type="button" data-remove="${card.id}">✕ Убрать</button>
        </div>
        <div class="level-controls">
          <div class="level-control">
            <div class="level-label-row"><label for="cur-${card.id}">Сейчас</label><output data-current-label="${card.id}">${escapeHtml(positionText(item, card.cur))}</output></div>
            <input id="cur-${card.id}" class="level-slider current-slider" type="range" min="0" max="${item.max_pos}" step="1" value="${card.cur}" data-current="${card.id}">
          </div>
          <div class="level-control">
            <div class="level-label-row"><label for="tgt-${card.id}">Хочу</label><output data-target-label="${card.id}">${escapeHtml(positionText(item, r.target))}</output></div>
            <input id="tgt-${card.id}" class="level-slider target-slider" type="range" min="${card.cur}" max="${item.max_pos}" step="1" value="${r.target}" data-target="${card.id}">
          </div>
        </div>
        <div class="card-options">
          <label class="custom-discount-toggle"><input type="checkbox" class="custom-toggle" data-custom-toggle="${card.id}" ${card.custom_on ? "checked" : ""}> Своя скидка</label>
          <div class="custom-disc-wrap" data-custom-wrap="${card.id}" ${card.custom_on ? "" : "hidden"}>
            <input aria-label="Своя скидка для ${escapeHtml(item.name)}" class="custom-discount-input" type="number" min="0" max="100" step="1" value="${customDiscount}" data-custom-discount="${card.id}">
          </div>
          <label class="photo-label">📷 Загрузить фото для себя<input class="photo-input" type="file" accept="image/png,image/jpeg,image/webp" data-photo="${card.id}"></label>
        </div>
        <div class="price-row">
          <div class="price-box"><span>Без скидки</span><strong data-raw="${card.id}">${formatNumber(r.raw)}</strong></div>
          <div class="price-box pay"><span>К оплате</span><strong data-total="${card.id}">${formatNumber(r.total)}</strong></div>
          <div class="price-box save"><span>Экономия</span><strong data-saving="${card.id}">${formatNumber(r.saving)}</strong></div>
          <div class="price-info"><strong data-info="${card.id}">${escapeHtml(r.info)}</strong><span data-discount-info="${card.id}">${r.discount > 0 && r.raw > 0 ? `Скидка ${r.discount}% · было ${formatNumber(r.raw)}` : ""}</span></div>
        </div>
      </article>`;
  }

  function renderCards() {
    const root = $("#cards-list");
    root.innerHTML = state.cards.map(renderCard).join("");
    $("#empty-state").hidden = state.cards.length > 0;
    $("#item-count").textContent = String(state.cards.length);
    updateSummary();
    updateShopPreview();
  }

  function updateCardView(card) {
    const item = items[card.item];
    const r = resultFor(card);
    const id = card.id;
    const curSlider = $(`[data-current="${id}"]`);
    const tgtSlider = $(`[data-target="${id}"]`);
    if (curSlider) curSlider.value = String(card.cur);
    if (tgtSlider) {
      tgtSlider.min = String(card.cur);
      tgtSlider.value = String(r.target);
    }
    const curLabel = $(`[data-current-label="${id}"]`);
    const tgtLabel = $(`[data-target-label="${id}"]`);
    if (curLabel) curLabel.textContent = positionText(item, card.cur);
    if (tgtLabel) tgtLabel.textContent = positionText(item, r.target);
    const setText = (selector, text) => { const el = $(selector.replace("{id}", id)); if (el) el.textContent = text; };
    setText(`[data-raw="{id}"]`, formatNumber(r.raw));
    setText(`[data-total="{id}"]`, formatNumber(r.total));
    setText(`[data-saving="{id}"]`, formatNumber(r.saving));
    setText(`[data-info="{id}"]`, r.info);
    setText(`[data-discount-info="{id}"]`, r.discount > 0 && r.raw > 0 ? `Скидка ${r.discount}% · было ${formatNumber(r.raw)}` : "");
  }

  function updateAllCardViews() {
    for (const card of state.cards) updateCardView(card);
    updateSummary();
  }

  function updateSummary() {
    let raw = 0;
    let total = 0;
    for (const card of state.cards) {
      const result = resultFor(card);
      raw += result.raw;
      total += result.total; // как в Python-версии: округление отдельно для каждого предмета
    }
    $("#summary-count").textContent = String(state.cards.length);
    $("#summary-raw").textContent = formatNumber(raw);
    $("#summary-saving").textContent = formatNumber(raw - total);
    $("#summary-total").textContent = formatNumber(total);
    $("#item-count").textContent = String(state.cards.length);
  }

  function syncHeader() {
    $("#global-discount").value = String(state.discount);
    $("#global-discount-label").textContent = `${state.discount}%`;
    $("#theme-select").value = state.theme;
    applyTheme();
  }

  function addItem() {
    const display = $("#item-select").value;
    if (!display || state.cards.some((card) => card.item === display)) return;
    const item = items[display];
    state.cards.push(normalizeCard({ item: display, cur: 0, tgt: item.max_pos }));
    saveState();
    renderCards();
    updateShopPreview();
    showToast(`${item.name} добавлен в расчёт`);
  }

  function removeItem(id) {
    const card = state.cards.find((entry) => entry.id === id);
    state.cards = state.cards.filter((entry) => entry.id !== id);
    delete uploadedPhotos[id];
    saveState();
    renderCards();
    if (card) showToast(`${items[card.item].name} удалён из списка`);
  }

  function exportSettings() {
    const payload = {
      discount: state.discount,
      theme: state.theme,
      cards: state.cards.map(({ item, cur, tgt, custom_on, custom_disc }) => ({ item, cur, tgt, custom_on, custom_disc })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tanki_online_calculator_settings.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Настройки сохранены в JSON-файл");
  }

  async function importSettings(file) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object" || !Array.isArray(raw.cards)) throw new Error("Неподходящий формат файла");
      state = normalizeState(raw);
      for (const key of Object.keys(uploadedPhotos)) delete uploadedPhotos[key];
      syncHeader();
      saveState();
      renderCards();
      showToast(`Настройки загружены · предметов: ${state.cards.length}`);
    } catch (error) {
      showToast(`Не удалось загрузить настройки: ${error.message}`);
    }
    $("#import-settings").value = "";
  }

  function handlePhotoUpload(id, file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      showToast("Поддерживаются PNG, JPG и WEBP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Файл больше 5 МБ. Выбери изображение поменьше.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const card = state.cards.find((c) => c.id === id);
      if (!card) return;
      uploadedPhotos[id] = String(reader.result);
      const view = $(`[data-photo-view="${id}"]`);
      if (view) view.innerHTML = imageMarkup(card.item, id);
      showToast("Фото добавлено для текущего сеанса браузера");
    };
    reader.onerror = () => showToast("Не удалось прочитать изображение");
    reader.readAsDataURL(file);
  }

  // Header controls
  $("#global-discount").addEventListener("input", (event) => {
    state.discount = clamp(event.target.value, 0, 50);
    $("#global-discount-label").textContent = `${state.discount}%`;
    updateAllCardViews();
    saveState();
  });
  $("#theme-select").addEventListener("change", (event) => {
    state.theme = event.target.value;
    applyTheme();
    saveState();
  });
  $("#item-select").addEventListener("change", updateShopPreview);
  $("#add-item").addEventListener("click", addItem);
  $("#clear-all").addEventListener("click", () => {
    if (!state.cards.length) return;
    if (!window.confirm("Убрать все предметы из списка?")) return;
    state.cards = [];
    for (const key of Object.keys(uploadedPhotos)) delete uploadedPhotos[key];
    saveState();
    renderCards();
    showToast("Список очищен");
  });
  $("#export-settings").addEventListener("click", exportSettings);
  $("#import-settings").addEventListener("change", (event) => importSettings(event.target.files[0]));

  // Dynamic card controls: update the result without rebuilding the slider while it is dragged.
  $("#cards-list").addEventListener("input", (event) => {
    const target = event.target;
    let card = null;
    if (target.matches("[data-current]")) {
      card = state.cards.find((entry) => entry.id === target.dataset.current);
      if (!card) return;
      card.cur = clamp(target.value, 0, items[card.item].max_pos);
      if (card.tgt < card.cur) card.tgt = card.cur;
      updateCardView(card);
      updateSummary();
      saveState();
    } else if (target.matches("[data-target]")) {
      card = state.cards.find((entry) => entry.id === target.dataset.target);
      if (!card) return;
      card.tgt = Math.max(card.cur, clamp(target.value, 0, items[card.item].max_pos));
      updateCardView(card);
      updateSummary();
      saveState();
    } else if (target.matches("[data-custom-discount]")) {
      card = state.cards.find((entry) => entry.id === target.dataset.customDiscount);
      if (!card) return;
      card.custom_disc = clamp(target.value, 0, 100);
      target.value = String(card.custom_disc);
      updateCardView(card);
      updateSummary();
      saveState();
    }
  });

  $("#cards-list").addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-custom-toggle]")) {
      const card = state.cards.find((entry) => entry.id === target.dataset.customToggle);
      if (!card) return;
      card.custom_on = target.checked;
      if (card.custom_on && card.custom_disc == null) card.custom_disc = state.discount;
      const wrap = $(`[data-custom-wrap="${card.id}"]`);
      if (wrap) {
        wrap.hidden = !card.custom_on;
        const input = $(`[data-custom-discount="${card.id}"]`);
        if (input) input.value = String(card.custom_disc == null ? state.discount : card.custom_disc);
      }
      updateCardView(card);
      updateSummary();
      saveState();
    } else if (target.matches("[data-photo]")) {
      handlePhotoUpload(target.dataset.photo, target.files[0]);
    }
  });

  $("#cards-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (button) removeItem(button.dataset.remove);
  });

  // Initial page
  syncHeader();
  renderShop();
  renderCards();
  saveState();
})();