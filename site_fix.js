/*
 * Tanki Online — прямой выбор предмета по фотографии.
 * Версия 2: не зависит от внутренних переменных app.js.
 * Подключение: <script src="site_fix.js" defer></script> после app.js.
 * Расчёты, кнопка добавления и localStorage остаются в оригинальном app.js.
 */
(() => {
  'use strict';

  function start() {
    const tabs = document.getElementById('category-tabs');
    const select = document.getElementById('item-select');
    const addButton = document.getElementById('add-item');
    const oldPicker = document.querySelector('.shop-picker');
    if (!tabs || !select || !addButton || !oldPicker || document.getElementById('tanki-photo-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      /* Скрываем старую нижнюю строку ТОЛЬКО после успешной подготовки нового выбора. */
      html.tanki-photos-ready .shop-picker { display:none !important; }
      #tanki-photo-panel[hidden] { display:none !important; }
      #tanki-photo-panel { box-sizing:border-box; position:relative; margin-top:12px;
        padding:14px; border:1px solid #423a41; border-radius:15px;
        background:var(--panel, #151113); color:var(--text, #fff); }
      #tanki-photo-panel * { box-sizing:border-box; }
      .tanki-photo-heading { display:flex; justify-content:space-between; align-items:center;
        gap:8px; margin-bottom:11px; font-size:15px; font-weight:700; }
      .tanki-photo-close { cursor:pointer; border:1px solid #65555d; border-radius:9px;
        background:transparent; color:inherit; padding:8px 11px; font:inherit; }
      .tanki-photo-search { box-sizing:border-box; display:block; width:100%; min-width:0;
        margin:0 0 12px; padding:10px 12px; border:1px solid #514650;
        border-radius:10px; background:var(--bg-soft, #19151b);
        color:var(--text, #fff); font:inherit; font-size:15px; }
      .tanki-photo-search::placeholder { color:#a39ba2; }
      .tanki-photo-search:focus-visible, .tanki-photo-close:focus-visible,
      .tanki-photo-item:focus-visible { outline:2px solid #ffaa2a; outline-offset:2px; }
      .tanki-photo-items { display:grid; grid-template-columns:repeat(auto-fill,minmax(175px,1fr));
        gap:10px; overflow-y:auto; max-height:min(55vh,470px); overscroll-behavior:contain; }
      .tanki-photo-item { cursor:pointer; display:flex; align-items:center; gap:11px;
        padding:9px; min-height:72px; min-width:0; width:100%; text-align:left;
        border:1px solid #4a3c42; border-radius:12px; color:inherit;
        background:var(--bg-soft, #1c171d); font:inherit; }
      .tanki-photo-item:hover { border-color:#ffac36; background:#34271c; }
      .tanki-photo-item img { display:block; width:60px; height:60px; flex:0 0 60px;
        border-radius:9px; background:#242c3b; object-fit:contain; }
      .tanki-photo-item span { font-size:14px; font-weight:650; line-height:1.3;
        min-width:0; overflow-wrap:anywhere; }
      .tanki-photo-empty { padding:16px 4px; color:#c9bcc2; font-size:14px; }
      #category-tabs button, #category-tabs [role="tab"] { touch-action:manipulation; }
      @media (max-width:650px) {
        #tanki-photo-panel { margin-top:10px; padding:10px; }
        .tanki-photo-items { grid-template-columns:repeat(2,minmax(0,1fr));
          gap:8px; max-height:min(55vh,420px); }
        .tanki-photo-item { min-height:120px; padding:8px 5px; flex-direction:column;
          align-items:center; justify-content:flex-start; text-align:center; gap:6px; }
        .tanki-photo-item img { width:72px; height:72px; flex:0 0 72px; max-width:100%; }
        .tanki-photo-item span { font-size:12px; }
      }
      @media (max-width:330px) { .tanki-photo-item img { width:58px; height:58px; flex-basis:58px; } }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = 'tanki-photo-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Выбор предмета с фотографией');
    panel.innerHTML = `<div class="tanki-photo-heading">
        <span id="tanki-photo-heading-text">Выбери предмет</span>
        <button type="button" class="tanki-photo-close">✕ Закрыть</button>
      </div><input class="tanki-photo-search" type="search" autocomplete="off"
        placeholder="🔎 Поиск по названию" aria-label="Поиск предмета">
      <div class="tanki-photo-items"></div>`;
    tabs.insertAdjacentElement('afterend', panel);
    const grid = panel.querySelector('.tanki-photo-items');
    const search = panel.querySelector('.tanki-photo-search');
    const heading = panel.querySelector('#tanki-photo-heading-text');
    let openedCategory = null;
    let shownOptions = [];
    let catalog = [];
    let photoRequestNo = 0;

    const isModule = str => /модул|защит|резист/i.test(String(str || ''));
    const normalize = text => String(text || '').normalize('NFKC').toLowerCase()
      .replace(/ё/g, 'е').replace(/\.(png|jpe?g|webp|gif)$/i, '')
      .replace(/[_\-–—()[\]{}.,]+/g, ' ').replace(/\s+/g, ' ').trim();
    const photoExt = /\.(png|jpe?g|webp|gif)$/i;
    const filenameOf = s => String(s || '').replace(/\\/g,'/').split('/').pop();
    const lastPart = s => filenameOf(s).replace(photoExt, '');
    const imageUrl = s => {
      if (!s || typeof s !== 'string') return '';
      if (/^(https?:|data:|blob:)/i.test(s)) return s;
      const path = s.replace(/\\/g,'/').replace(/^\.?\/?images\//i,'').replace(/^\/+/, '');
      return 'images/' + path.split('/').map(encodeURIComponent).join('/');
    };
    const placeholder = name => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">` +
      `<rect width="112" height="112" rx="15" fill="#283044"/>` +
      `<text x="56" y="71" font-family="Arial,sans-serif" font-size="42" ` +
      `fill="#dce3ee" text-anchor="middle">${String(name || '?').slice(0,1).replace(/[<>&"']/g, '')}</text></svg>`
    );

    function knownMaps() {
      const found = [window.TANKI_IMAGE_MAP, window.IMAGE_MAP, window.imageMap, window.imagesMap];
      // Учитываем константы, объявленные в подключённых JS-файлах (не обязательно в window).
      if (typeof TANKI_IMAGE_MAP !== 'undefined') found.push(TANKI_IMAGE_MAP);
      if (typeof IMAGE_MAP !== 'undefined') found.push(IMAGE_MAP);
      return found.filter(m => m && typeof m === 'object' && !Array.isArray(m));
    }

    function itemInfo(option) {
      const keys = [option.value, option.textContent.trim()];
      const datas = [window.TANKI_CALC_DATA, window.TANKI_DATA, window.DATA];
      if (typeof TANKI_CALC_DATA !== 'undefined') datas.push(TANKI_CALC_DATA);
      if (typeof TANKI_DATA !== 'undefined') datas.push(TANKI_DATA);
      for (const data of datas) {
        const items = data && (data.items || data.ITEMS);
        if (!items) continue;
        for (const key of keys) if (items[key]) return items[key];
        if (Array.isArray(items)) {
          const match = items.find(x => x && keys.some(k => k === x.name || k === x.id || k === x.key));
          if (match) return match;
        }
      }
      return {};
    }

    function matchingCatalogFile(text, files) {
      const target = normalize(text);
      if (!target || target.length < 3) return '';
      let best = '', bestScore = 0;
      const tokens = target.split(' ').filter(t => t.length > 2 && !/^(защита|модуль|резист|дрон|корпус|пушка|фото|image|img)$/.test(t));
      for (const file of files) {
        const stem = normalize(lastPart(file));
        if (!stem) continue;
        let score = 0;
        if (stem === target) score = 100;
        else if (stem.includes(target) && target.length >= 5) score = 80;
        else if (target.includes(stem) && stem.length >= 5) score = 60;
        else if (tokens.length && tokens.every(t => stem.split(' ').includes(t))) score = 65 + tokens.length;
        if (score > bestScore) { best = file; bestScore = score; }
      }
      return bestScore >= 60 ? best : '';
    }

    function pathsFor(option, category) {
      const item = itemInfo(option);
      const name = option.textContent.trim();
      const value = option.value;
      const keys = [item.img, item.image, item.image_key, item.imageKey, item.name, name, value]
        .filter(x => typeof x === 'string' && x.trim());
      const paths = [], seen = new Set();
      const add = v => {
        if (!v || typeof v !== 'string') return;
        const url = imageUrl(v);
        if (!url || seen.has(url.toLowerCase())) return;
        seen.add(url.toLowerCase()); paths.push(url);
      };
      const generic = str => /любый? резист|любой резист|any.?resist/i.test(String(str || ''));
      const module = isModule(category) || isModule(item.kind) || isModule(item.category);
      const maps = knownMaps();
      // Сначала индивидуальные фотографии из общей папки images.
      for (const key of keys) add(matchingCatalogFile(key, catalog));
      for (const map of maps) {
        for (const key of keys) {
          const mapped = map[key];
          if (typeof mapped === 'string' && photoExt.test(filenameOf(mapped)) && !generic(mapped)) add(mapped);
        }
      }
      for (const key of keys) {
        if (photoExt.test(filenameOf(key)) && !generic(key)) add(key);
      }
      // На случай, если изображения уже добавлены в images, но не внесены в image_map.js.
      for (const key of [name, value, item.name]) {
        if (!key || typeof key !== 'string' || key.includes('/')) continue;
        for (const ext of ['.png', '.jpg', '.webp']) add(key + ext);
      }
      // Старое общее изображение — последний вариант для защиты.
      if (module) {
        for (const map of maps) {
          for (const k of ['Любой резист','Защита','Модуль']) if (typeof map[k] === 'string') add(map[k]);
        }
        add(matchingCatalogFile('Любой резист', catalog));
        add('Любой резист.png');
      }
      return paths.slice(0, 20);
    }

    function setPhoto(img, option, category) {
      const request = ++photoRequestNo;
      img._tankiRequest = request;
      img.alt = option.textContent.trim();
      const urls = pathsFor(option, category);
      let index = 0;
      img.onerror = () => {
        if (img._tankiRequest !== request) return;
        if (index < urls.length) img.src = urls[index++];
        else { img.onerror = null; img.src = placeholder(option.textContent.trim()); }
      };
      img.onerror();
    }

    // GitHub Pages не показывает файловый список папки images.
    // Публичный GitHub API позволяет найти новые фото без ручного редактирования image_map.js.
    function loadImageCatalog() {
      const host = location.hostname;
      const repo = location.pathname.split('/').filter(Boolean)[0];
      if (!host.endsWith('.github.io') || !repo) return;
      const owner = host.slice(0, -'.github.io'.length);
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/main?recursive=1`;
      fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
        .then(r => { if (!r.ok) throw new Error('Images list unavailable'); return r.json(); })
        .then(j => {
          catalog = Array.isArray(j.tree) ? j.tree.filter(x => x.type === 'blob' && /^images\//i.test(x.path) && photoExt.test(x.path))
            .map(x => x.path.replace(/^images\//i, '')) : [];
          if (!panel.hidden) drawChoices();
          fixModulePhotos();
        }).catch(() => { /* Отсутствие API не ломает выбор. */ });
    }

    function availableOptions() {
      return Array.from(select.options).filter(o => !o.disabled && o.value !== '' && o.textContent.trim());
    }

    function updateReady() {
      // Нельзя скрывать исходный интерфейс, пока нет предметов для выбора.
      document.documentElement.classList.toggle('tanki-photos-ready', availableOptions().length > 0);
    }

    function drawChoices() {
      shownOptions = availableOptions();
      grid.replaceChildren();
      const query = normalize(search.value);
      let visible = 0;
      for (const option of shownOptions) {
        const name = option.textContent.trim();
        if (query && !normalize(name).includes(query)) continue;
        visible++;
        const tile = document.createElement('button');
        tile.type = 'button'; tile.className = 'tanki-photo-item';
        const img = document.createElement('img');
        img.loading = 'lazy'; img.decoding = 'async';
        const text = document.createElement('span'); text.textContent = name;
        tile.append(img, text);
        tile.addEventListener('click', () => {
          // Используем штатные события калькулятора, чтобы НЕ трогать расчёты и сохранение.
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles:true }));
          if (addButton.disabled) {
            // Например, этот предмет уже добавлен. Даём возможность выбрать другой.
            return;
          }
          addButton.click();
          closePanel();
        });
        grid.append(tile);
        setPhoto(img, option, openedCategory || '');
      }
      if (!visible) {
        const empty = document.createElement('div');
        empty.className = 'tanki-photo-empty';
        empty.textContent = shownOptions.length ? 'Ничего не найдено' : 'В этой категории нет предметов';
        grid.append(empty);
      }
      grid.scrollTop = 0;
    }

    function closePanel() {
      panel.hidden = true;
      openedCategory = null;
      search.value = '';
    }

    // Используем существующие кнопки выбора категорий app.js.
    // Их исходный обработчик успеет обновить select до отрисовки нашей галереи.
    tabs.addEventListener('click', event => {
      const tab = event.target.closest('button, [role="tab"], .category-tab');
      if (!tab || !tabs.contains(tab)) return;
      const category = tab.dataset.category || tab.dataset.cat || tab.textContent.trim();
      const wasOpen = !panel.hidden && openedCategory === category;
      setTimeout(() => {
        updateReady();
        if (wasOpen) { closePanel(); return; }
        if (!availableOptions().length) {
          closePanel();
          document.documentElement.classList.remove('tanki-photos-ready');
          return;
        }
        openedCategory = category;
        search.value = '';
        heading.textContent = tab.textContent.trim() + ' — выбери предмет';
        panel.hidden = false;
        drawChoices();
      }, 0);
    }, true);

    panel.querySelector('.tanki-photo-close').addEventListener('click', closePanel);
    search.addEventListener('input', drawChoices);
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePanel();
      if (event.key === 'Enter') {
        const first = grid.querySelector('.tanki-photo-item');
        if (first) { event.preventDefault(); first.click(); }
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) closePanel();
    });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !panel.contains(event.target) && !tabs.contains(event.target)) closePanel();
    });

    // Обновляем состояние, если app.js заполняет список ПОСЛЕ загрузки страницы.
    new MutationObserver(() => {
      updateReady();
      if (!panel.hidden) drawChoices();
    }).observe(select, { childList:true, subtree:true });
    updateReady();
    document.addEventListener('DOMContentLoaded', updateReady, { once:true });
    setTimeout(updateReady, 300);

    // Когда у защиты в карточке стоит общее фото, ищем именное в images.
    // Фото, загруженные пользователем (blob:/data:), никогда не подменяем.
    function fixModulePhotos() {
      if (!catalog.length) return;
      for (const img of document.querySelectorAll('.card-image-wrap img, #shop-preview img')) {
        const src = img.getAttribute('src') || '';
        if (/^(blob:|data:)/i.test(src)) continue;
        const alt = img.alt || '';
        let readableSrc = src;
        try { readableSrc = decodeURIComponent(src); } catch (_) { /* Оставляем исходный URL. */ }
        const genericSrc = /люб(?:ой|ый)[\s_-]*резист/i.test(readableSrc);
        if (!genericSrc || !alt || img.dataset.tankiProtectedImage === alt) continue;
        const matched = matchingCatalogFile(alt, catalog);
        if (!matched || /люб(?:ой|ый) резист/i.test(matched)) continue;
        img.dataset.tankiProtectedImage = alt;
        const source = src;
        img.onerror = () => { img.onerror = null; img.src = source; };
        img.src = imageUrl(matched);
      }
    }
    const cards = document.getElementById('cards-list');
    if (cards) new MutationObserver(fixModulePhotos).observe(cards, { childList:true, subtree:true });
    loadImageCatalog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
