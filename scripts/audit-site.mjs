#!/usr/bin/env node
// Read-only repository + live-site audit. Never writes to tracked site content.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, 'audit.config.json'), 'utf8'));
const summary = [];
const issues = [];
const esc = s => String(s).replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");

function add(section, status, detail) { summary.push({ section, status, detail }); if (status === 'FAIL') issues.push(`${section}: ${detail}`); }
function locs(xml) { return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(m => esc(m[1].trim())); }
function unique(a) { return [...new Set(a)]; }
function normalizeUrl(s) { try { const u = new URL(s); u.hash=''; return u.href; } catch { return s; } }
async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(config.httpTimeoutMs) });
  return { status: res.status, ok: res.ok, text: await res.text(), finalUrl: res.url, type: res.headers.get('content-type') || '', xRobots: res.headers.get('x-robots-tag') || '' };
}
async function pool(items, limit, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) { const n = i++; if (n >= items.length) break; await worker(items[n], n); }
  }));
}
function repoPathFor(url) {
  const u = new URL(url);
  if (u.hostname !== config.siteHost) return null;
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  return path.join(root, rel);
}

// Check the three named files both in the checked-out repository and at the live origin.
const names = ['robots.txt', 'sitemap.xml', 'sitemap-index.xml'];
const repo = {};
for (const name of names) {
  const filename = path.join(root, name);
  try { repo[name] = await fs.readFile(filename, 'utf8'); add(`repo ${name}`, 'PASS', `present (${Buffer.byteLength(repo[name])} bytes)`); }
  catch { repo[name] = null; add(`repo ${name}`, 'FAIL', 'missing from checkout'); }
}
const live = {};
await pool(names, 3, async name => {
  const url = new URL(name, config.baseUrl).href;
  try {
    const r = await fetchText(url); live[name] = r;
    add(`live ${name}`, r.ok ? 'PASS' : 'FAIL', `HTTP ${r.status}; ${r.type || 'no content-type'}; final ${r.finalUrl}`);
    if (r.ok && repo[name] !== null && r.text.trim() !== repo[name].trim()) add(`repo/live ${name}`, 'WARN', 'text differs (possible deployment delay or CDN normalization)');
  } catch (e) { live[name] = null; add(`live ${name}`, 'FAIL', String(e)); }
});

let manifest;
try { manifest = JSON.parse(await fs.readFile(path.join(root, config.manifestPath), 'utf8')); }
catch (e) { add('manifest', 'FAIL', `${config.manifestPath}: ${e}`); manifest = { articles: [] }; }
const articles = Array.isArray(manifest.articles) ? manifest.articles : [];
const articleUrls = unique(articles.map(a => a.url).filter(Boolean).map(normalizeUrl));
add('manifest articles', articleUrls.length ? 'PASS' : 'FAIL', `${articleUrls.length} unique article URLs from ${config.manifestPath}`);

