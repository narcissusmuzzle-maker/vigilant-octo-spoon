import assert from 'node:assert'
import * as core from '../shared/core.js'

const T = 1000000   // run=0 означает «не идёт», поэтому время в тестах начинаем не с нуля
const M = 60000
let n = 0
function t(name, f) { f(); n++; console.log('ok  ' + name) }

t('шесть занятий, ценность по умолчанию 60', () => {
  assert.equal(core.COUNT, 6)
  assert.equal(core.newState(false).val, 60)
})

t('ценность переключается по кругу 60 -> 45 -> 30 -> 15 -> 60', () => {
  assert.equal(core.nextVal(60), 45)
  assert.equal(core.nextVal(45), 30)
  assert.equal(core.nextVal(30), 15)
  assert.equal(core.nextVal(15), 60)   // круг 60 -> 45 -> 30 -> 15 -> 60
  assert.equal(core.nextVal(77), 60)   // неизвестное значение — начинаем с начала списка
})

t('промежуток = ценность: событие через 30 минут, вибрация, отсчёт идёт дальше', () => {
  const st = core.newState(false, 30)
  core.toggle(st, 0, T)
  assert.equal(core.label(st, core.remaining(st, 0, T)), '30')
  assert.equal(core.process(st, T + 29 * M).events.length, 0)
  const r = core.process(st, T + 30 * M)
  assert.equal(r.events.length, 1)
  assert.equal(r.fresh, true)
  const ev = r.events[0]
  assert.equal(ev.k, 'b'); assert.equal(ev.f, 1); assert.equal(ev.ms, 30 * M)
  assert.equal(ev.id, 'b0-' + (T + 30 * M))
  assert.equal(core.running(st, 0), true)
  assert.equal(core.remaining(st, 0, T + 30 * M), 30 * M)   // сразу пошёл следующий промежуток
})

t('экран был выключен: пропущенные промежутки засчитываются с настоящим временем', () => {
  const st = core.newState(false, 45)
  core.toggle(st, 2, T)
  const r = core.process(st, T + 100 * M)           // прошло 2 промежутка и ещё 10 минут
  assert.equal(r.events.length, 2)
  assert.equal(r.events[1].ts, T + 90 * M)
  assert.equal(r.fresh, false)                      // давно — не вибрируем
  assert.equal(core.remaining(st, 2, T + 100 * M), 35 * M)
})

t('стоп: таймер обнуляется, на телефон уходит пройденное время', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 1, T)
  core.toggle(st, 1, T + 20 * M)                    // нажали ещё раз — стоп
  assert.equal(core.running(st, 1), false)
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].ms, 20 * M)
  assert.equal(st.out[0].f, 0)
  assert.equal(core.label(st, core.remaining(st, 1, T + 21 * M)), '60')   // снова равен ценности
})

t('стоп раньше секунды ничего не отправляет', () => {
  const st = core.newState(false)
  core.toggle(st, 1, T)
  core.toggle(st, 1, T + 500)
  assert.equal(st.out.length, 0)
})

t('запуск другого занятия останавливает прежнее и отправляет пройденное', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 0, T)
  core.toggle(st, 4, T + 12 * M)
  assert.equal(core.running(st, 0), false)
  assert.equal(core.running(st, 4), true)
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].i, 0)
  assert.equal(st.out[0].ms, 12 * M)
})

t('стоп сначала учитывает завершившийся промежуток', () => {
  const st = core.newState(false, 30)
  core.toggle(st, 3, T)
  core.toggle(st, 3, T + 40 * M)                    // 30 минут уже прошло, 10 — следующего
  assert.equal(st.out.length, 2)
  assert.equal(st.out[0].f, 1)
  assert.equal(st.out[1].ms, 10 * M)
})

