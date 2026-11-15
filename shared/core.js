/**
 * Логика таймеров для часов Amazfit (Zepp OS). Чистый JS без обращений к API часов — поэтому проверяется
 * тестами в Node (tests/core.test.mjs).
 *
 * Таймер занятия работает «равными промежутками»:
 *  - длина промежутка = «ценность 🩸» (60, 45, 30 или 15 минут; хранится на часах, меняется на экране настройки);
 *  - в конце промежутка часы вибрируют, телефону уходит событие «прошла полная ценность», таймер сразу идёт дальше;
 *  - паузы нет, есть только «стоп»: таймер обнуляется (снова равен ценности), а телефону уходит то, сколько
 *    времени успело пройти (в пересчёте на ценность — см. stopOne);
 *  - одновременно идёт только один таймер: запуск другого останавливает прежний (с отправкой пройденного времени).
 * Цветные таймеры на весь экран (обычный тап не делает ничего, досрочный выход — долгим нажатием):
 *  - красный  (k='r') 15 минут — долгое нажатие по центру нижнего ряда;
 *  - зелёный  (k='g') 60 минут — долгое нажатие по центру среднего ряда; по окончании (и при досрочном выходе)
 *    телефону уходит событие «нажатие на 🎁» (один 🎁 превращается в ❤️);
 *  - серый    (k='y') длиной в ценность 🩸 — долгое нажатие по центру верхнего ряда; по окончании из очереди убирается самый левый
 *    🏠 / 🍀 / 🔍, а телефону уходит событие «час такого занятия» (подвал, баллы). Нет такого в очереди — ничего не уходит.
 * Очередь занятий живёт ТОЛЬКО на часах (st.queue, до 12 эмодзи): в конце полного промежутка занятия из очереди убирается самое левое такое
 * занятие (очередь «свободная»). Телефон про очередь ничего не знает — ему уходят только минуты занятий.
 *  По окончании любой цветной таймер сам закрывается (экран возвращается к занятиям), приложение при этом не закрывается.
 * Тестовый режим: все промежутки и все цветные таймеры длятся 10 секунд, а телефону уходит то, как если бы
 * прошла полная ценность (чтобы проверить всю цепочку по-настоящему).
 * Всё считается по меткам времени: если приложение закрывалось, закончившиеся промежутки всё равно засчитаются.
 */
export const MIN = 60 * 1000
export const VALUES = [60, 45, 30, 15]    // варианты ценности 🩸, минут (порядок — как они переключаются по кругу)
export const TEST_LEN = 10 * 1000
export const RED_LEN = 15 * MIN
export const GREEN_LEN = 60 * MIN
export const FRESH = 20 * 1000            // событие «свежее», если случилось не раньше 20 секунд назад (тогда подаём сигнал)
export const MIN_STOP = 1000              // стоп раньше чем через секунду телефону не отправляем
export const COUNT = 6                    // шесть занятий, порядок как на экране: слева направо, сверху вниз
export const MAX_OUT = 500                // сколько неподтверждённых событий храним
export const QUEUE_MAX = 12               // сколько занятий помещается в очередь
export const QUEUE_RANDOM_LEN = 6         // длина случайной очереди

// эмодзи в порядке картинок i0..i8 / q0..q8: шесть занятий (как на экране слева направо, сверху вниз), затем 🏠 🍀 🔍
export const EMOJI = ['\u{1F93F}', '\u{1F3A8}', '\u{1FA78}', '\u{1F4D6}', '\u{1F9EC}', '\u{1F480}', '\u{1F3E0}', '\u{1F340}', '\u{1F50D}']
const GRAY_ITEMS = [EMOJI[6], EMOJI[7], EMOJI[8]]   // что убирает из очереди серый таймер
// из чего собирается случайная очередь (🍀 в очередь не попадает), у всех равный шанс
export const RANDOM_POOL = [EMOJI[3], EMOJI[4], EMOJI[5], EMOJI[0], EMOJI[1], EMOJI[2], EMOJI[6], EMOJI[8]]

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x) }
function two(n) { return n < 10 ? '0' + n : '' + n }

function cleanVal(v) {
  const n = Math.round(+v)
  return n >= 1 && n <= 600 ? n : 60
}

export function newState(test, val) {
  const run = []
  for (let i = 0; i < COUNT; i++) run.push(0)
  // q.k: '' — нет, 'r' красный, 'g' зелёный, 'y' серый; q.s: 0 — нет, 1 — идёт (закончившийся таймер сразу закрывается)
  return { v: 5, test: !!test, val: cleanVal(val || 60), run: run, q: { k: '', s: 0, run: 0 }, out: [], queue: [] }
}

