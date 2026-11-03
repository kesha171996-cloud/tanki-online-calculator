/*
  Tanki Online — отдельные фотографии модулей/защиты.
  Подключить ПОСЛЕ image_map.js, но ДО app.js:
     <script src="module_images_fix.js" defer></script>
  Не меняет интерфейс, скидки, цены, сохранённые данные или фото пушек.
*/
(() => {
  'use strict';

  const catalog = window.TANKI_CALC_DATA;
  const pictures = window.TANKI_IMAGE_MAP;
  if (!catalog || !catalog.items || !pictures || typeof pictures !== 'object') {
    console.warn('[Tanki] Не найдены данные или карта изображений. Проверь порядок подключения скриптов.');
    return;
  }

  // Подтверждённые названия файлов в /images. GitHub различает регистр букв.
  const protectionPhotos = [
    { stem: /вулкан/i, filename: 'Вулкан (Защита).png' },
    { stem: /гаус/i, filename: 'Гаус (Защита).png' },
    { stem: /гром/i, filename: 'Гром (Защита).png' },
    { stem: /изид/i, filename: 'Изида (Защита).png' },
  ];

  const prefix = String(catalog.image_prefix || '');
  const entries = Array.isArray(catalog.items)
    ? catalog.items.map((item, i) => [String(i), item])
    : Object.entries(catalog.items);

  let changed = 0;
  for (const [id, item] of entries) {
    if (!item || typeof item !== 'object') continue;
    const imageId = typeof item.img === 'string' ? item.img : '';
    const kind = String(item.category || item.kind || item.type || item.group || '');
    const name = [id, item.name, item.title, item.label, imageId].filter(Boolean).join(' ');
    // Не заменяем фотографии пушек с такими же названиями.
    const isProtection = (prefix && imageId.startsWith(prefix)) ||
      /модул|защит|резист/i.test(kind) || /модул|защит|резист/i.test(name);
    if (!isProtection) continue;

    const photo = protectionPhotos.find(p => p.stem.test(name));
    if (!photo) continue;

    // Отдельный ключ не конфликтует с пушкой с тем же названием.
    const ownKey = '__module_photo__' + photo.filename;
    pictures[ownKey] = photo.filename;
    try {
      item.img = ownKey;
      changed++;
    } catch (e) {
      console.warn('[Tanki] Не удалось заменить фото модуля:', id, e);
    }
  }
  console.info('[Tanki] Фотографии защиты привязаны к ' + changed + ' предметам.');
})();
