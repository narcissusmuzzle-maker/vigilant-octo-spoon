/**
 * Таймеры занятий (6 штук, 2×3), очередь занятий сверху, цветные таймеры, экран настройки ценности 🩸 и экран подарков 🎁.
 * Подробности логики — в shared/core.js. Свайпов в приложении нет: всё управляется нажатиями.
 *  - Нажатие на эмодзи: запуск (эмодзи заменяется цифрами: минуты до конца промежутка). Нажатие на цифры — СТОП:
 *    таймер обнуляется, на телефон уходит пройденное время. Запуск другого таймера останавливает прежний.
 *  - Промежуток = ценность 🩸 (60 / 45 / 30 / 15 минут, меняется на экране настройки). В конце — вибрация, событие
 *    уходит на телефон (app-side/index.js), таймер продолжается. На телефон уходят только минуты занятий.
 *  - Экран делится на три равные строки: очередь / 🤿 🎨 🩸 / 📖 🧬 💀, каждая — на три зоны (слева / центр / справа).
 *  - ДОЛГИЕ нажатия по зонам:
 *      верхняя строка (очередь):   слева — создать очередь (повторно — закончить), по центру — серый таймер, справа — удалить очередь;
 *      средняя строка (🤿 🎨 🩸):  🤿 — экран подарков, 🎨 (центр) — зелёный таймер, 🩸 — экран настройки ценности;
 *      нижняя строка (📖 🧬 💀):   📖 — случайная очередь из шести, 🧬 (центр) — красный таймер, 💀 — режим сохранённых очередей.
 *    Экраны подарков и настройки открываются, только когда ничего не идёт. Закрыть любой из них — долгое нажатие.
 *  - Очередь занятий живёт только на часах (до 12 значков; больше шести — два ряда, значки чуть меньше). В конце полного промежутка занятия
 *    самое левое такое занятие убирается из очереди; серый таймер по окончании убирает самый левый 🏠 / 🍀 / 🔍 (и час такого занятия уходит на телефон).
 *  - Серый таймер длится ценность 🩸; зелёный — 60 минут (по окончании и при досрочном выходе телефон превращает один 🎁 в ❤️);
 *    красный — 15 минут. Цветной таймер — на весь экран, обычный тап ничего не делает, досрочный выход — долгое нажатие.
 *    По окончании он сам закрывается (вибрация — та же, что в конце занятия).
 *  - Режим создания очереди (долгое нажатие слева сверху): экран не меняется, но шесть кнопок занятий добавляют своё занятие в очередь,
 *    а не запускают таймер; долгое нажатие на 📖 добавляет 🏠, на 💀 — 🔍; долгое нажатие справа сверху сбрасывает собранное.
 *    Повторное долгое нажатие слева сверху заканчивает создание: собранная очередь становится текущей (пустая ничего не меняет).
 *  - Режим сохранённых очередей (долгое нажатие на 💀 справа снизу): экран не меняется. Долгое нажатие на 🤿 🎨 🩸 📖 🧬 сохраняет за этой кнопкой
 *    текущую очередь (перезаписывая прежнюю), обычное нажатие — заменяет текущую очередь сохранённой (на пустой ячейке ничего не происходит).
 *    Выход — 💀 (обычное или долгое нажатие). Обе пары режимов начинаются, только когда ничего не идёт.
 *  - Вибрация в режимах: короткая — добавлено занятие / загружена очередь; длиннее — вход, выход, сохранение, случайная очередь, удаление.
 *  - Подарки приходят с телефона: при каждом открытии приложения (оно открывается заново при включении экрана), при открытии экрана подарков
 *    и в ответ на каждое событие, которое отправили часы. Постоянного опроса нет.
 *  - Системная полоска сверху (название и время, 64 px) скрывается (setStatusBarVisible), прокрутка страницы заблокирована
 *    (setScrollLock): весь экран 432×514 — рабочий, ничего не обрезается и не «тянется». Высоту рабочей области и показ полоски
 *    можно поменять на телефоне (LuvU613 5.12: ⚙️ -> «Вид на часах», поле v в ответе на sync); сохранённые настройки вида остаются в силе.
 *  - Очередь по центру экрана (по CX). Вибрация — как в версии 10: при погасшем экране вибрирует служба будильника (app-service/alarm.js),
 *    при включённом — страница (одна длинная сцена).
 */
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align, text_style, setStatusBarVisible } from '@zos/ui'
import { setScrollLock } from '@zos/page'
import { replace } from '@zos/router'
import { getDeviceInfo } from '@zos/device'
import { Vibrator, VIBRATOR_SCENE_DURATION_LONG } from '@zos/sensor'
import * as sensor from '@zos/sensor'
import { setPageBrightTime, pauseDropWristScreenOff, setWakeUpRelaunch } from '@zos/display'
import { LocalStorage } from '@zos/storage'
import * as inter from '@zos/interaction'
import { set as alarmSet, cancel as alarmCancel } from '@zos/alarm'
import * as core from '../shared/core'
import * as lay from '../shared/layout'