/** Привести сохранённое состояние к рабочему виду (на случай пустых/старых данных). */
export function restore(text, test, val) {
  const st = newState(!!test, val)
  if (!text) return st
  try {
    const o = JSON.parse(text)
    if (o && o.run && o.run.length >= COUNT) {
      for (let i = 0; i < COUNT; i++) st.run[i] = +o.run[i] || 0
      if (o.val) st.val = cleanVal(o.val)
      if (o.q && o.q.s === 1) {
        st.q = { k: typeof o.q.k === 'string' && o.q.k ? o.q.k : 'r', s: o.q.s, run: o.q.run || 0 }
      }
      if (o.out && o.out.length !== undefined) {
        // события «новая очередь для телефона» (версия 15) больше не нужны: очередь теперь только на часах
        const keep = []
        for (let k = 0; k < o.out.length; k++) if (o.out[k] && o.out[k].k !== 'qs') keep.push(o.out[k])
        st.out = keep
      }
      st.queue = cleanQueue(o.queue)
    }
  } catch (e) { /* битые данные — начинаем с чистого состояния */ }
  return st
}

/** Следующая ценность по кругу 60 -> 45 -> 30 -> 15 -> 60. */
export function nextVal(v) {
  const k = VALUES.indexOf(v)
  return VALUES[(k + 1) % VALUES.length]
}

/** Ценность 🩸 в миллисекундах: столько «набегает» занятию за полный промежуток. */
export function valueMs(st) { return st.val * MIN }

/** Реальная длина промежутка, мс (в тестовом режиме 10 секунд). */
export function fullMs(st) { return st.test ? TEST_LEN : st.val * MIN }

/** Длина цветного таймера, мс. */
export function ovLen(st) {
  if (st.test) return TEST_LEN
  if (st.q.k === 'g') return GREEN_LEN
  if (st.q.k === 'y') return st.val * MIN
  return RED_LEN
}

export function running(st, i) { return st.run[i] > 0 }

/** Цветной таймер на экране (пока идёт). */
export function overlayActive(st) { return st.q.s !== 0 }

/** Остаток промежутка занятия, мс (может быть ≤ 0, если срабатывание ещё не обработано). */
export function remaining(st, i, now) {
  return st.run[i] > 0 ? fullMs(st) - (now - st.run[i]) : fullMs(st)
}

export function anyRunning(st) {
  for (let i = 0; i < COUNT; i++) if (st.run[i] > 0) return true
  return st.q.s === 1
}

/** Сколько осталось на цветном таймере, мс. */
export function ovLeft(st, now) {
  if (st.q.s !== 1) return 0
  const len = ovLen(st)
  return clamp(len - (now - st.q.run), 0, len)
}

/** Очередь из чего угодно: только известные эмодзи (без 🍀), не больше QUEUE_MAX. */
export function cleanQueue(a) {
  const out = []
  if (!a || a.length === undefined) return out
  for (let k = 0; k < a.length && out.length < QUEUE_MAX; k++) {
    const e = String(a[k])
    if (EMOJI.indexOf(e) >= 0 && e !== EMOJI[7]) out.push(e)
  }
  return out
}

/** Убрать из очереди самый левый элемент из [targets]. Возвращает убранный эмодзи или null. */
export function queueTake(st, targets) {
  for (let k = 0; k < st.queue.length; k++) {
    if (targets.indexOf(st.queue[k]) >= 0) {
      const gone = st.queue[k]
      st.queue.splice(k, 1)
      return gone
    }
  }
  return null
}

/**
 * Случайная очередь из QUEUE_RANDOM_LEN занятий: два одинаковых подряд не бывает, повторы не подряд — бывают.
 * Каждое следующее выбирается поровну из всех, кроме предыдущего. [rnd] — источник случайных чисел [0, 1) (для проверки в тестах).
 */
export function randomQueue(rnd) {
  const f = rnd || Math.random
  const out = []
  while (out.length < QUEUE_RANDOM_LEN) {
    const last = out.length ? out[out.length - 1] : ''
    const alt = []
    for (let k = 0; k < RANDOM_POOL.length; k++) if (RANDOM_POOL[k] !== last) alt.push(RANDOM_POOL[k])
    out.push(alt[Math.min(alt.length - 1, Math.floor(f() * alt.length))])
  }
  return out
}

/**
 * Обработать сработавшее. Возвращает { events, fresh, ovDone, ovFresh, ovKind }.
 * Закончившийся цветной таймер закрывается сам (ovDone = true, ovKind — каким он был).
 * Новые события добавляются и в st.out (очередь на отправку телефону, пока не придёт подтверждение).
 */