t('тест: промежуток 10 секунд, но телефону уходит полная ценность', () => {
  const st = core.newState(true, 45)
  core.toggle(st, 2, T)
  assert.equal(core.label(st, core.remaining(st, 2, T)), '10')
  assert.equal(core.label(st, core.remaining(st, 2, T + 4200)), '6')
  const r = core.process(st, T + 10000)
  assert.equal(r.events.length, 1)
  assert.equal(r.events[0].ms, 45 * M)
  assert.equal(r.events[0].x, 1)
  // стоп на половине теста — половина ценности
  core.toggle(st, 2, T + 15000)
  assert.equal(st.out[st.out.length - 1].ms, Math.round(22.5 * M))
})

t('красный 15:00, зелёный 60:00, серый = ценность', () => {
  const st = core.newState(false, 30)
  core.startOverlay(st, 'r', T)
  assert.equal(core.clock(core.ovLeft(st, T)), '15:00')
  assert.equal(core.nextDue(st)[0].t, T + 15 * M)
  core.endOverlay(st)
  core.startOverlay(st, 'g', T)
  assert.equal(core.clock(core.ovLeft(st, T)), '60:00')
  core.endOverlay(st)
  core.startOverlay(st, 'y', T)
  assert.equal(core.clock(core.ovLeft(st, T)), '30:00')
  assert.equal(core.clock(core.ovLeft(st, T + 5000)), '29:55')
})

t('тест: все цветные таймеры по 10 секунд', () => {
  for (const k of ['r', 'g', 'y']) {
    const st = core.newState(true, 60)
    core.startOverlay(st, k, T)
    assert.equal(core.clock(core.ovLeft(st, T)), '00:10')
  }
})

t('красный по окончании событий не шлёт и сам закрывается', () => {
  const st = core.newState(false)
  core.startOverlay(st, 'r', T)
  const r = core.process(st, T + 15 * M)
  assert.equal(r.ovDone, true)
  assert.equal(r.ovFresh, true)
  assert.equal(r.ovKind, 'r')
  assert.equal(st.out.length, 0)
  assert.equal(core.anyRunning(st), false)
  assert.equal(core.overlayActive(st), false)       // экран закрылся сам, 00:00 не остаётся
  assert.equal(core.process(st, T + 16 * M).ovDone, false)   // и второй раз не срабатывает
})

t('зелёный по окончании шлёт «нажатие на 🎁» и закрывается', () => {
  const st = core.newState(false)
  core.startOverlay(st, 'g', T)
  assert.equal(core.process(st, T + 59 * M).events.length, 0)
  const r = core.process(st, T + 60 * M)
  assert.equal(r.ovDone, true)
  assert.equal(r.ovKind, 'g')
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].k, 'g')
  assert.equal(st.out[0].id, 'g-' + (T + 60 * M))
  assert.equal(core.overlayActive(st), false)
})

t('зелёный, закрытый досрочно, тоже шлёт «нажатие на 🎁»; красный и серый — нет', () => {
  const st = core.newState(false, 30)
  core.startOverlay(st, 'g', T)
  const r = core.exitOverlay(st, T + 5 * M)
  assert.equal(r.ev.k, 'g')
  assert.equal(st.out.length, 1)
  assert.equal(core.overlayActive(st), false)
  for (const k of ['r', 'y']) {
    const s2 = core.newState(false, 30)
    core.startOverlay(s2, k, T)
    assert.equal(core.exitOverlay(s2, T + 5 * M).ev, null)
    assert.equal(s2.out.length, 0)
  }
  // зелёный уже закончился, но приложение не успело обработать: событие одно, не два
  const s3 = core.newState(false)
  core.startOverlay(s3, 'g', T)
  core.exitOverlay(s3, T + 61 * M)
  assert.equal(s3.out.length, 1)
})

