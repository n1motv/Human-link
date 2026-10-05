import { Router } from 'express';
import { buildOpenApi } from './spec.js';

/**
 * Documentation de l'API pour le développement (jamais montée en production, voir app.ts) :
 *   /api/openapi.json  la spécification
 *   /api/docs          une page de lecture sans dépendance externe (la CSP n'autorise que les scripts de l'application)
 */
export const docsRouter = Router();

let cached: ReturnType<typeof buildOpenApi> | undefined;

docsRouter.get('/openapi.json', (_req, res) => {
  cached ??= buildOpenApi();
  res.json(cached);
});

docsRouter.get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Human Link</title>
<style>
  :root { --bg:#fff; --fg:#14141c; --muted:#5b5b6b; --line:#e3e3ec; --card:#f7f7fb; --accent:#7c3aed; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f0f16; --fg:#ececf4; --muted:#9a9ab0; --line:#2a2a3a; --card:#171722; --accent:#a78bfa; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, sans-serif; }
  main { max-width:960px; margin:0 auto; padding:24px 16px 80px; }
  h1 { margin:0 0 4px; } .muted { color:var(--muted); }
  input { width:100%; box-sizing:border-box; padding:10px 14px; margin:16px 0; border:1px solid var(--line); border-radius:12px; background:var(--card); color:var(--fg); font:inherit; }
  h2 { margin:28px 0 8px; text-transform:capitalize; }
  details { border:1px solid var(--line); border-radius:12px; margin:6px 0; background:var(--card); }
  summary { cursor:pointer; padding:10px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .m { font:700 12px monospace; padding:3px 8px; border-radius:6px; color:#fff; min-width:52px; text-align:center; }
  .get{background:#2563eb}.post{background:#16a34a}.put{background:#d97706}.patch{background:#9333ea}.delete{background:#dc2626}
  code { font:13px monospace; } .body { padding:0 14px 14px; } pre { overflow:auto; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px; font-size:12px; }
  .tag { font-size:12px; border:1px solid var(--line); border-radius:99px; padding:1px 8px; color:var(--muted); }
</style>
</head>
<body><main>
  <h1>API Human Link</h1>
  <p class="muted" id="intro">Chargement…</p>
  <input id="q" type="search" placeholder="Filtrer (chemin, titre, rôle)…" aria-label="Filtrer">
  <div id="out"></div>
</main>
<script src="/api/docs/viewer.js"></script>
</body></html>`);
});

docsRouter.get('/docs/viewer.js', (_req, res) => {
  res.type('js').send(`(async () => {
  const spec = await (await fetch('/api/openapi.json')).json();
  document.getElementById('intro').textContent = spec.info.description;
  const out = document.getElementById('out');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const ops = [];
  for (const [path, methods] of Object.entries(spec.paths)) for (const [method, op] of Object.entries(methods)) ops.push({ path, method, op });
  const render = (filter) => {
    out.replaceChildren();
    const f = filter.trim().toLowerCase();
    const groups = {};
    for (const o of ops) {
      const hay = (o.path + ' ' + o.op.summary + ' ' + (o.op['x-roles'] || []).join(' ')).toLowerCase();
      if (f && !hay.includes(f)) continue;
      (groups[o.op.tags[0]] ||= []).push(o);
    }
    for (const [tag, list] of Object.entries(groups)) {
      out.append(el('h2', '', tag));
      for (const { path, method, op } of list) {
        const d = el('details');
        const s = el('summary');
        s.append(el('span', 'm ' + method, method.toUpperCase()), el('code', '', path), el('span', 'muted', op.summary));
        for (const r of op['x-roles'] || []) s.append(el('span', 'tag', r));
        d.append(s);
        const b = el('div', 'body');
        b.append(el('p', 'muted', op.description));
        for (const p of op.parameters || []) b.append(el('p', '', p.in + ' · ' + p.name + (p.required ? ' (obligatoire)' : '')));
        const body = op.requestBody && Object.values(op.requestBody.content)[0].schema;
        if (body) b.append(el('p', '', 'Corps de la requête'), el('pre', '', JSON.stringify(body, null, 2)));
        for (const [code, r] of Object.entries(op.responses)) {
          const schema = r.content && r.content['application/json'].schema;
          if (schema && code !== 'default') b.append(el('p', '', 'Réponse ' + code), el('pre', '', JSON.stringify(schema, null, 2)));
        }
        d.append(b);
        out.append(d);
      }
    }
  };
  document.getElementById('q').addEventListener('input', (e) => render(e.target.value));
  render('');
})();`);
});