const SEND_GAP = 15000        // как часто повторять отправку неподтверждённого события
const USE_ALARM = true        // будить приложение будильником, когда промежуток заканчивается при погасшем экране
const KEEP_AWAKE = true       // пока что-то идёт, не гасить экран
// Поля экрана (в координатах 432 px по ширине). Высоту рабочей области лучше менять на телефоне (⚙️ -> «Вид на часах»).
const SCREEN_W = 432
const LEFT = 8                // отступ слева
// размеры и места значков очереди (один ряд до 6 штук, два ряда до 12) — в shared/layout.js
const CELL = 120
const GAP = 10
const ZE = lay.zoneEdges(LEFT, CELL, GAP)   // границы левой / средней / правой зоны экрана (x = 133 и 263)
const QFULL = core.QUEUE_MAX  // сколько занятий помещается в очередь (12)
const Q2_SHIFT = 0            // сдвиг очереди из двух рядов по вертикали, px (минус — выше, плюс — ниже); один ряд не двигается
const SLOTS = 5               // сколько очередей можно сохранить (кнопки 🤿 🎨 🩸 📖 🧬; шестая кнопка — выход)
const SWIPE_EXIT_IDLE = false // true — когда ничего не идёт, свайп вправо выходит из приложения (как у обычных приложений часов)
// Горизонтальный центр видимой области: середина сетки (LEFT + 380/2). Цветные таймеры и экран подарков центруются по нему.
// Если время или сердечки «съезжают» вправо/влево — меняйте это число.
const CX = 198
const OV_W = CX * 2           // ширина части цветного экрана с цифрами (остаток справа — полоса того же цвета)
// Экран подарков
const HSZ = 40                // размер ❤️
const HSTEP = 47              // шаг ❤️ (8 штук = 369 px)
const HPER = 8                // ❤️ в строке
const HMAX = 16               // не больше двух строк
const HROW = 46               // расстояние между строками ❤️
const GFT_SZ = 160
const GIFT_BLOCK = 323        // высота всего блока подарков: ❤️ (две строки) + 🎁 + подпись; блок стоит по центру экрана по высоте
const GFT_DY = 118            // верх большого 🎁 (160 px) от верха блока
const GL_DY = 283             // подпись «x N» под подарком — от верха блока
const GL_SIZE = 24            // размер подписи (очень мелкая)
// Экран настройки ценности 🩸: 🩸 (120 px), под ним 32 px зазора и подпись (90 px) — по центру экрана по высоте
const SET_BLOCK = 242
const SET_LABEL_DY = 152
const WHITE = 0xffffff
const BLACK = 0x000000
const BTN_BLACK = 0x050505
const RED = 0xff4517
const GREEN = 0x3bf76d
const GRAY = 0x8c8c8c
// цвет цифр на цветных таймерах
const OV_FG = { r: WHITE, g: BLACK, y: BLACK }
const OV_BG = { r: RED, g: GREEN, y: GRAY }

// эмодзи занятий в порядке картинок i0..i8 / q0..q8 / m0..m8; приложение-трекер на телефоне по эмодзи понимает занятие
const EMOJI = core.EMOJI

// Хранилище: если часы его не дают (нет разрешения и т.п.), работаем в памяти и показываем причину на экране
let ls = null
const mem = {}
const store = {
  getItem(k, d) {
    try { if (ls) { const v = ls.getItem(k, d); return v === undefined || v === null ? d : v } } catch (e) { fail('getItem ' + e) }
    return k in mem ? mem[k] : d
  },
  setItem(k, v) {
    mem[k] = v
    try { if (ls) ls.setItem(k, v) } catch (e) { fail('setItem ' + e) }
  }
}

// Ошибки показываем на экране (а не оставляем чёрный экран): без этого на часах их не увидеть
let failed = 0
function fail(msg) {
  failed++
  if (failed > 3) return
  try {
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: 432, h: 514, color: 0x300000 })
    createWidget(widget.TEXT, {
      x: 12, y: 12 + (failed - 1) * 150, w: 408, h: 140, color: 0xffffff, text_size: 22,
      align_h: align.LEFT, align_v: align.TOP, text_style: text_style.WRAP, text: 'Ошибка ' + failed + ': ' + String(msg).slice(0, 160)
    })
  } catch (e) { /* больше показать нечем */ }
}
function guard(name, f) {
  try { return f() } catch (e) { fail(name + ': ' + e); return undefined }
}

let ST = null          // состояние (хранится): таймеры, очередь занятий, неотправленные события
let view = 'main'      // 'main' — занятия и очередь, 'settings' — ценность 🩸, 'gift' — подарки, 'ov' — цветной таймер на весь экран
let vib = null
let inflight = false
let inflightAt = 0
let syncing = false
let syncAt = 0
let timer = null
let ticks = 0
let lpAt = 0           // когда сработало долгое нажатие (чтобы отпускание пальца не считалось обычным нажатием)
let shown = []         // для каждого квадрата: показана ли кнопка идущего таймера
let lastLabel = []
let lastOv = ''
let lastQ = ''
let idle = []
let runb = []
let qb = []            // qb[k][e] — большой значок очереди (один ряд): место k, эмодзи e (у каждой пары своя кнопка с готовой картинкой)
let qs = []            // qs[k][e] — маленький значок очереди (два ряда): место k, эмодзи e
let qCx = []           // середина каждого стоящего на экране значка по x (нужно, чтобы понять, в какой зоне значок)
let zb = []            // три невидимые (чёрные) кнопки-зоны верхней строки: левая / центр / правая
let creating = false   // идёт создание очереди: кнопки занятий добавляют занятие в очередь, а не запускают таймер
let qDraft = []        // очередь, которую собирают (до QFULL эмодзи)
let slotMode = false   // режим сохранённых очередей: кнопки занятий сохраняют / загружают очередь
let slots = []         // сохранённые очереди (SLOTS штук): по кнопке 🤿 🎨 🩸 📖 🧬
let lpCell = -1        // на какой кнопке занятия было долгое нажатие и когда (отпускание пальца не должно считаться нажатием)
let lpCellAt = 0
let gifts = { n: 0, h: 0 }   // с телефона: сколько 🎁 доступно и сколько уже превращено в ❤️
let gBg = null
let gGift = null
let gLabel = null
let hearts = [[], []]  // для каждой строки ❤️: { off, b } — смещение от центра в шагах и кнопка
let lastG = ''
let me = null          // страница (нужна обработчикам жестов)
let sBg = null
let sEmoji = null
let sLabel = null
let ov = { r: null, g: null, y: null }
let ovS = { r: null, g: null, y: null }   // полоса справа от цифр (чтобы цвет закрывал весь экран)
let launch = ''        // с каким параметром открыта страница ('alarm' — разбудил будильник)
let G = null           // геометрия
let ROW = 171          // высота одной из трёх строк экрана
let LV = { h: 0, hide: 1, vib: 1, y0: 0, y1: 0, y2: 0 }   // вид с телефона: h — высота рабочей области (0 — по размеру экрана), hide — скрыть полоску сверху,
                       // vib — вибрировать при включённом экране, y0/y1/y2 — сдвиг строк (очередь / 🤿🎨🩸 / 📖🧬💀) по вертикали, px
let layV = 0           // счётчик перекладок экрана (чтобы очередь и подарки перерисовались на новых местах)