export function process(st, now) {
  const events = []
  let fresh = false
  const full = fullMs(st)
  for (let i = 0; i < COUNT; i++) {
    const s = st.run[i]
    if (s <= 0) continue
    if (now - s < full) continue
    let t = s + full
    let count = 0
    while (t <= now && count < 24) {
      const ev = { id: 'b' + i + '-' + t, k: 'b', i: i, ts: t, ms: valueMs(st), f: 1, x: st.test ? 1 : 0, tried: 0 }
      events.push(ev)
      st.out.push(ev)
      queueTake(st, [EMOJI[i]])   // занятие в очереди выполнено: самое левое такое убирается
      if (now - t <= FRESH) fresh = true
      t += full
      count++
    }
    st.run[i] = count >= 24 ? now : t - full   // новый промежуток начался в момент последнего срабатывания
  }

  let ovDone = false
  let ovFresh = false
  let ovKind = ''
  if (st.q.s === 1) {
    const len = ovLen(st)
    if (now - st.q.run >= len) {
      const at = st.q.run + len
      ovKind = st.q.k
      ovDone = true
      ovFresh = now - at <= FRESH
      if (ovKind === 'y') {
        const gone = queueTake(st, GRAY_ITEMS)   // серый таймер убирает самый левый 🏠 / 🍀 / 🔍; нет такого — ничего не отправляем
        if (gone) {
          const ev = { id: 'q-' + at, k: 'q', i: EMOJI.indexOf(gone), ts: at, x: st.test ? 1 : 0, tried: 0 }
          events.push(ev)
          st.out.push(ev)
        }
      } else if (ovKind === 'g') {
        const ev = { id: 'g-' + at, k: 'g', ts: at, x: st.test ? 1 : 0, tried: 0 }
        events.push(ev)
        st.out.push(ev)
      }
      st.q = { k: '', s: 0, run: 0 }
    }
  }
  if (st.out.length > MAX_OUT) st.out = st.out.slice(st.out.length - MAX_OUT)
  return { events: events, fresh: fresh, ovDone: ovDone, ovFresh: ovFresh, ovKind: ovKind }
}

/** Остановить занятие [i]: обнулить и поставить в очередь отправки пройденное время (в пересчёте на ценность). */
function stopOne(st, i, now) {
  const s = st.run[i]
  if (s <= 0) return null
  st.run[i] = 0
  const el = now - s
  if (el < MIN_STOP) return null
  const ms = Math.round(el / fullMs(st) * valueMs(st))
  const ev = { id: 'b' + i + '-s' + now, k: 'b', i: i, ts: now, ms: ms, f: 0, x: st.test ? 1 : 0, tried: 0 }
  st.out.push(ev)
  return ev
}

/** Нажатие на кнопку занятия: запуск / стоп. Запуск останавливает любой другой идущий таймер. */
export function toggle(st, i, now) {
  const res = process(st, now)
  if (st.run[i] > 0) {
    stopOne(st, i, now)
  } else {
    for (let k = 0; k < COUNT; k++) if (k !== i) stopOne(st, k, now)
    st.q = { k: '', s: 0, run: 0 }
    st.run[i] = now
  }
  return res
}

/** Запустить цветной таймер ('r' красный, 'g' зелёный, 'y' серый); идущее занятие останавливается. */
export function startOverlay(st, kind, now) {
  const res = process(st, now)
  if (st.q.s !== 0) return res
  for (let k = 0; k < COUNT; k++) stopOne(st, k, now)
  st.q = { k: kind, s: 1, run: now }
  return res
}

/** Закрыть цветной таймер, ничего не отправляя. */
export function endOverlay(st) {
  st.q = { k: '', s: 0, run: 0 }
}

/**
 * Досрочный выход из цветного таймера (долгое нажатие). Зелёный и в этом случае шлёт телефону «нажатие на 🎁»;
 * серый и красный — ничего. Возвращает событие или null.
 */
export function exitOverlay(st, now) {
  const res = process(st, now)           // вдруг он уже закончился — тогда событие уже создано
  let ev = null
  if (st.q.s === 1 && st.q.k === 'g') {
    ev = { id: 'g-e' + now, k: 'g', ts: now, x: st.test ? 1 : 0, tried: 0 }
    st.out.push(ev)
  }
  st.q = { k: '', s: 0, run: 0 }
  return { res: res, ev: ev }
}

/** Подтверждение от телефона: событие больше не нужно отправлять. */
export function ack(st, id) {
  const n = []
  let removed = false
  for (let k = 0; k < st.out.length; k++) {
    if (st.out[k].id === id) removed = true
    else n.push(st.out[k])
  }
  st.out = n
  return removed
}

/** События, которые пора (пере)отправить: прошло не меньше [gap] мс с прошлой попытки. */
export function due(st, now, gap) {
  const r = []
  for (let k = 0; k < st.out.length; k++) {
    if (now - (st.out[k].tried || 0) >= gap) r.push(st.out[k])
  }
  return r
}

/** Метка на кнопке занятия: минуты вверх (до ценности), в тестовом режиме — секунды. */
export function label(st, ms) {
  if (st.test) return '' + clamp(Math.ceil(ms / 1000), 1, Math.round(TEST_LEN / 1000))
  return '' + clamp(Math.ceil(ms / MIN), 1, st.val)
}

/** «мм:сс» (секунды вверх, как у обычного таймера: 15:00 -> 14:59 -> ... -> 00:01 -> 00:00). */
export function clock(ms) {
  const s = Math.ceil(clamp(ms, 0, GREEN_LEN) / 1000)
  return two(Math.floor(s / 60)) + ':' + two(s % 60)
}

/** Моменты, когда что-то закончится (для будильников): [{ t, kind }]. */
export function nextDue(st) {
  const r = []
  const full = fullMs(st)
  for (let i = 0; i < COUNT; i++) if (st.run[i] > 0) r.push({ t: st.run[i] + full, kind: 'hour' })
  if (st.q.s === 1) r.push({ t: st.q.run + ovLen(st), kind: 'quick' })
  return r
}
