/*
 * Tanki Online / SW_Kesha — галерея предметов по нажатию на категорию.
 * ВЕРСИЯ 3 (2026-11-04)
 * В index.html подключать ПОСЛЕ app.js:
 * <script src="site_fix.js?v=3" defer></script>
 *
 * Работает через уже существующие #category-tabs, #item-select и #add-item.
 * Не меняет формулы, сохранение, цены и исходный список предметов.
 */
(() => {
  'use strict';
  if (window.__tankiPhotoPickerV3) return;
  window.__tankiPhotoPickerV3 = true;

  function initialize() {
    const tabs = document.getElementById('category-tabs');
    const picker = document.querySelector('.shop-picker');
    const select = document.getElementById('item-select');
    const add = document.getElementById('add-item');
    if (!tabs || !picker || !select || !add) {
      console.warn('[Tanki photo picker] Не найдены стандартные элементы выбора.');
      return;
    }
    // Защита от двойного подключения.
    if (document.getElementById('tanki-photo-choices')) return;

    const style = document.createElement('style');
    style.textContent = `
      /* Старую строку убираем, только когда галерея готова и в select есть предметы. */
      html.tanki-photo-picker-ready .shop-section .shop-picker { display:none !important; }
      #tanki-photo-choices[hidden] { display:none !important; }
      #tanki-photo-choices { position:static; z-index:auto; box-sizing:border-box;
        margin-top:12px; padding:13px; border-radius:15px;
        border:1px solid #49404b; background:var(--panel,#161215);
        color:var(--text,#f7f4f1); }
      #tanki-photo-choices * { box-sizing:border-box; }
      .tanki-gallery-top { display:flex; align-items:center; justify-content:space-between;
        gap:10px; margin-bottom:12px; font-weight:750; }
      .tanki-gallery-close { background:transparent; border:1px solid #645663;
        color:inherit; border-radius:9px; padding:8px 12px; cursor:pointer; font:inherit; }
      .tanki-gallery-search { display:block; width:100%; min-width:0; margin:0 0 12px;
        border:1px solid #635461; color:inherit; background:rgba(70,62,75,.28);
        border-radius:10px; padding:11px 12px; font:inherit; font-size:16px; }
      .tanki-gallery-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(168px,1fr));
        gap:10px; max-height:min(55vh,500px); overflow:auto; overscroll-behavior:contain; }
      .tanki-gallery-card { display:flex; flex-direction:row; align-items:center; text-align:left;
        gap:10px; min-width:0; min-height:77px; width:100%; border:1px solid #554752;
        border-radius:12px; background:rgba(85,74,88,.19); color:inherit;
        font:inherit; font-weight:650; cursor:pointer; padding:9px; }
      .tanki-gallery-card:hover { border-color:#ffac35; background:rgba(255,166,40,.11); }
      .tanki-gallery-card:focus-visible, .tanki-gallery-close:focus-visible,
      .tanki-gallery-search:focus-visible { outline:2px solid #ffae3d; outline-offset:2px; }
      .tanki-gallery-card img { width:60px; height:60px; flex:0 0 60px;
        object-fit:contain; border-radius:9px; background:#232b3c; }
      .tanki-gallery-card span { min-width:0; overflow-wrap:anywhere; font-size:14px; line-height:1.3; }
      .tanki-gallery-message { padding:12px 4px; font-size:14px; opacity:.85; }
      @media (max-width:650px) {
        #tanki-photo-choices { padding:10px; margin-top:10px; }
        .tanki-gallery-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px;
          max-height:min(55vh,450px); }
        .tanki-gallery-card { min-height:122px; padding:8px 5px; display:flex;
          flex-direction:column; text-align:center; gap:6px; justify-content:flex-start; }
        .tanki-gallery-card img { width:72px; height:72px; flex:0 0 72px; max-width:100%; }
        .tanki-gallery-card span { font-size:12px; }
      }
    `;
    document.head.append(style);

    const panel = document.createElement('section');
    panel.id = 'tanki-photo-choices';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Выбор предметов по фотографиям');
    panel.innerHTML = `
      <div class="tanki-gallery-top">
        <span class="tanki-gallery-title">Выбери предмет</span>
        <button type="button" class="tanki-gallery-close">✕ Закрыть</button>
      </div>
      <input type="search" class="tanki-gallery-search" placeholder="Поиск по названию..." aria-label="Поиск предмета" autocomplete="off">
      <div class="tanki-gallery-grid"></div>`;
    // Панель в потоке страницы, непосредственно ПОД кнопками категорий.
    tabs.insertAdjacentElement('afterend', panel);
    const title = panel.querySelector('.tanki-gallery-title');
    const search = panel.querySelector('.tanki-gallery-search');
    const grid = panel.querySelector('.tanki-gallery-grid');
    let opened = '';
    let options = [];
    let drawVersion = 0;

    const normalize = x => String(x || '').normalize('NFKC').toLowerCase()
      .replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const isProtection = cat => /модул|защит|резист/i.test(cat);
    const imageExtensions = /\.(png|jpe?g|webp|gif)$/i;
    const fileName = x => String(x || '').replace(/\\/g,'/').split('/').pop();
    const urlFor = value => {
      if (!value || typeof value !== 'string') return '';
      if (/^(https?:|data:|blob:)/i.test(value)) return value;
      const path = value.replace(/^\.?\/?images\//i,'').replace(/^\/+/, '');
      return 'images/' + path.split('/').map(encodeURIComponent).join('/');
    };
    const placeholder = word => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
      '<rect width="120" height="120" rx="15" fill="#273047"/>' +
      '<text x="60" y="74" text-anchor="middle" font-size="48" fill="#f0f3fc" font-family="Arial">' +
      String(word || '?').slice(0,1).replace(/[<>&\"']/g,'') + '</text></svg>');

    function catalogInfo(option) {
      // Используем доступные данные проекта, но НЕ зависим от их наличия.
      const collections = [];
      try { if (typeof TANKI_CALC_DATA !== 'undefined') collections.push(TANKI_CALC_DATA); } catch (_) {}
      if (window.TANKI_CALC_DATA) collections.push(window.TANKI_CALC_DATA);
      for (const collection of collections) {
        const items = collection && (collection.items || collection.ITEMS);
        if (!items) continue;
        if (items[option.value]) return items[option.value];
        if (items[option.textContent.trim()]) return items[option.textContent.trim()];
        if (Array.isArray(items)) {
          const item = items.find(x => x && [x.id,x.key,x.name,x.title].includes(option.value));
          if (item) return item;
        }
      }
      return {};
    }
    function pictureMap() {
      try { if (typeof TANKI_IMAGE_MAP !== 'undefined') return TANKI_IMAGE_MAP; } catch (_) {}
      return window.TANKI_IMAGE_MAP || window.IMAGE_MAP || window.imageMap || {};
    }
    function imageCandidates(option, category) {
      const item = catalogInfo(option);
      const map = pictureMap();
      const name = option.textContent.trim();
      const keys = [option.value, name, item.name, item.title, item.img, item.image, item.image_key];
      const results = [], seen = new Set();
      function push(x) {
        if (typeof x !== 'string' || !x.trim()) return;
        const u = urlFor(x);
        if (!u || seen.has(u)) return;
        seen.add(u); results.push(u);
      }
      const protect = isProtection(category);
      if (protect) {
        // Не берём фото одноимённой ПУШКИ вместо защиты.
        const baseNames = [name, item.name, option.value].filter(x => typeof x === 'string');
        for (const base of baseNames) {
          const clean = base.replace(/^защита\s+/i, '').replace(/\s+защита$/i,'').trim();
          if (!clean) continue;
          for (const extension of ['png','jpg','webp']) {
            push(clean + ' (Защита).' + extension);
            push(clean + ' (защита).' + extension);
          }
          if (/гаусс/i.test(clean)) push('Гаус (Защита).png');
        }
      }
      for (const k of keys) {
        if (typeof k !== 'string') continue;
        const mapped = map[k];
        if (typeof mapped === 'string') push(mapped);
        if (imageExtensions.test(fileName(k))) push(k);
      }
      for (const k of [name, item.name, option.value]) {
        if (typeof k !== 'string' || !k.trim()) continue;
        for (const ext of ['png','webp','jpg','jpeg']) push(k.trim() + '.' + ext);
      }
      if (protect) push('Любой резист.png');
      return results.slice(0,35);
    }

    function setImage(img, option, category) {
      const candidates = imageCandidates(option, category);
      let i = 0;
      img.alt = option.textContent.trim();
      img.onerror = () => {
        if (!img.isConnected) return;
        if (i < candidates.length) img.src = candidates[i++];
        else { img.onerror = null; img.src = placeholder(option.textContent.trim()); }
      };
      img.onerror();
    }
    function choices() {
      return [...select.options].filter(o => !o.disabled && o.value !== '' && o.textContent.trim());
    }
    function ready() {
      document.documentElement.classList.toggle('tanki-photo-picker-ready', choices().length > 0);
    }
    function close() {
      panel.hidden = true;
      opened = '';
      search.value = '';
    }
    function draw() {
      const stamp = ++drawVersion;
      const q = normalize(search.value);
      grid.replaceChildren();
      let visible = 0;
      for (const opt of options) {
        const name = opt.textContent.trim();
        if (q && !normalize(name).includes(q)) continue;
        ++visible;
        const tile = document.createElement('button');
        tile.type = 'button'; tile.className = 'tanki-gallery-card';
        const img = document.createElement('img');
        img.loading = 'lazy'; img.decoding = 'async';
        const label = document.createElement('span'); label.textContent = name;
        tile.append(img, label);
        tile.addEventListener('click', () => {
          // Калькулятор сам добавляет предмет — не копируем его логику.
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          if (!add.disabled) {
            add.click();
            close();
          } else {
            const warn = grid.querySelector('.tanki-gallery-message');
            if (!warn) {
              const note = document.createElement('div');
              note.className = 'tanki-gallery-message';
              note.textContent = 'Этот предмет сейчас нельзя добавить. Выбери другой.';
              grid.prepend(note);
            }
          }
        });
        grid.append(tile);
        setImage(img, opt, opened);
      }
      if (!visible) {
        const note = document.createElement('div'); note.className = 'tanki-gallery-message';
        note.textContent = options.length ? 'Ничего не найдено' : 'Список предметов ещё не загрузился';
        grid.append(note);
      }
      if (stamp === drawVersion) grid.scrollTop = 0;
    }

    function openCategory(label) {
      ready();
      // Ждём, пока оригинальный обработчик categoryTabs обновит #item-select.
      const current = choices();
      if (!current.length) {
        close();
        document.documentElement.classList.remove('tanki-photo-picker-ready');
        return;
      }
      opened = label;
      options = current;
      title.textContent = label + ' — выбери предмет';
      search.value = '';
      panel.hidden = false;
      draw();
    }

    // Делегирование кликов: работает даже если app.js перерисовывает кнопки.
    tabs.addEventListener('click', event => {
      const tab = event.target.closest('button, [role="tab"], .category-tab');
      if (!tab || !tabs.contains(tab)) return;
      const label = tab.textContent.trim();
      const wasOpen = !panel.hidden && opened === label;
      // Очередь после стандартного обработчика app.js и обновления select.
      setTimeout(() => {
        if (wasOpen) close();
        else openCategory(label);
      }, 0);
    }, true);

    panel.querySelector('.tanki-gallery-close').addEventListener('click', close);
    search.addEventListener('input', draw);
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Enter') {
        const first = grid.querySelector('.tanki-gallery-card');
        if (first) { event.preventDefault(); first.click(); }
      }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !panel.contains(event.target) && !tabs.contains(event.target)) close();
    });
    new MutationObserver(() => {
      ready();
      if (!panel.hidden) { options = choices(); draw(); }
    }).observe(select, {childList:true, subtree:true});

    ready();
    // Важно: исходный интерфейс доступен, пока категории/option ещё не загрузились.
    setTimeout(ready, 200);
    console.info('[Tanki] Фотогалерея v3 подключена');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, {once:true});
  } else initialize();
})();