function cur() { return ST }

function save() {
  try {
    store.setItem('st', JSON.stringify(ST))
  } catch (e) { /* без сохранения продолжаем работать */ }
}

function vibrate(mode) {
  try {
    if (!vib) vib = new Vibrator()
    vib.start({ mode: mode })
  } catch (e) {
    try { vib.setMode({ mode: mode }); vib.start() } catch (e2) { /* нет вибромотора */ }
  }
}

/** Вибрация страницы (экран включён): одна длинная сцена, как в версии 10. Если на телефоне выключено — молчим.
 *  При погасшем экране вибрирует служба будильника (app-service/alarm.js) — её этот переключатель не касается. */
function signalHour() {
  if (!LV.vib) return
  vibrate(VIBRATOR_SCENE_DURATION_LONG)
}

/** Короткий отклик в режимах очереди: 'tick' — добавлено занятие / загружена очередь, 'mode' — вход, выход, сохранение, случайная, удаление.
 *  Если нужной вибрации в системе нет или на телефоне выключена вибрация часов — молчим. */
function feedback(kind) {
  if (!LV.vib) return
  const m = kind === 'tick' ? sensor.VIBRATOR_SCENE_SHORT_LIGHT : sensor.VIBRATOR_SCENE_DURATION
  if (m === undefined) return
  vibrate(m)
}

/** Системная полоска сверху и прокрутка: полоска скрыта (если телефон не сказал иначе), прокрутка заблокирована. */
function applyBar() {
  try { setStatusBarVisible(!LV.hide) } catch (e) { /* не квадратный экран — полоски нет */ }
  try { setScrollLock({ lock: true }) } catch (e) { /* не критично */ }
}

function loadView() {
  try {
    const raw = store.getItem('vw', '')
    if (raw) LV = lay.cleanView(JSON.parse(raw))
  } catch (e) { /* вид по умолчанию: весь экран, полоска скрыта */ }
}

function geometry() {
  let h = lay.FULL_H
  try {
    const d = getDeviceInfo()
    if (d && d.height > 0) h = Math.min(d.height, lay.FULL_H)
  } catch (e) { /* значения по умолчанию */ }
  if (LV.h > 0) h = LV.h   // высоту задал телефон (⚙️ -> «Вид на часах»)
  // ширина всегда 432 (designWidth приложения): реальная ширина экрана могла быть больше и уводила сетку за край
  ROW = lay.rowH(h)
  return { w: SCREEN_W, h: h, cell: CELL, font: Math.round(CELL * 0.5) }
}

/** Куда ставить блок экрана настройки: 🩸 и подпись под ним — по центру по высоте. */
function setTop() { return lay.centerTop(G.h, SET_BLOCK) }
/** Верх блока экрана подарков (по центру по высоте). */
function giftTop() { return lay.centerTop(G.h, GIFT_BLOCK) }

/** Кнопка занятия i: ряд 0 — средняя треть экрана, ряд 1 — нижняя; по центру своей трети. */
function cellXY(i) {
  const c = i % 3
  const r = Math.floor(i / 3)
  return { x: LEFT + c * (CELL + GAP), y: lay.itemY(G.h, 1 + r, CELL, r === 0 ? LV.y1 : LV.y2) }
}

/** Зона верхней строки (0 — левая, 1 — центр, 2 — правая): на всю высоту строки, строка сдвигается вместе с очередью (y0). */
function zoneRect(c) {
  const a = c === 0 ? 0 : ZE[c - 1]
  const b = c === 2 ? G.w : ZE[c]
  return { x: a, y: Math.max(0, Math.min(G.h - ROW, LV.y0)), w: b - a, h: ROW }
}

function setBtn(b, x, y, w, h, text, color) {
  try { b.setProperty(prop.MORE, { x: x, y: y, w: w, h: h, text: text, color: color }) } catch (e) { /* не критично */ }
}

function setVisible(b, v) {
  try { if (b) b.setProperty(prop.VISIBLE, v) } catch (e) { /* не критично */ }
}

/** Переставить кнопку (картинку не трогаем: её часы не обновляют). */
function moveBtn(b, x, y, w, h) {
  try { if (b) b.setProperty(prop.MORE, { x: x, y: y, w: w, h: h }) } catch (e) { /* не критично */ }
}

/** Очередь, которую сейчас показываем: собираемая (во время создания) или текущая. */
function shownQueue() { return creating ? qDraft : ST.queue }

/** Значки очереди (только на главном экране): до 6 — один ряд побольше, 7–12 — два ряда поменьше (места считает shared/layout.js).
 *  Картинку на кнопке менять нельзя (часы её не обновляют — все значки были 🤿), поэтому у каждого места есть по кнопке на каждое эмодзи,
 *  а показывается одна. */
function renderQueue() {
  const items = shownQueue()
  const key = view + '|' + items.join(',') + '|' + layV
  if (key === lastQ) return
  lastQ = key
  const vis = []
  for (let k = 0; k < items.length && vis.length < QFULL; k++) {
    const idx = EMOJI.indexOf(items[k])
    if (idx >= 0) vis.push(idx)
  }
  const places = lay.queuePlaces(vis.length, CX, G.h, LV.y0 + (vis.length > lay.Q_ONE_MAX ? Q2_SHIFT : 0))
  const big = vis.length <= lay.Q_ONE_MAX
  qCx = []
  for (let j = 0; j < places.length; j++) qCx.push(places[j].x + places[j].s / 2)
  for (let j = 0; j < QFULL; j++) {
    for (let e = 0; e < EMOJI.length; e++) {
      const on = view === 'main' && j < vis.length && e === vis[j]
      const bb = qb[j] && qb[j][e]
      const sb = qs[j] && qs[j][e]
      if (on) {
        const pl = places[j]
        moveBtn(big ? bb : sb, pl.x, pl.y, pl.s, pl.s)
      }
      setVisible(bb, on && big)
      setVisible(sb, on && !big)
    }
  }
}

function saveSlots() {
  try { store.setItem('qsl', JSON.stringify(slots)) } catch (e) { /* не критично */ }
}

