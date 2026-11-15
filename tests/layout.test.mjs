import assert from 'node:assert'
import * as lay from '../shared/layout.js'

let n = 0
function t(name, f) { f(); n++; console.log('ok  ' + name) }
const CX = 198, SZ = 60, STEP = 64

t('высота: допустимые значения как есть, мусор — весь экран', () => {
  assert.equal(lay.cleanH(450), 450)
  assert.equal(lay.cleanH('480'), 480)
  assert.equal(lay.cleanH(100), lay.FULL_H)
  assert.equal(lay.cleanH(9999), lay.FULL_H)
  assert.equal(lay.cleanH(undefined), lay.FULL_H)
})

t('три равные строки экрана', () => {
  assert.equal(lay.rowH(514), 171)
  assert.equal(lay.rowH(450), 150)
})

t('нижний ряд кнопок помещается и при 514, и при 450 (кнопка 120 px по центру своей строки)', () => {
  for (const h of [514, 450]) {
    const row = lay.rowH(h)
    const bottom = row * 2 + Math.round((row - 120) / 2) + 120
    assert.ok(bottom <= h, 'не помещается при ' + h + ': ' + bottom)
  }
})

t('очередь по центру: центр группы всегда 198 (для 1..6 значков)', () => {
  for (let k = 1; k <= 6; k++) {
    const x0 = lay.queueX0(k, CX, SZ, STEP)
    const x1 = x0 + (k - 1) * STEP + SZ
    assert.equal((x0 + x1) / 2, CX, 'значков: ' + k)
  }
  assert.equal(lay.queueX0(6, CX, SZ, STEP), 8)    // шесть значков занимают ту же ширину, что сетка кнопок
  assert.equal(lay.queueX0(1, CX, SZ, STEP), 168)
})

t('блок по центру по высоте и не выше нуля', () => {
  assert.equal(lay.centerTop(514, 323), 96)
  assert.equal(lay.centerTop(450, 323), 64)
  assert.equal(lay.centerTop(300, 400), 0)
})

const D = { hide: 1, vib: 1, y0: 0, y1: 0, y2: 0 }
t('вид с телефона: по умолчанию полоска скрыта, вибрация включена, сдвигов нет', () => {
  assert.deepEqual(lay.cleanView({ h: 450, hide: 0 }), { ...D, h: 450, hide: 0 })
  assert.deepEqual(lay.cleanView({ h: 514, hide: 1 }), { ...D, h: 514 })
  assert.deepEqual(lay.cleanView(null), { ...D, h: lay.FULL_H })
  assert.deepEqual(lay.cleanView({ h: 7 }), { ...D, h: lay.FULL_H })
})

t('вибрация: 0 — выключена, 1 / не задано — включена', () => {
  assert.equal(lay.cleanView({ vib: 0 }).vib, 0)
  assert.equal(lay.cleanView({ vib: 1 }).vib, 1)
  assert.equal(lay.cleanView({}).vib, 1)
  assert.equal(lay.cleanView(null).vib, 1)
})

t('сдвиг строки: целое, в пределах ±250, мусор — 0', () => {
  assert.equal(lay.cleanOff(-30), -30)
  assert.equal(lay.cleanOff('15'), 15)
  assert.equal(lay.cleanOff(7.6), 8)
  assert.equal(lay.cleanOff(9999), lay.MAX_OFF)
  assert.equal(lay.cleanOff(-9999), -lay.MAX_OFF)
  assert.equal(lay.cleanOff(undefined), 0)
  assert.equal(lay.cleanOff('abc'), 0)
  assert.deepEqual(lay.cleanView({ y0: -20, y1: 10, y2: 400 }), { ...D, h: lay.FULL_H, y0: -20, y1: 10, y2: 250 })
})

t('положение строк при нулевом сдвиге — как в версии 11 (514: очередь 56, кнопки 197 и 368)', () => {
  assert.equal(lay.itemY(514, 0, 60, 0), 56)
  assert.equal(lay.itemY(514, 1, 120, 0), 171 + 26)
  assert.equal(lay.itemY(514, 2, 120, 0), 342 + 26)
  assert.equal(lay.itemY(450, 2, 120, 0), 300 + 15)
})

t('сдвиг: минус — выше, плюс — ниже, за край экрана не уходит', () => {
  assert.equal(lay.itemY(514, 1, 120, -20), 171 + 26 - 20)
  assert.equal(lay.itemY(514, 2, 120, 10), 342 + 26 + 10)
  assert.equal(lay.itemY(514, 0, 60, -250), 0)           // выше экрана не уйдёт
  assert.equal(lay.itemY(514, 2, 120, 250), 514 - 120)   // ниже экрана не уйдёт
})