const mapUrls = {};
for (const name of ['sitemap.xml', 'sitemap-index.xml']) {
  const source = repo[name];
  if (!source) { mapUrls[name] = []; continue; }
  const isIndex = /<sitemapindex\b/i.test(source);
  const entries = locs(source);
  if (!entries.length) add(`XML ${name}`, 'FAIL', 'no <loc> URLs found');
  else add(`XML ${name}`, 'PASS', `${isIndex ? 'sitemap index' : 'url set'}; ${entries.length} direct <loc> entries`);
  if (name === 'sitemap.xml') mapUrls[name] = entries.map(normalizeUrl);
  else {
    const children = entries.filter(u => /sitemap[^/]*\.xml(?:$|\?)/i.test(new URL(u).pathname));
    let expanded = [];
    for (const child of children) {
      try {
        const rp = repoPathFor(child);
        if (!rp) continue;
        const xml = await fs.readFile(rp, 'utf8');
        if (/<sitemapindex\b/i.test(xml)) continue;
        expanded.push(...locs(xml).map(normalizeUrl));
      } catch { /* child sitemap may be remote/generated; live HTTP checks below capture it */ }
    }
    mapUrls[name] = unique(expanded);
    add('repository child sitemaps', expanded.length ? 'PASS' : 'WARN', `${children.length} children listed; ${unique(expanded).length} URLs expanded from local child files`);
  }
}
const sitemapUnion = new Set([...mapUrls['sitemap.xml'], ...mapUrls['sitemap-index.xml']]);
const missing = articleUrls.filter(u => !sitemapUnion.has(u));
const extra = [...sitemapUnion].filter(u => /\/articles\//.test(new URL(u).pathname) && !articleUrls.includes(u));
add('manifest ↔ sitemap', missing.length || extra.length ? 'FAIL' : 'PASS', `${articleUrls.length - missing.length}/${articleUrls.length} manifest URLs found; ${missing.length} missing; ${extra.length} article URLs absent from manifest`);
if (missing.length) add('missing sitemap URLs', 'FAIL', missing.slice(0, 20).join(', ') + (missing.length > 20 ? ` … (+${missing.length - 20})` : ''));
if (extra.length) add('extra sitemap article URLs', 'WARN', extra.slice(0, 20).join(', ') + (extra.length > 20 ? ` … (+${extra.length - 20})` : ''));

// Validate all sitemap endpoints declared in the root sitemap index and robots file.
const sitemapEndpoints = new Set([...locs(repo['sitemap-index.xml'] || '')]);
for (const line of (repo['robots.txt'] || '').split(/\r?\n/)) {
  const m = line.match(/^\s*Sitemap:\s*(\S+)/i); if (m) sitemapEndpoints.add(m[1]);
}
const endpointResults = [];
await pool([...sitemapEndpoints], config.sitemapConcurrency, async url => {
  try { const r = await fetchText(url); endpointResults.push({ url, ok: r.ok, status: r.status }); }
  catch (e) { endpointResults.push({ url, ok: false, status: String(e) }); }
});
const endpointFails = endpointResults.filter(x => !x.ok);
add('live sitemap endpoints', endpointFails.length ? 'FAIL' : 'PASS', `${endpointResults.length - endpointFails.length}/${endpointResults.length} reachable`);
if (endpointFails.length) add('unreachable sitemaps', 'FAIL', endpointFails.slice(0, 20).map(x => `${x.status} ${x.url}`).join('\n'));

// Inspect article response status, canonical, H1, and noindex. All requests are GET only.
const pageResults = [];
await pool(articleUrls, config.pageConcurrency, async url => {
  try {
    let result = await fetchText(url);
    let html = result.text;
    // Use live response markup only; no local fallback can mask a live-page problem.
    if (!result.ok) { pageResults.push({ url, status: result.status, canonical: '', h1: false, noindex: false, source: 'live' }); return; }
    const canon = [...html.matchAll(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/gi)].map(m => m[0]).find(Boolean) || '';
    const canonical = canon.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].some(m => m[1].replace(/<[^>]*>/g, '').trim().length > 0);
    const metaNoindex = [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => {
      const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1] || '';
      const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1] || '';
      return /^(robots|googlebot)$/i.test(name) && /\bnoindex\b/i.test(content);
    });
    const xRobots = /\bnoindex\b/i.test(result.xRobots);
    pageResults.push({ url, status: result.status, canonical, h1, noindex: metaNoindex || xRobots, source: 'live' });
  } catch (e) { pageResults.push({ url, status: String(e), canonical: '', h1: false, noindex: false, source: 'live' }); }
});
const pageHttpFails = pageResults.filter(x => typeof x.status !== 'number' || x.status < 200 || x.status >= 400);
const canonicalBad = pageResults.filter(x => !x.canonical || normalizeUrl(new URL(x.canonical, x.url).href) !== normalizeUrl(x.url));
const noH1 = pageResults.filter(x => !x.h1);
const noindex = pageResults.filter(x => x.noindex);
add('article HTTP', pageHttpFails.length ? 'FAIL' : 'PASS', `${pageResults.length - pageHttpFails.length}/${pageResults.length} URLs returned 2xx/3xx`);
add('article canonical', canonicalBad.length ? 'FAIL' : 'PASS', `${pageResults.length - canonicalBad.length}/${pageResults.length} canonical URLs point to self`);
add('article H1', noH1.length ? 'FAIL' : 'PASS', `${pageResults.length - noH1.length}/${pageResults.length} pages have an H1`);
add('article noindex', noindex.length ? 'FAIL' : 'PASS', `${noindex.length} pages have a noindex directive`);
for (const [label, items] of [['HTTP errors', pageHttpFails], ['canonical errors', canonicalBad], ['missing H1', noH1], ['noindex pages', noindex]]) {
  if (items.length) add(label, 'FAIL', items.slice(0, 15).map(x => `${x.status} ${x.url}`).join('\n'));
}

const md = [
  `## Read-only site audit — ${new Date().toISOString()}`,
  `Target: ${config.baseUrl} · articles checked: ${articleUrls.length}`,
  '',
  '| Check | Result | Details |', '|---|---:|---|',
  ...summary.map(x => `| ${x.section.replaceAll('|','\\|')} | **${x.status}** | ${x.detail.replaceAll('|','\\|').replaceAll('\n','<br>')} |`),
  '',
  `Overall: **${issues.length ? `${issues.length} issue(s)` : 'PASS'}**`
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
if (issues.length && process.env.FAIL_ON_ISSUES !== 'false') process.exitCode = 1;