function saveMode() {
  try { store.setItem('qm', slotMode ? '1' : '0') } catch (e) { /* не критично */ }
}

function saveDraft() {
  try {
    store.setItem('qc', creating ? '1' : '0')
    store.setItem('qd', JSON.stringify(qDraft))
  } catch (e) { /* не критично */ }
}

function setGifts(g) {
  if (!g) return
  const n = Math.max(0, Math.floor(+g.n || 0))
  const h = Math.max(0, Math.floor(+g.h || 0))
  if (n === gifts.n && h === gifts.h) return
  gifts = { n: n, h: h }
  try { store.setItem('gs', JSON.stringify(gifts)) } catch (e) { /* не критично */ }
  renderGift()
}

/** Экран подарков: ❤️ сверху (строки по центру), большой 🎁 и подпись «x N»; при N = 0 сам 🎁 не показывается. */
function renderGift() {
  const on = view === 'gift'
  const cnt = Math.min(gifts.h, HMAX)
  const key = (on ? 'on' : 'off') + '|' + gifts.n + '|' + cnt + '|' + layV
  if (key === lastG) return
  lastG = key
  setVisible(gBg, on)
  setVisible(gGift, on && gifts.n > 0)
  setVisible(gLabel, on)
  if (on) setBtn(gLabel, CX - 60, giftTop() + GL_DY, 120, 40, 'x ' + gifts.n, WHITE)
  for (let r = 0; r < 2; r++) {
    const k = Math.max(0, Math.min(HPER, cnt - r * HPER))   // сколько ❤️ в этой строке
    for (let j = 0; j < hearts[r].length; j++) {
      const o = hearts[r][j].off
      // при k сердечках смещения: -(k-1)/2 ... (k-1)/2 с шагом 1
      const d = o + (k - 1) / 2
      const show = on && k > 0 && Math.abs(d - Math.round(d)) < 0.01 && Math.round(d) >= 0 && Math.round(d) < k
      setVisible(hearts[r][j].b, show)
    }
  }
}

/** Переключить экран: показать нужные виджеты, остальные спрятать. */
function enterView(v) {
  view = v
  for (let i = 0; i < core.COUNT; i++) { setVisible(idle[i], false); setVisible(runb[i], false) }
  shown = []
  lastLabel = []
  lastOv = ''
  lastQ = ''
  lastG = ''
  renderQueue()
  renderGift()
  for (let c = 0; c < zb.length; c++) setVisible(zb[c], v === 'main')
  setVisible(sBg, v === 'settings')
  setVisible(sEmoji, v === 'settings')
  setVisible(sLabel, v === 'settings')
  const k = v === 'ov' ? cur().q.k : ''
  for (const c of ['r', 'g', 'y']) { setVisible(ov[c], k === c); setVisible(ovS[c], k === c) }
}

/** Перерисовать то, что поменялось. */
function render(now) {
  const st = cur()
  if (view === 'main') {
    for (let i = 0; i < core.COUNT; i++) {
      const isRun = core.running(st, i)
      if (shown[i] !== isRun) {
        setVisible(idle[i], !isRun)
        setVisible(runb[i], isRun)
        shown[i] = isRun
        lastLabel[i] = ''
      }
      if (isRun) {
        const text = core.label(st, core.remaining(st, i, now))
        if (text !== lastLabel[i]) {
          const p = cellXY(i)
          setBtn(runb[i], p.x, p.y, G.cell, G.cell, text, WHITE)
          lastLabel[i] = text
        }
      }
    }
  } else if (view === 'ov') {
    const k = st.q.k
    const text = core.clock(core.ovLeft(st, now))
    if (k + text !== lastOv && ov[k]) {
      setBtn(ov[k], 0, 0, OV_W, G.h, text, OV_FG[k])
      lastOv = k + text
    }
  }
}

function updateValLabel() {
  setBtn(sLabel, CX - 170, setTop() + SET_LABEL_DY, 340, 90, ST.val + ' мин', WHITE)
}

/** Поставить на места всё, что зависит от высоты рабочей области (после смены вида на телефоне). */
function applyLayout() {
  G = geometry()
  layV++
  for (let i = 0; i < core.COUNT; i++) { const p = cellXY(i); moveBtn(idle[i], p.x, p.y, G.cell, G.cell) }
  for (let c = 0; c < zb.length; c++) { const z = zoneRect(c); moveBtn(zb[c], z.x, z.y, z.w, z.h) }
  // экран настройки
  moveBtn(sBg, 0, 0, G.w, G.h)
  moveBtn(sEmoji, CX - 60, setTop(), 120, 120)
  moveBtn(sLabel, CX - 170, setTop() + SET_LABEL_DY, 340, 90)
  // экран подарков
  const gt = giftTop()
  moveBtn(gBg, 0, 0, G.w, G.h)
  for (let r = 0; r < 2; r++) {
    for (let j = 0; j < hearts[r].length; j++) {
      moveBtn(hearts[r][j].b, Math.round(CX + hearts[r][j].off * HSTEP - HSZ / 2), gt + r * HROW, HSZ, HSZ)
    }
  }
  moveBtn(gGift, CX - GFT_SZ / 2, gt + GFT_DY, GFT_SZ, GFT_SZ)
  moveBtn(gLabel, CX - 60, gt + GL_DY, 120, 40)
  // цветные таймеры
  for (const c of ['r', 'g', 'y']) { moveBtn(ov[c], 0, 0, OV_W, G.h); moveBtn(ovS[c], OV_W, 0, G.w - OV_W, G.h) }
  lastLabel = []
  lastOv = ''
  lastQ = ''
  lastG = ''
  if (view === 'settings') updateValLabel()
  renderQueue()
  renderGift()
  render(Date.now())
}

/** Перезапуск страницы (после смены «скрывать полоску»: рабочая область меняется, всё кладётся заново). */
function reloadPage() {
  try {
    const o = { url: 'page/index' }
    if (launch) o.param = launch
    replace(o)
  } catch (e) { applyLayout() }
}