t('три зоны: границы посередине зазоров между столбцами кнопок', () => {
  const e = lay.zoneEdges(8, 120, 10)
  assert.deepEqual(e, [133, 263])
  assert.equal(lay.zoneOf(0, e), 0)
  assert.equal(lay.zoneOf(132, e), 0)
  assert.equal(lay.zoneOf(133, e), 1)
  assert.equal(lay.zoneOf(198, e), 1)       // середина экрана — центр
  assert.equal(lay.zoneOf(262, e), 1)
  assert.equal(lay.zoneOf(263, e), 2)
  assert.equal(lay.zoneOf(431, e), 2)
})

t('очередь: до 6 значков — один ряд, 7–12 — два ряда поровну', () => {
  assert.deepEqual([1, 6, 7, 8, 11, 12].map((n) => lay.queueRows(n)), [[1], [6], [4, 3], [4, 4], [6, 5], [6, 6]])
  assert.equal(lay.queuePlaces(0, 198, 450, 0).length, 0)
  for (let n = 1; n <= 12; n++) assert.equal(lay.queuePlaces(n, 198, 450, 0).length, n)
})

t('очередь в два ряда занимает в полтора раза больше высоты, чем один ряд, по тому же центру строки', () => {
  for (const h of [450, 514]) {
    for (const off of [0, -20, 30]) {
      const one = lay.queuePlaces(6, 198, h, off)
      const two = lay.queuePlaces(12, 198, h, off)
      const oneTop = one[0].y
      const oneH = lay.Q_SIZE
      const twoTop = Math.min(...two.map((p) => p.y))
      const twoBottom = Math.max(...two.map((p) => p.y + p.s))
      assert.equal(twoBottom - twoTop, Math.round(oneH * 1.5))
      assert.equal(twoTop + (twoBottom - twoTop) / 2, oneTop + oneH / 2)   // та же середина
      assert.ok(two[0].s < lay.Q_SIZE && two[0].s >= lay.Q_SIZE * 0.7)    // чуть меньше, не радикально
      // верхний ряд выше одного ряда, нижний ниже; ряды не налезают друг на друга
      assert.ok(twoTop < oneTop && twoBottom > oneTop + oneH)
      assert.ok(two[0].y + two[0].s <= two[11].y)
    }
  }
})

t('очередь не выходит за свою треть экрана по высоте (кнопки занятий не трогаем) и по ширине', () => {
  const h = 450
  const row = lay.rowH(h)
  for (let n = 1; n <= 12; n++) {
    const pl = lay.queuePlaces(n, 198, h, 0)
    for (const p of pl) {
      assert.ok(p.y >= 0 && p.y + p.s <= row, 'n=' + n + ' y=' + p.y)       // строка очереди 0..150, под ней начинается ряд 🤿🎨🩸
      assert.ok(p.x >= 0 && p.x + p.s <= 432)
    }
    // значки в ряду не налезают друг на друга
    for (let j = 1; j < pl.length; j++) if (pl[j].y === pl[j - 1].y) assert.ok(pl[j].x >= pl[j - 1].x + pl[j - 1].s)
  }
  // с экраном 514 (три строки по 171) — то же самое
  for (let n = 1; n <= 12; n++) for (const p of lay.queuePlaces(n, 198, 514, 0)) assert.ok(p.y >= 0 && p.y + p.s <= lay.rowH(514))
})

t('значок очереди попадает в зону по своему центру: один — центр; шесть — по краям лево / право', () => {
  const e = lay.zoneEdges(8, 120, 10)
  const zoneOfIcon = (n, k) => { const p = lay.queuePlaces(n, 198, 450, 0)[k]; return lay.zoneOf(p.x + p.s / 2, e) }
  assert.equal(zoneOfIcon(1, 0), 1)
  assert.equal(zoneOfIcon(6, 0), 0)
  assert.equal(zoneOfIcon(6, 5), 2)
  assert.equal(zoneOfIcon(12, 0), 0)
  assert.equal(zoneOfIcon(12, 11), 2)
  for (let n = 1; n <= 12; n++) for (let k = 0; k < n; k++) assert.ok([0, 1, 2].includes(zoneOfIcon(n, k)))
})

console.log('\nВсе проверки раскладки пройдены: ' + n)