t('серый по окончании убирает самый левый 🏠/🍀/🔍 из очереди и шлёт час такого занятия', () => {
  const st = core.newState(false, 30)
  st.queue = ['🩸', '🔍', '🏠']
  core.startOverlay(st, 'y', T)
  assert.equal(core.process(st, T + 29 * M).events.length, 0)
  const r = core.process(st, T + 30 * M)
  assert.equal(r.ovDone, true)
  assert.equal(st.out.length, 1)
  assert.equal(st.out[0].k, 'q')
  assert.equal(core.EMOJI[st.out[0].i], '🔍')           // самый левый из 🏠🍀🔍 — это 🔍, а не 🏠
  assert.deepEqual(st.queue, ['🩸', '🏠'])
  // в очереди нет ни 🏠, ни 🍀, ни 🔍 — таймер закончился, но телефону слать нечего
  const st3 = core.newState(false, 30)
  st3.queue = ['🩸', '📖']
  core.startOverlay(st3, 'y', T)
  assert.equal(core.process(st3, T + 30 * M).ovDone, true)
  assert.equal(st3.out.length, 0)
  assert.deepEqual(st3.queue, ['🩸', '📖'])
  // закрыли раньше времени — ничего не отправляется
  const st2 = core.newState(false, 30)
  core.startOverlay(st2, 'y', T)
  core.endOverlay(st2)
  core.process(st2, T + 60 * M)
  assert.equal(st2.out.length, 0)
})

t('запуск цветного таймера останавливает идущее занятие', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 5, T)
  core.startOverlay(st, 'r', T + 7 * M)
  assert.equal(core.running(st, 5), false)
  assert.equal(st.out[0].ms, 7 * M)
  assert.equal(core.anyRunning(st), true)
})

t('подтверждение и повторная отправка', () => {
  const st = core.newState(false, 60)
  core.toggle(st, 0, T)
  core.process(st, T + 60 * M)
  assert.equal(core.due(st, T + 60 * M, 15000).length, 1)
  st.out[0].tried = T + 60 * M
  assert.equal(core.due(st, T + 60 * M + 1000, 15000).length, 0)
  assert.equal(core.due(st, T + 60 * M + 16000, 15000).length, 1)
  assert.equal(core.ack(st, st.out[0].id), true)
  assert.equal(st.out.length, 0)
})

t('сохранение и восстановление (в том числе старое сохранение v3)', () => {
  const st = core.newState(false, 45)
  core.toggle(st, 1, T + 100)
  core.startOverlay(core.newState(false), 'g', T)
  const back = core.restore(JSON.stringify(st), false, 60)
  assert.equal(back.val, 45)
  assert.equal(back.run[1], T + 100)
  const old = core.restore(JSON.stringify({ v: 3, rem: [1, 2, 3, 4, 5, 6, 7, 8, 9], run: [0, 0, T, 0, 0, 0, 0, 0, 0], hold: -1, q: { s: 1, run: T }, out: [{ id: '0-5', i: 0, ts: 5 }] }), false, 60)
  assert.equal(old.run[2], T)
  assert.equal(old.q.k, 'r')
  assert.equal(old.out.length, 1)
  const done = core.restore(JSON.stringify({ v: 4, run: [0, 0, 0, 0, 0, 0], q: { k: 'r', s: 2, run: T } }), false, 60)
  assert.equal(core.overlayActive(done), false)    // закончившийся таймер из прошлой версии не возвращается
  assert.equal(core.restore('мусор', false, 30).val, 30)
  assert.equal(core.restore('', true, 60).test, true)
})

t('очередь: в конце полного промежутка убирается самое левое такое занятие (в том числе при нескольких промежутках за раз)', () => {
  const st = core.newState(false, 30)
  st.queue = ['🩸', '🤿', '🩸', '🩸', '🤿']
  core.toggle(st, 2, T)                                   // 🩸
  core.process(st, T + 30 * M)
  assert.deepEqual(st.queue, ['🤿', '🩸', '🩸', '🤿'])
  core.process(st, T + 90 * M)                            // приложение было закрыто: прошло ещё два промежутка
  assert.deepEqual(st.queue, ['🤿', '🤿'])
  core.process(st, T + 120 * M)                           // 🩸 в очереди больше нет — очередь не трогается, событие уходит
  assert.deepEqual(st.queue, ['🤿', '🤿'])
  assert.equal(st.out.length, 4)
  // стоп раньше конца промежутка очередь не меняет
  const s2 = core.newState(false, 60)
  s2.queue = ['🧬']
  core.toggle(s2, 4, T)
  core.toggle(s2, 4, T + 20 * M)
  assert.deepEqual(s2.queue, ['🧬'])
})