/** Вид с телефона: { h, hide, vib, y0, y1, y2 }. Сохраняем и применяем; что не поменялось — не трогаем. */
function setView(v) {
  if (!v) return
  const nv = lay.cleanView(v)
  const barChanged = nv.hide !== LV.hide
  const layoutChanged = nv.h !== LV.h || nv.y0 !== LV.y0 || nv.y1 !== LV.y1 || nv.y2 !== LV.y2
  if (!barChanged && !layoutChanged && nv.vib === LV.vib) return
  LV = nv
  try { store.setItem('vw', JSON.stringify(nv)) } catch (e) { /* не критично */ }
  if (!barChanged && !layoutChanged) return   // поменялась только вибрация — перекладывать нечего
  applyBar()
  if (barChanged) reloadPage()
  else applyLayout()
}

function openSettings() {
  enterView('settings')
  updateValLabel()
}

function closeSettings() {
  save()
  enterView('main')
  render(Date.now())
}

function openGift() {
  enterView('gift')
  if (me) { try { me.syncPhone(true) } catch (e) { /* не критично */ } }   // свежее число 🎁 и ❤️
}

function closeGift() {
  enterView('main')
  render(Date.now())
}

/** Нажатие на 🩸 на экране настройки: 60 -> 45 -> 30 -> 15 -> 60. */
function cycleVal() {
  const v = core.nextVal(ST.val)
  ST.val = v
  save()
  updateValLabel()
}

/** Будильники на моменты окончания: разбудят приложение, если экран погас. */
function scheduleAlarms(now) {
  if (!USE_ALARM) return
  try {
    const old = JSON.parse(store.getItem('alarms', '[]'))
    for (let k = 0; k < old.length; k++) { try { alarmCancel(old[k]) } catch (e) { /* уже сработал */ } }
  } catch (e) { /* нет старых */ }
  const ids = []
  const due = core.nextDue(cur())
  // номер поколения: служба сверяет его с сохранённым и молчит, если будильники уже переставлены
  const gen = String(now % 1000000000)
  try { store.setItem('gen', gen) } catch (e) { /* не критично */ }
  const every = Math.round(core.fullMs(cur()) / 1000)
  for (let k = 0; k < due.length; k++) {
    const delay = Math.max(1, Math.ceil((due[k].t - now) / 1000) + 1)
    // 1) служба: вибрирует (работает при погасшем экране) и для занятий сама ставит следующий будильник
    try {
      const id = alarmSet({ url: 'app-service/alarm', param: due[k].kind + '|' + gen + '|' + every, delay: delay })
      if (id) ids.push(id)
    } catch (e) { /* без службы */ }
    // 2) страница: открывается чуть позже, считает и отправляет событие на телефон
    try {
      const id = alarmSet({ url: 'page/index', param: 'alarm', delay: delay + 3 })
      if (id) ids.push(id)
    } catch (e) { /* без страницы */ }
  }
  try { store.setItem('alarms', JSON.stringify(ids)) } catch (e) { /* не критично */ }
}

function keepAwake() {
  if (!KEEP_AWAKE || !core.anyRunning(cur())) return
  try { setPageBrightTime({ brightTime: 120000 }) } catch (e) { /* не критично */ }
  try { pauseDropWristScreenOff({ duration: 600000 }) } catch (e) { /* не критично */ }
}

/** Свайпы больше ничего не открывают и не закрывают (всё делается долгими нажатиями). Единственное, что здесь осталось, —
 *  защита от случайного выхода из приложения: пока что-то идёт, идёт создание очереди или открыт любой экран, кроме главного, свайп гасится.
 *  Когда главный экран пуст, свайп гасится тоже (как и раньше), если SWIPE_EXIT_IDLE = false.
 *  true — «система, не обрабатывай». */
function onSwipe(e) {
  if (view !== 'main' || creating || slotMode || core.anyRunning(cur())) return true
  return !SWIPE_EXIT_IDLE
}

/** Пока идёт таймер, выйти из приложения нельзя: гасим кнопки (true — «система, не обрабатывай»). */
function blockExit() {
  try {
    inter.onGesture({
      callback: function (e) {
        const swipe = e === inter.GESTURE_RIGHT || e === inter.GESTURE_LEFT || e === inter.GESTURE_UP || e === inter.GESTURE_DOWN
        if (!swipe) return false
        return guard('жест', () => onSwipe(e))
      }
    })
  } catch (e) { /* без обработки жестов */ }
  try {
    inter.onKey({
      callback: function (key, keyEvent) {
        if (!core.anyRunning(cur())) return false
        return key === inter.KEY_BACK || key === inter.KEY_HOME || key === inter.KEY_SELECT || key === inter.KEY_SHORTCUT
      }
    })
  } catch (e) { /* без блокировки кнопок */ }
}

/** Сообщение телефону для события из очереди отправки. */
function payloadFor(ev) {
  if (ev.k === 'q') {
    if (ev.i !== undefined) return { t: 'done', id: ev.id, e: EMOJI[ev.i], ts: ev.ts }   // серый таймер убрал 🏠 / 🍀 / 🔍: час такого занятия
    return { t: 'qtap', id: ev.id, ts: ev.ts }                                           // событие из старых версий
  }
  if (ev.k === 'g') return { t: 'gift', id: ev.id, ts: ev.ts }
  if (ev.k === 'b') return { t: 'blood', id: ev.id, e: EMOJI[ev.i], ts: ev.ts, ms: ev.ms, f: ev.f ? 1 : 0 }
  return { t: 'done', id: ev.id, e: EMOJI[ev.i], ts: ev.ts }   // событие старого вида (из прошлых версий)
}

