/* =====================================================================
   Service worker para CDSS en GitHub Pages — plantilla reutilizable
   Sirve igual para cualquier app de la suite: solo cambie VERSION
   cada vez que suba un index.html nuevo.
   ===================================================================== */
const VERSION = "1.1.0";
const SCOPE = new URL(self.registration.scope).pathname;          // p. ej. /enteral/
const CACHE = "cdss" + SCOPE.replace(/\W+/g, "-") + "v" + VERSION; // caché propio de cada repositorio
const HOME = SCOPE + "index.html";

/* iOS rechaza respuestas que vienen de una redirección (GitHub Pages
   redirige /repo -> /repo/). Se copian sin la marca de redirección. */
function clean(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(b => new Response(b, {status: res.status, statusText: res.statusText, headers: res.headers}));
}

function fetchTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      fetch(SCOPE, {cache: "reload"})
        .then(clean)
        .then(res => res && res.ok ? Promise.all([cache.put(SCOPE, res.clone()), cache.put(HOME, res)]) : null)
        .catch(() => null)          // nunca falla la instalación
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("cdss" + SCOPE.replace(/\W+/g, "-")) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;               // nada externo pasa por aquí

  /* Páginas: se muestra al instante la copia guardada y se actualiza en segundo plano.
     Sin copia (primera visita): red con límite de 6 s. */
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(HOME).then(cached => {
          const update = fetchTimeout(req, 6000).then(clean).then(res => {
            if (res && res.ok) { cache.put(HOME, res.clone()); cache.put(SCOPE, res.clone()); }
            return res;
          });
          if (cached) { event.waitUntil(update.catch(() => null)); return cached; }
          return update.catch(() => cache.match(SCOPE).then(r => r || new Response(
            "<meta charset=utf-8><body style='font-family:sans-serif;padding:2em'>Sin conexión. Abra la app una vez con internet para guardarla.",
            {headers: {"Content-Type": "text/html; charset=utf-8"}})));
        })
      )
    );
    return;
  }

  /* Otros archivos del mismo sitio: caché primero, luego red. */
  event.respondWith(
    caches.match(req).then(hit => hit || fetchTimeout(req, 8000).then(clean).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit || Response.error()))
  );
});