t('очередь хранится вместе с состоянием, чистится от лишнего и не длиннее 12', () => {
  const st = core.newState(false, 60)
  st.queue = ['🩸', '🏠', '🔍']
  const back = core.restore(JSON.stringify(st), false, 60)
  assert.deepEqual(back.queue, ['🩸', '🏠', '🔍'])
  assert.deepEqual(core.cleanQueue(['🩸', '🍀', 'x', 5, '💀']), ['🩸', '💀'])   // 🍀 и мусор не попадают
  assert.equal(core.cleanQueue(new Array(30).fill('🩸')).length, 12)
  assert.deepEqual(core.cleanQueue(undefined), [])
  // события «новая очередь» из версии 15 при загрузке выбрасываются, остальные остаются
  const old = core.newState(false, 60)
  old.out = [{ id: 'qs-1', k: 'qs', ts: T, q: ['🩸'], tried: 0 }, { id: 'g-1', k: 'g', ts: T, tried: 0 }]
  const r = core.restore(JSON.stringify(old), false, 60)
  assert.deepEqual(r.out.map((e) => e.id), ['g-1'])
})

t('случайная очередь: 6 занятий из восьми, не бывает двух одинаковых подряд, у всех равные шансы', () => {
  assert.deepEqual(core.RANDOM_POOL.slice().sort(), ['🏠', '🔍', '🤿', '🎨', '🩸', '📖', '🧬', '💀'].sort())
  const count = {}
  const firstCount = {}
  let seed = 12345
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const N = 40000
  for (let k = 0; k < N; k++) {
    const q = core.randomQueue(rnd)
    assert.equal(q.length, 6)
    for (let i = 0; i < 6; i++) {
      assert.ok(core.RANDOM_POOL.includes(q[i]))
      if (i > 0) assert.notEqual(q[i], q[i - 1])
      count[q[i]] = (count[q[i]] || 0) + 1
    }
    firstCount[q[0]] = (firstCount[q[0]] || 0) + 1
  }
  // равные шансы: каждое эмодзи встречается примерно в 1/8 мест (допуск 4%), и повторы не подряд случаются
  for (const e of core.RANDOM_POOL) {
    assert.ok(Math.abs(count[e] / (N * 6) - 1 / 8) < 0.005, e + ' ' + count[e])
    assert.ok(Math.abs(firstCount[e] / N - 1 / 8) < 0.01, 'первое ' + e)
  }
  // самый «упрямый» источник случайных чисел (всегда 0 и всегда почти 1) тоже даёт верную очередь
  for (const f of [() => 0, () => 0.9999999]) {
    const q = core.randomQueue(f)
    assert.equal(q.length, 6)
    for (let i = 1; i < 6; i++) assert.notEqual(q[i], q[i - 1])
  }
  assert.equal(core.randomQueue().length, 6)              // без аргумента — настоящий Math.random
})

t('ценность 15 минут: промежуток и минуты для телефона', () => {
  const st = core.newState(false, 15)
  assert.equal(st.val, 15)
  assert.equal(core.valueMs(st), 15 * M)
  core.toggle(st, 0, T)
  const r = core.process(st, T + 15 * M)
  assert.equal(r.events.length, 1)
  assert.equal(r.events[0].ms, 15 * M)
  assert.equal(core.label(st, 15 * M), '15')
  const back = core.restore(JSON.stringify(st), false, 60)
  assert.equal(back.val, 15)
})

console.log('\nВсе проверки пройдены: ' + n)
