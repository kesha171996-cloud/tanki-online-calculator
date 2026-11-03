/* Tanki Online: one-click category image picker + automatic module photos.
   Add AFTER app.js. Works with existing data and calculations. */
(() => {
  'use strict';
  const data = window.TANKI_CALC_DATA;
  const imageMap = window.TANKI_IMAGE_MAP || {};
  const tabs = document.getElementById('category-tabs');
  const select = document.getElementById('item-select');
  const add = document.getElementById('add-item');
  const oldPicker = document.querySelector('.shop-picker');
  if (!data?.items || !tabs || !select || !add || !oldPicker) return;

  const css = document.createElement('style');
  css.textContent = `
    .shop-picker { display: none !important; }
    .photo-category-panel[hidden] { display: none !important; }
    .photo-category-panel { margin-top: 13px; padding: 15px; border: 1px solid #38313a;
      border-radius: 15px; background: var(--panel, #17141a); position: relative; }
    .photo-category-head { display:flex; align-items:center; justify-content:space-between;
      gap:10px; margin-bottom: 13px; color: var(--text, #eee); font-weight: 700; }
    .photo-category-close { background:transparent; border:1px solid #655c61;
      border-radius:9px; color:inherit; padding:8px 12px; cursor:pointer; }
    .photo-category-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr));
      gap:10px; max-height: min(58vh, 450px); overflow:auto; overscroll-behavior:contain; }
    .photo-choice { display:flex; align-items:center; gap:11px; padding:10px;
      min-width:0; text-align:left; color:var(--text, #fff); border:1px solid #4a3c3b;
      border-radius:11px; background:var(--bg-soft, #151015); cursor:pointer;
      font:inherit; transition:border-color .15s, background .15s; }
    .photo-choice:hover, .photo-choice:focus-visible { border-color:var(--accent, #f9a21a); background:#35271c; }
    .photo-choice img { width:56px; height:56px; min-width:56px; border-radius:9px;
      background:#252d3b; object-fit:contain; }
    .photo-choice span { overflow-wrap:anywhere; line-height:1.25; font-size:14px; font-weight:600; }
    .photo-choice:disabled { opacity:.52; cursor:default; }
    .category-tab { touch-action:manipulation; }
    @media (max-width: 600px) {
      .category-tabs { display:flex; flex-wrap:wrap; gap:7px; }
      .category-tab { flex:1 1 auto; min-width:0; }
      .photo-category-panel { padding:10px; margin-top:10px; }
      .photo-category-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px;
        max-height: min(56vh, 420px); }
      .photo-choice { padding:8px; gap:6px; flex-direction:column; align-items:center; text-align:center; }
      .photo-choice img { width:72px; height:72px; min-width:0; max-width:100%; }
      .photo-choice span { font-size:12px; }
    }
    @media (max-width: 350px) { .photo-category-grid { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(css);

  const panel = document.createElement('section');
  panel.className = 'photo-category-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Выбор предмета по фотографии');
  panel.innerHTML = '<div class="photo-category-head"><span class="photo-category-title"></span><button type="button" class="photo-category-close" aria-label="Закрыть список">✕ Закрыть</button></div><div class="photo-category-grid"></div>';
  tabs.insertAdjacentElement('afterend', panel);
  const grid = panel.querySelector('.photo-category-grid');
  const title = panel.querySelector('.photo-category-title');
  let openCategory = null;

  // All photos are expected directly inside images/, not a second private folder.
  const extensions = ['.png', '.jpg', '.jpeg', '.webp'];
  // Optional: add explicit links if an uploaded filename differs from the item name.
  const protectionOverrides = {
    // 'Название модуля в калькуляторе': 'Название файла в images.png'
  };
  const fileCache = new Map();
  const normalize = s => String(s || '').trim();
  const basename = s => normalize(s).replace(/\\/g, '/').split('/').pop();
  const cleanStem = s => basename(s).replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const imageUrl = name => 'images/' + encodeURIComponent(name);
  const svgPlaceholder = name => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="14" fill="#283044"/><text x="60" y="72" font-size="42" font-family="Arial" fill="#aeb5c5" text-anchor="middle">${String(name).slice(0, 1).replace(/[<&>"']/g, '')}</text></svg>`
  );

  const moduleByName = new Map();
  Object.entries(data.items).forEach(([display, item]) => {
    if ((item.kind === 'module' || item.category === 'Модули') && !moduleByName.has(item.name)) {
      moduleByName.set(item.name, item);
    }
  });

  function candidates(item) {
    const result = [];
    const seen = new Set();
    const push = (name) => {
      name = basename(name);
      if (!name || name === '.' || name === '..') return;
      const key = name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); result.push(name); }
    };
    const stems = [normalize(item.name), cleanStem(item.img)];
    const mapCandidates = [protectionOverrides[item.name], imageMap[item.img], imageMap[item.name], imageMap[cleanStem(item.img)]];
    mapCandidates.forEach(push);
    for (const stem of stems) {
      if (!stem) continue;
      for (const ext of extensions) push(stem + ext);
    }
    // For protection/modular items, use a generic photo only as a last resort.
    if (item.kind === 'module' || item.category === 'Модули') {
      push(imageMap['Защита']);
      for (const ext of extensions) push('Защита' + ext);
      push(imageMap['Любой резист'] || 'Любой резист.png');
    } else {
      push(imageMap[item.img]);
    }
    return result;
  }

  function exists(url) {
    if (!fileCache.has(url)) {
      fileCache.set(url, new Promise(resolve => {
        const test = new Image();
        test.onload = () => resolve(true);
        test.onerror = () => resolve(false);
        test.src = url;
      }));
    }
    return fileCache.get(url);
  }

  async function loadPhoto(img, item) {
    if (!img || !item || img.dataset.tankiFixed === '1') return;
    // Never overwrite a visitor's custom uploaded photo.
    if (img.src.startsWith('data:image/') && !img.src.startsWith('data:image/svg+xml')) return;
    img.dataset.tankiFixed = '1';
    const photos = candidates(item);
    for (const filename of photos) {
      const url = imageUrl(filename);
      if (!img.isConnected) return;
      if (await exists(url)) { img.onerror = null; img.src = url; return; }
    }
    if (img.isConnected) {
      img.onerror = null;
      img.src = svgPlaceholder(item.name);
    }
  }

  function updateModulesOnPage() {
    document.querySelectorAll('.card-image-wrap img, #shop-preview img').forEach(img => {
      const item = moduleByName.get(img.alt);
      if (item) loadPhoto(img, item);
    });
  }
  const observer = new MutationObserver(updateModulesOnPage);
  observer.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  updateModulesOnPage();

  function renderChoices(category) {
    title.textContent = category + ' — выбери предмет';
    grid.replaceChildren();
    for (const display of data.items_by_cat[category] || []) {
      const item = data.items[display];
      if (!item) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-choice';
      const img = document.createElement('img');
      img.alt = item.name;
      img.loading = 'lazy';
      img.src = svgPlaceholder(item.name);
      const label = document.createElement('span');
      label.textContent = item.name;
      button.append(img, label);
      // Exact current state check comes from the original Add button.
      button.addEventListener('click', () => {
        select.value = display;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (!add.disabled) add.click();
        panel.hidden = true;
        openCategory = null;
      });
      grid.append(button);
      loadPhoto(img, item);
    }
    grid.scrollTop = 0;
  }

  // Original app updates categories and native select first; then we show a photo grid.
  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button || !tabs.contains(button)) return;
    const category = button.dataset.category;
    if (!panel.hidden && openCategory === category) {
      panel.hidden = true;
      openCategory = null;
      return;
    }
    openCategory = category;
    renderChoices(category);
    panel.hidden = false;
  });
  panel.querySelector('.photo-category-close').addEventListener('click', () => {
    panel.hidden = true;
    openCategory = null;
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !panel.contains(event.target) && !tabs.contains(event.target)) {
      panel.hidden = true;
      openCategory = null;
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      openCategory = null;
      tabs.querySelector('.category-tab.active')?.focus();
    }
  });
})();
