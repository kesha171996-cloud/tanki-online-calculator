/*
 * Tanki Online Calculator — dropdown with item thumbnails.
 * Add <script src="photo_dropdown.js" defer></script> AFTER app.js in index.html.
 * This enhances the existing selector without changing calculations or stored data.
 */
(() => {
  'use strict';

  const select = document.getElementById('item-select');
  const wrap = document.querySelector('.shop-select-wrap');
  const data = window.TANKI_CALC_DATA;
  const imageMap = window.TANKI_IMAGE_MAP || {};
  if (!select || !wrap || !data || !data.items || wrap.querySelector('.photo-picker')) return;

  const css = `
    .photo-picker-hidden-select { position:absolute!important;width:1px!important;height:1px!important;
      opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important; }
    .photo-picker { position:relative; width:100%; min-width:0; }
    .photo-picker-button { width:100%; display:flex; align-items:center; gap:10px; min-height:52px;
      padding:6px 11px; background:var(--bg-soft,#11141c); border:1px solid var(--line,#2a3345);
      border-radius:10px; color:var(--text,#edf0f5); cursor:pointer; text-align:left; font:inherit; }
    .photo-picker-button:hover,.photo-picker-button[aria-expanded="true"],.photo-picker-button:focus-visible {
      border-color:var(--accent,#d4b062); outline:none; }
    .photo-picker-thumb { width:44px; height:44px; border-radius:8px; background:var(--panel-2,#202737);
      object-fit:contain; padding:3px; flex:0 0 44px; }
    .photo-picker-current { min-width:0; flex:1; font-size:14px; font-weight:700;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .photo-picker-chevron { flex:none; color:var(--muted,#96a0b2); font-size:14px; }
    .photo-picker-menu { position:absolute; top:calc(100% + 5px); left:0; right:0; z-index:50;
      border:1px solid var(--accent,#d4b062); border-radius:12px;
      background:var(--panel,#171b25); box-shadow:0 20px 50px rgba(0,0,0,.45);
      padding:8px; max-width:100%; }
    .photo-picker-menu[hidden] { display:none!important; }
    .photo-picker-search { width:100%; height:38px; margin:0 0 7px; padding:7px 10px;
      color:var(--text,#edf0f5); background:var(--bg-soft,#11141c);
      border:1px solid var(--line,#2a3345); border-radius:8px; font:inherit; font-size:13px; }
    .photo-picker-search:focus { border-color:var(--accent,#d4b062); outline:none; }
    .photo-picker-options { max-height:320px; overflow-y:auto; overscroll-behavior:contain; }
    .photo-picker-option { display:flex; align-items:center; gap:11px; width:100%; min-height:57px;
      padding:5px 8px; border:1px solid transparent; border-radius:9px;
      color:var(--text,#edf0f5); background:transparent; text-align:left; cursor:pointer; font:inherit; }
    .photo-picker-option:hover,.photo-picker-option:focus-visible { background:var(--panel-2,#202737); outline:none; }
    .photo-picker-option[aria-selected="true"] { border-color:var(--accent,#d4b062);
      background:color-mix(in srgb,var(--accent,#d4b062) 12%,transparent); }
    .photo-picker-option-name { font-size:13px; font-weight:650; line-height:1.3; }
    .photo-picker-no-results { padding:17px 8px; text-align:center; font-size:13px; color:var(--muted,#96a0b2); }
    @media (max-width:650px) {
      .photo-picker-menu { width:100%; }
      .photo-picker-options { max-height:min(50vh,320px); }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Keep the original select present: the calculator reads it for calculation and updates.
  select.classList.add('photo-picker-hidden-select');
  select.setAttribute('tabindex', '-1');
  select.setAttribute('aria-hidden', 'true');
  const label = wrap.querySelector('label[for="item-select"]');
  if (label) label.removeAttribute('for');

  const picker = document.createElement('div');
  picker.className = 'photo-picker';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'photo-picker-button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Выбрать предмет с фотографией');

  const thumb = document.createElement('img');
  thumb.className = 'photo-picker-thumb';
  thumb.alt = '';
  const selectedText = document.createElement('span');
  selectedText.className = 'photo-picker-current';
  const chevron = document.createElement('span');
  chevron.className = 'photo-picker-chevron';
  chevron.textContent = '▾';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(thumb, selectedText, chevron);

  const menu = document.createElement('div');
  menu.className = 'photo-picker-menu';
  menu.hidden = true;
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'photo-picker-search';
  search.placeholder = '🔎 Поиск предмета…';
  search.setAttribute('aria-label', 'Поиск предмета');
  search.autocomplete = 'off';
  const optionsList = document.createElement('div');
  optionsList.className = 'photo-picker-options';
  optionsList.id = 'photo-picker-options';
  optionsList.setAttribute('role', 'listbox');
  optionsList.setAttribute('aria-label', 'Предметы с фотографиями');
  trigger.setAttribute('aria-controls', optionsList.id);
  menu.append(search, optionsList);
  picker.append(trigger, menu);
  select.insertAdjacentElement('afterend', picker);

  function fallback(name) {
    const firstLetter = (name || '?').slice(0, 1);
    // Text content is URI-encoded: safely handles Cyrillic and punctuation.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="16" fill="#283044"/><text x="50" y="62" text-anchor="middle" font-size="44" fill="#d0d7e3" font-family="Arial,sans-serif">${firstLetter.replace(/[&<>"']/g, '')}</text></svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function pictureFor(key) {
    const item = data.items[key];
    if (!item) return '';
    const id = item.img || '';
    const filename = id.startsWith(data.image_prefix || '\u0000') ? imageMap['Любой резист'] : imageMap[id];
    return filename ? 'images/' + encodeURI(filename) : '';
  }

  function usePicture(img, key, name) {
    const fail = fallback(name);
    img.onerror = () => { img.onerror = null; img.src = fail; };
    img.src = pictureFor(key) || fail;
  }

  function selectedOption() {
    return Array.from(select.options).find(option => option.value === select.value) || select.options[0];
  }

  function updateButton() {
    const option = selectedOption();
    const name = option ? option.textContent : 'Нет предметов';
    selectedText.textContent = name;
    usePicture(thumb, option ? option.value : '', name);
  }

  function closeMenu(focusTrigger = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focusTrigger) trigger.focus();
  }

  function drawOptions() {
    optionsList.replaceChildren();
    const filter = search.value.trim().toLocaleLowerCase('ru');
    let count = 0;
    for (const option of select.options) {
      const name = option.textContent || '';
      if (!name.toLocaleLowerCase('ru').includes(filter)) continue;
      count += 1;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'photo-picker-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.value === select.value));
      row.dataset.value = option.value;

      const img = document.createElement('img');
      img.className = 'photo-picker-thumb';
      img.alt = '';
      img.loading = 'lazy';
      usePicture(img, option.value, name);

      const nameNode = document.createElement('span');
      nameNode.className = 'photo-picker-option-name';
      nameNode.textContent = name;
      row.append(img, nameNode);
      row.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        updateButton();
        closeMenu(true);
      });
      optionsList.appendChild(row);
    }
    if (!count) {
      const empty = document.createElement('p');
      empty.className = 'photo-picker-no-results';
      empty.textContent = 'Ничего не найдено';
      optionsList.appendChild(empty);
    }
  }

  function openMenu() {
    search.value = '';
    drawOptions();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    search.focus();
    const chosen = optionsList.querySelector('[aria-selected="true"]');
    if (chosen) chosen.scrollIntoView({ block: 'nearest' });
  }

  trigger.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  search.addEventListener('input', drawOptions);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const first = optionsList.querySelector('.photo-picker-option');
      if (first) first.focus();
    }
    if (event.key === 'Enter') {
      const first = optionsList.querySelector('.photo-picker-option');
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  optionsList.addEventListener('keydown', event => {
    const row = event.target.closest('.photo-picker-option');
    if (!row) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = Array.from(optionsList.querySelectorAll('.photo-picker-option'));
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = buttons[Math.min(buttons.length - 1, Math.max(0, buttons.indexOf(row) + step))];
      if (next) next.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!picker.contains(event.target)) closeMenu();
  });
  select.addEventListener('change', updateButton);
  // app.js regenerates the <option> elements on category changes.
  new MutationObserver(() => { closeMenu(); updateButton(); }).observe(select, { childList: true });
  updateButton();
})();
