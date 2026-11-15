/**
 * Раскладка экрана (чистые функции, без обращений к API часов — проверяются тестами в Node).
 *
 * Рабочая область — прямоугольник 0..H по высоте. Если системная полоска сверху скрыта (setStatusBarVisible(false)),
 * H = весь экран, 514 px. Если полоска есть, система сжимает страницу до 450 px (514 - 64). Свою высоту можно задать
 * на телефоне: LuvU613 -> ⚙️ -> «Вид на часах» (приходит в ответе на «sync», поле v.h).
 */
export const FULL_H = 514
export const MIN_H = 300
export const MAX_H = 600

/** Высота рабочей области: целое от MIN_H до MAX_H, иначе весь экран. */
export function cleanH(h) {
  const n = Math.round(+h)
  return n >= MIN_H && n <= MAX_H ? n : FULL_H
}

/** Высота одной из трёх равных строк экрана (очередь / верхний ряд / нижний ряд). */
export function rowH(h) { return Math.floor(h / 3) }

/**
 * Значки очереди. До 6 штук — один ряд (60 px, шаг 64). От 7 до 12 — два ряда, чуть меньше (44 px, шаг 54): оба ряда вместе занимают
 * в полтора раза больше высоты, чем один ряд из значков (2 × 44 + 2 = 90 = 1,5 × 60), и стоят по тому же центру строки очереди.
 * Ряды делят очередь поровну (7 — 4 + 3, 12 — 6 + 6), читаются слева направо и сверху вниз.
 */
export const Q_SIZE = 60
export const Q_STEP = 64
export const Q_ONE_MAX = 6
export const Q2_SIZE = 44
export const Q2_STEP = 54
export const Q2_VGAP = 2

/** Сколько значков в каждом ряду: [n] или [верхний, нижний]. */
export function queueRows(n) {
  if (n <= Q_ONE_MAX) return [n]
  return [Math.ceil(n / 2), Math.floor(n / 2)]
}

/**
 * Места значков очереди по порядку: [{ x, y, s }] (s — размер значка: Q_SIZE или Q2_SIZE). cx — середина экрана по горизонтали,
 * h — высота рабочей области, off — сдвиг строки очереди по вертикали (y0).
 */
export function queuePlaces(n, cx, h, off) {
  const out = []
  if (n <= 0) return out
  const rows = queueRows(n)
  if (rows.length === 1) {
    const x0 = queueX0(n, cx, Q_SIZE, Q_STEP)
    const y = itemY(h, 0, Q_SIZE, off)
    for (let j = 0; j < n; j++) out.push({ x: x0 + j * Q_STEP, y: y, s: Q_SIZE })
    return out
  }
  const block = 2 * Q2_SIZE + Q2_VGAP
  const top = itemY(h, 0, block, off)
  for (let r = 0; r < 2; r++) {
    const x0 = queueX0(rows[r], cx, Q2_SIZE, Q2_STEP)
    for (let j = 0; j < rows[r]; j++) out.push({ x: x0 + j * Q2_STEP, y: top + r * (Q2_SIZE + Q2_VGAP), s: Q2_SIZE })
  }
  return out
}

/** x левого значка очереди: n значков с шагом step и размером size стоят по центру cx. */
export function queueX0(n, cx, size, step) {
  const k = n > 0 ? n : 1
  return Math.round(cx - ((k - 1) * step + size) / 2)
}

/** Верх блока высотой block, стоящего по вертикали по центру области высотой h (не выше нуля). */
export function centerTop(h, block) { return Math.max(0, Math.round((h - block) / 2)) }

/** Предел сдвига строки по вертикали (пикселей вверх / вниз от обычного положения). */
export const MAX_OFF = 250

/** Сдвиг строки: целое число пикселей от -MAX_OFF до MAX_OFF, мусор — 0 (как раньше). */
export function cleanOff(n) {
  const v = Math.round(+n)
  return isFinite(v) ? Math.max(-MAX_OFF, Math.min(MAX_OFF, v)) : 0
}

/**
 * Верх предмета высотой size в строке r (0 — очередь, 1 — 🤿🎨🩸, 2 — 📖🧬💀): по центру своей трети экрана плюс сдвиг off.
 * Предмет не выходит за экран: верх не меньше 0, низ не ниже h.
 */
export function itemY(h, r, size, off) {
  const row = rowH(h)
  const y = row * r + Math.round((row - size) / 2) + cleanOff(off)
  return Math.max(0, Math.min(h - size, y))
}

/**
 * Настройки вида с телефона -> проверенные значения:
 *  h — высота рабочей области, hide — скрыть системную полоску (1 / 0), vib — вибрировать при включённом экране (1 / 0),
 *  y0, y1, y2 — сдвиг трёх строк по вертикали в пикселях (0 — как раньше).
 */
export function cleanView(v) {
  return {
    h: cleanH(v && v.h),
    hide: !v || v.hide === undefined ? 1 : (v.hide ? 1 : 0),
    vib: !v || v.vib === undefined ? 1 : (v.vib ? 1 : 0),
    y0: cleanOff(v && v.y0),
    y1: cleanOff(v && v.y1),
    y2: cleanOff(v && v.y2)
  }
}

/**
 * Три зоны по горизонтали (левая / центр / правая) — как три столбца кнопок занятий. Границы стоят посередине зазоров между столбцами:
 * left — отступ слева, cell — ширина кнопки, gap — зазор. Возвращает [граница 1, граница 2].
 */
export function zoneEdges(left, cell, gap) {
  const half = Math.floor(gap / 2)
  return [left + cell + half, left + 2 * cell + gap + half]
}

/** В какую зону (0 — левая, 1 — центр, 2 — правая) попадает x. */
export function zoneOf(x, edges) {
  return x < edges[0] ? 0 : (x < edges[1] ? 1 : 2)
}
