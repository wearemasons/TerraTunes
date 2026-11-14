/**
 * Tiny CDP client for the promo recording rig.
 *
 *   node cdp.mjs '<javascript expression>'      -> evaluate in the page
 *   node cdp.mjs --reload [url]                  -> reload (optionally to a url)
 *
 * Uses Node 22's built-in WebSocket, so there is nothing to install.
 */
const BASE = process.env.CDP_BASE || "http://[::1]:9222"

const list = await (await fetch(`${BASE}/json/list`)).json()
const page = list.find((t) => t.type === "page")
if (!page) {
  console.error("no page target; is chromium running with --remote-debugging-port=9222?")
  process.exit(2)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
})

await new Promise((r) => ws.addEventListener("open", r))

const args = process.argv.slice(2)
try {
  if (args[0] === "--reload") {
    if (args[1]) await send("Page.navigate", { url: args[1] })
    else await send("Page.reload", { ignoreCache: true })
    console.log("reloaded")
  } else {
    let expression = args[0] ?? "document.title"
    if (expression.startsWith("@")) {
      const { readFileSync } = await import("node:fs")
      expression = readFileSync(expression.slice(1), "utf8")
    }
    const out = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (out.exceptionDetails)
      console.error("page error:", out.exceptionDetails.exception?.description)
    console.log(JSON.stringify(out.result?.value, null, 2))
  }
} finally {
  ws.close()
}
