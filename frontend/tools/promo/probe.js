JSON.stringify({
  url: location.href,
  log: window.__promo || null,
  done: document.documentElement.dataset.promoDone || null,
  power: document.querySelector("[data-guide='power']")?.getAttribute("aria-pressed"),
  needle: document.querySelector("[data-guide='needle']")?.getAttribute("aria-label"),
  deck: !!document.querySelector(".main-deck"),
  crate: !!document.querySelector("[aria-label^='Record ']"),
})
