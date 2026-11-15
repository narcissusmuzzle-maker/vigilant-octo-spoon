import { BaseSideService } from '@zeppos/zml/base-side'

// Служба на телефоне (внутри приложения Zepp). Часы шлют сюда «час закончился», она передаёт это
// приложению LuvU613, которое слушает 127.0.0.1:28613 (служба «Связь с часами»).
// Ключ должен совпадать с WatchBridgeServer.KEY в приложении. Схема та же, что в вашей рабочей проверке.
const PORT = 28613
const KEY = 'u613-bip'

async function sendToPhone(payload) {
  const url = 'http://127.0.0.1:' + PORT + '/event?k=' + KEY + '&j=' + encodeURIComponent(JSON.stringify(payload))
  const res = await fetch({ url: url, method: 'GET' })
  const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body
  return body
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},
    onRequest(req, res) {
      if (req.method === 'u613.send') {
        sendToPhone(req.params)
          .then((reply) => res(null, { ok: true, reply: reply }))
          .catch((err) => res(null, { ok: false, error: String(err) }))
      } else {
        res('unknown method')
      }
    },
  })
)