Page(
  BasePage({
    onInit(p) {
      try { if (!ls) ls = new LocalStorage() } catch (e) { /* ошибка покажется в build */ }
      launch = typeof p === 'string' ? p : ''
      loadView()
      applyBar()   // полоска скрывается до построения экрана, чтобы страница сразу получила весь экран
    },

    build() {
      me = this
      guard('старт', () => { ls = new LocalStorage() })
      loadView()
      applyBar()
      G = guard('экран', geometry)
      guard('открытие', () => setWakeUpRelaunch({ relaunch: true }))   // при включении экрана открывается это приложение
      ST = guard('состояние', () => core.restore(store.getItem('st', ''), false, 60)) || core.newState(false, 60)
      // один раз: очередь, которая раньше приходила с телефона (и хранилась отдельно), становится очередью часов
      if (store.getItem('qmig', '') !== '1') {
        try { if (!ST.queue.length) ST.queue = core.cleanQueue(JSON.parse(store.getItem('qq', '[]'))) } catch (e) { /* пусто */ }
        try { store.setItem('qmig', '1') } catch (e) { /* не критично */ }
      }
      slots = []
      for (let k = 0; k < SLOTS; k++) slots.push([])
      try {
        const sv = JSON.parse(store.getItem('qsl', '[]'))
        for (let k = 0; k < SLOTS; k++) slots[k] = core.cleanQueue(sv[k])
      } catch (e) { /* пустые ячейки */ }
      slotMode = store.getItem('qm', '0') === '1'
      // очередь, которую собирали, когда приложение закрылось (экран гаснет — приложение откроется заново): продолжаем с того же места
      creating = store.getItem('qc', '0') === '1'
      qDraft = []
      try {
        const d = JSON.parse(store.getItem('qd', '[]'))
        for (let k = 0; k < d.length && qDraft.length < QFULL; k++) qDraft.push(String(d[k]))
      } catch (e) { qDraft = [] }
      if (creating) slotMode = false   // два режима сразу не бывают
      try {
        const g = JSON.parse(store.getItem('gs', '{}'))
        gifts = { n: Math.max(0, Math.floor(+g.n || 0)), h: Math.max(0, Math.floor(+g.h || 0)) }
      } catch (e) { gifts = { n: 0, h: 0 } }
      blockExit()
      shown = []
      lastLabel = []
      idle = []
      runb = []
      qb = []
      zb = []

      // верхняя строка — три зоны (чёрные кнопки под значками): долгое нажатие слева — создать очередь (повторно — закончить),
      // по центру — серый таймер, справа — удалить очередь.
      for (let c = 0; c < 3; c++) {
        const cc = c
        guard('зона ' + c, () => {
          const z = zoneRect(c)
          const b = createWidget(widget.BUTTON, {
            x: z.x, y: z.y, w: z.w, h: z.h, text: '', normal_color: BLACK, press_color: BLACK, radius: 0,
            click_func: () => { /* обычное нажатие ничего не делает */ },
            longpress_func: () => { guard('верхняя строка', () => this.topLong(cc)) }
          })
          setVisible(b, false)
          zb.push(b)
        })
      }

      // очередь (верхняя треть экрана): значки-кнопки стоят поверх зон, долгое нажатие на значок работает как на его зоне.
      // На каждое место по кнопке на каждое эмодзи (картинка на кнопке не меняется), показывается нужная. 🍀 в очередь не попадает.
      // qb — большие значки (один ряд, до 6), qs — маленькие (два ряда, до 12).
      qs = []
      const mk = (src, size, k, e, store2, ix) => {
        guard('очередь ' + k + '/' + e, () => {
          const b = createWidget(widget.BUTTON, {
            x: LEFT, y: 0, w: size, h: size, text: '', normal_src: src + e + '.png', press_src: src + e + '.png',
            click_func: () => { /* обычное нажатие ничего не делает */ },
            longpress_func: () => { guard('очередь', () => this.queueIconLong(ix)) }
          })
          setVisible(b, false)
          store2[k][e] = b
        })
      }
      for (let k = 0; k < lay.Q_ONE_MAX; k++) {
        qb.push([])
        for (let e = 0; e < EMOJI.length; e++) if (e !== 7) mk('q', lay.Q_SIZE, k, e, qb, k)
      }
      for (let k = 0; k < QFULL; k++) {
        qs.push([])
        for (let e = 0; e < EMOJI.length; e++) if (e !== 7) mk('m', lay.Q2_SIZE, k, e, qs, k)
      }

      for (let i = 0; i < core.COUNT; i++) {
        const k = i
        guard('кнопка ' + i, () => {
          const p = cellXY(i)
          idle.push(createWidget(widget.BUTTON, {
            x: p.x, y: p.y, w: G.cell, h: G.cell, text: '', normal_src: 'i' + i + '.png', press_src: 'i' + i + '.png',
            click_func: () => { guard('нажатие', () => this.cellTap(k)) },
            longpress_func: () => { guard('долгое', () => this.cellLong(k)) }
          }))
          // идущий таймер: только цифры на чёрном, эмодзи полностью скрыто
          const rb = createWidget(widget.BUTTON, {
            x: p.x, y: p.y, w: G.cell, h: G.cell, text: '60', text_size: G.font, color: WHITE,
            normal_color: BTN_BLACK, press_color: 0x1c1c1c, radius: 0,
            click_func: () => { guard('нажатие', () => this.cellTap(k)) },
            longpress_func: () => { guard('долгое', () => this.cellLong(k)) }
          })
          setVisible(rb, false)
          runb.push(rb)
        })
      }

      // экран настройки ценности 🩸: чёрный фон, 🩸 по центру, снизу ценность; любое нажатие меняет её, долгое — закрывает
      guard('настройка', () => {
        const cyc = () => { guard('ценность', cycleVal) }
        const close = () => { guard('закрыть', () => { lpAt = Date.now(); closeSettings() }) }
        sBg = createWidget(widget.BUTTON, {
          x: 0, y: 0, w: G.w, h: G.h, text: '', normal_color: BLACK, press_color: BLACK, radius: 0,
          click_func: cyc, longpress_func: close
        })
        sEmoji = createWidget(widget.BUTTON, {
          x: CX - 60, y: setTop(), w: 120, h: 120, text: '', normal_src: 'i2.png', press_src: 'i2.png',
          click_func: cyc, longpress_func: close
        })
        sLabel = createWidget(widget.BUTTON, {
          x: CX - 170, y: setTop() + SET_LABEL_DY, w: 340, h: 90, text: '60 мин', text_size: 56, color: WHITE,
          normal_color: BLACK, press_color: BLACK, radius: 0,
          click_func: cyc, longpress_func: close
        })
        setVisible(sBg, false)
        setVisible(sEmoji, false)
        setVisible(sLabel, false)
      })

      // экран подарков 🎁: чёрный фон, сверху ❤️, по центру большой 🎁, под ним мелкая подпись; долгое нажатие закрывает
      guard('подарки', () => {
        const none = () => { /* обычное нажатие ничего не делает */ }
        const close = () => { guard('закрыть', () => { lpAt = Date.now(); closeGift() }) }
        gBg = createWidget(widget.BUTTON, {
          x: 0, y: 0, w: G.w, h: G.h, text: '', normal_color: BLACK, press_color: BLACK, radius: 0,
          click_func: none, longpress_func: close
        })
        const gt = giftTop()
        for (let r = 0; r < 2; r++) {
          // положения ❤️ при любом числе в строке (1..8): смещения от центра -3.5 ... 3.5 с шагом 0.5 (целые — для нечётного
          // числа, дробные — для чётного); у каждого положения своя кнопка, показываются нужные
          for (let o2 = -7; o2 <= 7; o2++) {
            const off = o2 / 2
            if (Math.abs(off) > 3.5) continue
            const b = createWidget(widget.BUTTON, {
              x: Math.round(CX + off * HSTEP - HSZ / 2), y: gt + r * HROW, w: HSZ, h: HSZ, text: '',
              normal_src: 'h.png', press_src: 'h.png', click_func: none, longpress_func: close
            })
            setVisible(b, false)
            hearts[r].push({ off: off, b: b })
          }
        }
        gGift = createWidget(widget.BUTTON, {
          x: CX - GFT_SZ / 2, y: gt + GFT_DY, w: GFT_SZ, h: GFT_SZ, text: '', normal_src: 'g.png', press_src: 'g.png',
          click_func: none, longpress_func: close
        })
        gLabel = createWidget(widget.BUTTON, {
          x: CX - 60, y: gt + GL_DY, w: 120, h: 40, text: 'x 0', text_size: GL_SIZE, color: WHITE,
          normal_color: BLACK, press_color: BLACK, radius: 0, click_func: none, longpress_func: close
        })
        setVisible(gBg, false)
        setVisible(gGift, false)
        setVisible(gLabel, false)
      })

      // цветные таймеры на весь экран: красный, зелёный, серый; тап не делает ничего, долгое нажатие — досрочный выход.
      // Цифры стоят по центру CX (чуть левее середины экрана), справа полоса того же цвета.
      const makeOv = (kind) => {
        guard('таймер ' + kind, () => {
          const exit = () => { guard('выход', () => this.ovExit()) }
          const b = createWidget(widget.BUTTON, {
            x: 0, y: 0, w: OV_W, h: G.h, text: '', text_size: 110, color: OV_FG[kind],
            normal_color: OV_BG[kind], press_color: OV_BG[kind], radius: 0,
            click_func: () => { /* обычное нажатие ничего не делает */ },
            longpress_func: exit
          })
          const strip = createWidget(widget.BUTTON, {
            x: OV_W, y: 0, w: G.w - OV_W, h: G.h, text: '',
            normal_color: OV_BG[kind], press_color: OV_BG[kind], radius: 0,
            click_func: () => { /* обычное нажатие ничего не делает */ },
            longpress_func: exit
          })
          setVisible(b, false)
          setVisible(strip, false)
          ov[kind] = b
          ovS[kind] = strip
        })
      }
      makeOv('r')
      makeOv('g')
      makeOv('y')

      guard('экран старта', () => enterView(core.overlayActive(cur()) ? 'ov' : 'main'))
      applyBar()   // ещё раз после построения: прокрутка заблокирована при любом размере содержимого
      const now = Date.now()
      guard('запуск', () => this.settle(core.process(cur(), now), now))   // то, что закончилось, пока приложение было закрыто
      if (launch === 'alarm') { try { setPageBrightTime({ brightTime: 20000 }) } catch (e) { /* не критично */ } }
      guard('телефон', () => this.syncPhone())   // при каждом включении экрана приложение открывается заново — это и есть обновление данных
      timer = setInterval(() => { guard('секунда', () => this.tick()) }, 1000)
    },

    onDestroy() {
      if (timer) { clearInterval(timer); timer = null }
      save()
    },

    /** Всё, что нужно сделать после любого изменения состояния. */
    settle(res, now) {
      if (res.fresh) signalHour()
      if (res.ovDone && res.ovFresh) signalHour()          // конец цветного таймера — та же вибрация, что в конце занятия
      if (res.ovDone && view === 'ov') enterView('main')   // закончившийся цветной таймер закрывается сам, приложение остаётся
      save()
      scheduleAlarms(now)
      keepAwake()
      renderQueue()   // в конце промежутка занятие убирается из очереди
      render(now)
      this.sendDue(now)
    },

    tick() {
      const now = Date.now()
      ticks++
      const res = core.process(cur(), now)
      if (res.events.length || res.ovDone) {
        this.settle(res, now)
      } else {
        render(now)
        this.sendDue(now)
        if (ticks % 60 === 0) keepAwake()   // постоянного опроса телефона нет: очередь и подарки обновляются при включении экрана (см. build)
      }
    },

    cellTap(i) {
      const now = Date.now()
      if (now - lpAt < 800 || view !== 'main') return
      if (i === lpCell && now - lpCellAt < 2000) return   // отпускание пальца после долгого нажатия на этой же кнопке
      if (creating) { this.addToQueue(EMOJI[i]); return }   // при создании очереди кнопки занятий добавляют занятие в очередь
      if (slotMode) { this.slotTap(i); return }              // в режиме сохранённых очередей — загружают очередь
      this.settle(core.toggle(cur(), i, now), now)
    },

    /** Долгое нажатие на кнопку занятия. Обычный режим — по столбцам:
     *  верхний ряд (🤿 🎨 🩸): слева экран подарков, по центру зелёный таймер, справа настройка ценности 🩸;
     *  нижний ряд (📖 🧬 💀): 📖 — случайная очередь, по центру красный таймер, 💀 — режим сохранённых очередей.
     *  Экраны подарков и настройки, случайная очередь и режим сохранённых очередей — только когда ничего не идёт.
     *  Создание очереди: 📖 добавляет 🏠, 💀 добавляет 🔍, остальные — ничего.
     *  Режим сохранённых очередей: 🤿 🎨 🩸 📖 🧬 сохраняют текущую очередь, 💀 — выход. */
    cellLong(i) {
      const now = Date.now()
      lpCell = i
      lpCellAt = now
      if (!creating && !slotMode) lpAt = now   // в режимах очереди экран не меняется, и следующие нажатия на другие кнопки не должны теряться
      if (view !== 'main') return
      if (creating) {
        if (i === 3) this.addToQueue(EMOJI[6])        // 📖 -> 🏠
        else if (i === 5) this.addToQueue(EMOJI[8])   // 💀 -> 🔍
        return
      }
      if (slotMode) { this.slotLong(i); return }
      const c = i % 3
      const free = !core.anyRunning(cur())
      if (i < 3) {
        if (c === 1) this.startOv('g')
        else if (free) { if (c === 0) openGift(); else openSettings() }
      } else {
        if (c === 1) this.startOv('r')
        else if (free) { if (i === 3) this.randomQueue(); else this.beginSlots() }
      }
    },

    /** Долгое нажатие на значок очереди: то же, что на зону, в которой он стоит. */
    queueIconLong(k) {
      const cx = qCx[k]
      if (cx === undefined) return
      this.topLong(lay.zoneOf(cx, ZE))
    },

    /** Долгое нажатие на верхнюю строку: 0 — слева (создать очередь / закончить создание), 1 — центр (серый таймер),
     *  2 — справа (удалить очередь; во время создания — сбросить собранное). В режиме сохранённых очередей верхняя строка молчит. */
    topLong(c) {
      if (view !== 'main' || slotMode) return   // lpAt не трогаем: отпускание пальца попадает в ту же зону и ничего не делает, а следующие нажатия не должны теряться
      if (c === 0) { if (creating) this.finishQueue(); else this.beginQueue(); return }
      if (creating) {
        if (c === 2) { qDraft = []; saveDraft(); renderQueue(); feedback('mode') }
        return
      }
      if (c === 1) this.startOv('y')
      else this.deleteQueue()
    },

    /** Начать создание очереди (только когда ничего не идёт). Текущая очередь остаётся, пока новая не закончена. */
    beginQueue() {
      if (core.anyRunning(cur())) return
      creating = true
      qDraft = []
      saveDraft()
      renderQueue()
      feedback('mode')
    },

    addToQueue(e) {
      if (!creating || qDraft.length >= QFULL) return
      qDraft.push(e)
      saveDraft()
      renderQueue()
      feedback('tick')
    },

    /** Закончить создание: собранная очередь становится текущей. Пустая — ничего не меняет. */
    finishQueue() {
      const draft = qDraft
      creating = false
      qDraft = []
      saveDraft()
      if (draft.length) {
        ST.queue = core.cleanQueue(draft)
        save()
      }
      renderQueue()
      feedback('mode')
    },

    /** Удалить текущую очередь. */
    deleteQueue() {
      ST.queue = []
      save()
      renderQueue()
      feedback('mode')
    },

    /** Случайная очередь из шести занятий (📖🧬💀🤿🎨🩸🏠🔍, два одинаковых подряд не бывает) вместо текущей. */
    randomQueue() {
      if (core.anyRunning(cur())) return
      ST.queue = core.randomQueue()
      save()
      renderQueue()
      feedback('mode')
    },

    /** Войти в режим сохранённых очередей (только когда ничего не идёт). */
    beginSlots() {
      if (core.anyRunning(cur()) || creating) return
      slotMode = true
      saveMode()
      feedback('mode')
    },

    endSlots() {
      slotMode = false
      saveMode()
      feedback('mode')
    },

    /** Обычное нажатие в режиме сохранённых очередей: на 💀 — выход, на остальных — текущая очередь заменяется сохранённой (пустая ячейка — ничего). */
    slotTap(i) {
      if (i >= SLOTS) { this.endSlots(); return }
      if (!slots[i].length) return
      ST.queue = slots[i].slice()
      save()
      renderQueue()
      feedback('tick')
    },

    /** Долгое нажатие в режиме сохранённых очередей: на 💀 — выход, на остальных — текущая очередь сохраняется за этой кнопкой. */
    slotLong(i) {
      if (i >= SLOTS) { this.endSlots(); return }
      slots[i] = ST.queue.slice()
      saveSlots()
      feedback('mode')
    },

    startOv(kind) {
      const now = Date.now()
      const res = core.startOverlay(cur(), kind, now)
      enterView('ov')
      this.settle(res, now)
    },

    ovExit() {
      const now = Date.now()
      lpAt = now
      const r = core.exitOverlay(cur(), now)   // зелёный и при досрочном выходе шлёт «нажатие на 🎁»
      enterView('main')
      this.settle(r.res, now)
    },

    /** Спросить у телефона число 🎁 / ❤️ (и вид экрана, если телефон его присылает). Очередь занятий с телефоном больше не сверяется. */
    syncPhone(force) {
      const now = Date.now()
      if (!force && syncing && now - syncAt < 30000) return
      syncing = true
      syncAt = now
      this.request({ method: 'u613.send', params: { t: 'sync' } })
        .then((res) => {
          syncing = false
          const r = res && res.ok ? res.reply : null
          if (r && r.g) setGifts(r.g)
          if (r && r.v) guard('вид', () => setView(r.v))
        })
        .catch(() => { syncing = false })
    },

    /** Отправить телефону одно неподтверждённое событие (по одному за раз). */
    sendDue(now) {
      if (inflight && now - inflightAt < 30000) return
      const owner = ST
      const d = core.due(owner, now, SEND_GAP)
      if (!d.length) return
      const target = d[0]
      target.tried = now
      inflight = true
      inflightAt = now
      const id = target.id
      this.request({ method: 'u613.send', params: payloadFor(target) })
        .then((res) => {
          inflight = false
          const r = res && res.ok ? res.reply : null
          if (r && r.g) setGifts(r.g)
          if (r && r.v) guard('вид', () => setView(r.v))
          if (r && r.t === 'ack' && r.id === id) {
            core.ack(owner, id)
            save()
            this.sendDue(Date.now())
          }
        })
        .catch(() => { inflight = false })
    }
  })
)
