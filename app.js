/* G-Wave — world news radio on a globe, with on-device English subtitles.
   Data: Radio Browser (https://www.radio-browser.info) — free, no key.
   Subtitles: Whisper running in the browser via Transformers.js (asr-worker.js) — free, no key. */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg, ms = 3200) => {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  };
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
  };

  // ---------- layout: Auto / Mobile / Tab ----------
  const LAYOUT_ICONS = {"auto": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"2.5\" y=\"5\" width=\"13\" height=\"10\" rx=\"1.5\"/><rect x=\"15\" y=\"9\" width=\"6.5\" height=\"11\" rx=\"1.5\"/><path d=\"M6 19h6\"/></svg>", "mobile": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"7\" y=\"2.5\" width=\"10\" height=\"19\" rx=\"2.5\"/><path d=\"M11 18.5h2\"/></svg>", "tab": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"3\" width=\"17\" height=\"18\" rx=\"2.5\"/><path d=\"M11 18h2\"/></svg>"};
  let layoutPref = store.get('gw-layout', 'auto');
  const coarse = matchMedia('(pointer: coarse)');
  function resolveLayout() {
    const w = window.innerWidth;
    if (layoutPref === 'mobile') return 'mobile';
    if (layoutPref === 'tab') return 'tab';
    return w <= 760 ? 'mobile' : (w <= 1180 && coarse.matches) ? 'tab' : 'desktop';
  }
  let layoutNow = resolveLayout();
  // drop-in for the old phone-width media query used throughout the app
  const mqMobile = { get matches() { return layoutNow === 'mobile'; } };
  function applyLayoutClass() {
    const root = document.documentElement;
    root.classList.remove('lay-mobile', 'lay-tab', 'lay-desktop');
    root.classList.add('lay-' + layoutNow);
  }
  applyLayoutClass();

  // ---------- regions ----------
  const REGION = {};
  const addRegion = (name, codes) => codes.split(' ').forEach((c) => (REGION[c] = name));
  addRegion('Europe', 'AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK');
  addRegion('Africa', 'DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD SZ TZ TG TN UG ZM ZW RE YT');
  addRegion('Oceania', 'AU NZ FJ PG SB VU NC PF WS TO KI FM MH PW NR TV GU');
  addRegion('Americas', 'US CA MX GT BZ SV HN NI CR PA CU DO HT JM PR TT BS BB AG DM GD KN LC VC AW CW BM KY TC VG VI AR BO BR CL CO EC GY PY PE SR UY VE GF GP MQ');
  addRegion('Middle East', 'AE BH IQ IR IL JO KW LB OM PS QA SA SY YE TR');
  const regionOf = (cc) => REGION[cc] || 'Asia';

  // Whisper language codes from Radio Browser language names
  const LANG = {
    english: 'en', arabic: 'ar', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
    russian: 'ru', ukrainian: 'uk', polish: 'pl', dutch: 'nl', turkish: 'tr', greek: 'el', czech: 'cs',
    swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', hungarian: 'hu', romanian: 'ro', bulgarian: 'bg',
    serbian: 'sr', croatian: 'hr', slovak: 'sk', slovenian: 'sl', hebrew: 'he', persian: 'fa', farsi: 'fa',
    hindi: 'hi', urdu: 'ur', bengali: 'bn', tamil: 'ta', malayalam: 'ml', telugu: 'te', marathi: 'mr',
    chinese: 'zh', mandarin: 'zh', cantonese: 'zh', japanese: 'ja', korean: 'ko', vietnamese: 'vi', thai: 'th',
    indonesian: 'id', malay: 'ms', tagalog: 'tl', filipino: 'tl', swahili: 'sw', catalan: 'ca', basque: 'eu',
    galician: 'gl', lithuanian: 'lt', latvian: 'lv', estonian: 'et', icelandic: 'is', afrikaans: 'af',
  };
  const langCode = (s) => {
    const first = String(s.language || '').toLowerCase().split(/[,;/]/)[0].trim();
    return LANG[first] || null;
  };
  const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');

  // ---------- state ----------
  const state = {
    mode: store.get('gw-mode', 'radio'),
    stations: [],
    filtered: [],
    region: 'all',
    query: '',
    current: null,
    favs: new Set(store.get('gr-favs', [])),
    ccOn: store.get('gr-cc', false),
  };

  // ---------- skins & theme ----------
  const SKINS = [
    { id: 'signal', name: 'Signal', c: '#f5a524' },
    { id: 'aurora', name: 'Aurora', c: '#2dd4bf' },
    { id: 'coral', name: 'Coral', c: '#ff6b5e' },
    { id: 'ion', name: 'Ion', c: '#6c8cff' },
    { id: 'orchid', name: 'Orchid', c: '#d77cf2' },
    { id: 'mint', name: 'Mint', c: '#4ade80' },
  ];
  function renderSwatches() {
    const cur = document.documentElement.dataset.skin || 'signal';
    $('#swatches').innerHTML = SKINS.map((s) =>
      `<button class="swatch" role="menuitemradio" aria-checked="${s.id === cur}" data-skin="${s.id}"><i style="background:${s.c}"></i>${s.name}</button>`
    ).join('');
  }
  $('#skinBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#skinMenu'); m.hidden = !m.hidden;
    $('#skinBtn').setAttribute('aria-expanded', String(!m.hidden));
    renderSwatches();
  });
  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch'); if (!b) return;
    const id = b.dataset.skin;
    if (id === 'signal') delete document.documentElement.dataset.skin; else document.documentElement.dataset.skin = id;
    try { localStorage.setItem('gr-skin', id === 'signal' ? '' : id); } catch {}
    renderSwatches(); applyGlobeColors();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.skin-wrap')) $('#skinMenu').hidden = true; });

  $('#themeBtn').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gr-theme', next); } catch {}
    applyGlobeColors();
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyGlobeColors());

  // ---------- globe ----------
  const globeEl = $('#globe');
  const globe = Globe({ animateIn: true })(globeEl)
    .backgroundColor('rgba(0,0,0,0)')
    .bumpImageUrl('img/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereAltitude(0.18)
    .pointLat('geo_lat')
    .pointLng('geo_long')
    .pointAltitude((d) => (state.current && d.stationuuid === state.current.stationuuid ? 0.03 : 0.012))
    .pointRadius((d) => (state.current && d.stationuuid === state.current.stationuuid ? 0.55 : (state.stations.length > 1500 ? 0.2 : 0.34)))
    .pointResolution(8)
    .pointsMerge(true)
    .ringLat('geo_lat').ringLng('geo_long')
    .ringMaxRadius(5).ringPropagationSpeed(2.5).ringRepeatPeriod(900);

  const ctrl = globe.controls();
  ctrl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  ctrl.autoRotateSpeed = 0.45;
  ctrl.enableDamping = true;
  globe.pointOfView({ lat: 22, lng: 40, altitude: layoutNow === 'mobile' ? 3.5 : layoutNow === 'tab' ? 2.9 : 2.6 });

  // Picking: points are merged into one mesh for speed, so find the nearest station ourselves
  const tip = document.createElement('div'); tip.className = 'globe-tip'; tip.hidden = true; document.body.appendChild(tip);
  const toRad = Math.PI / 180;
  function nearestStation(clientX, clientY) {
    const r = globeEl.getBoundingClientRect();
    const c = globe.toGlobeCoords(clientX - r.left, clientY - r.top);
    if (!c) return null;
    const alt = globe.pointOfView().altitude;
    const maxDeg = Math.max(0.35, alt * 1.6); // tap tolerance grows as you zoom out
    let best = null, bestD = Infinity;
    const cl = Math.cos(c.lat * toRad);
    for (const s of pickList()) {
      if (s.geo_lat == null) continue;
      const dLat = s.geo_lat - c.lat; let dLng = s.geo_long - c.lng;
      if (dLng > 180) dLng -= 360; else if (dLng < -180) dLng += 360;
      const d = Math.hypot(dLat, dLng * cl);
      if (d < bestD) { bestD = d; best = s; }
    }
    return bestD <= maxDeg ? best : null;
  }
  let downXY = null;
  globeEl.addEventListener('pointerdown', (e) => (downXY = [e.clientX, e.clientY]));
  globeEl.addEventListener('pointerup', (e) => {
    if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
    const s = nearestStation(e.clientX, e.clientY);
    if (s) { tip.hidden = true; if (state.mode === 'news') pickNewsCountry(s); else play(s); }
  });
  let tipRaf = 0;
  globeEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) { tip.hidden = true; return; }
    cancelAnimationFrame(tipRaf);
    tipRaf = requestAnimationFrame(() => {
      const s = nearestStation(e.clientX, e.clientY);
      globeEl.style.cursor = s ? 'pointer' : '';
      if (!s) { tip.hidden = true; return; }
      tip.innerHTML = state.mode === 'news'
        ? `<b>${flag(s.cc)} ${esc(s.country)}</b><span>${s.count} headline${s.count === 1 ? '' : 's'} · tap to filter</span>`
        : `<b>${esc(s.name)}</b><span>${flag(s.countrycode)} ${esc(s.country)}${s.language ? ' · ' + esc(s.language.split(',')[0]) : ''}</span>`;
      tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; tip.hidden = false;
    });
  });
  globeEl.addEventListener('pointerleave', () => (tip.hidden = true));

  // Pause auto-rotate while the user drags, resume after a moment
  let resumeT;
  globeEl.addEventListener('pointerdown', () => { ctrl.autoRotate = false; clearTimeout(resumeT); });
  globeEl.addEventListener('pointerup', () => { resumeT = setTimeout(() => (ctrl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches), 6000); });

  function sizeGlobe() {
    const w = window.innerWidth, h = window.innerHeight;
    globe.width(w).height(h);
    // keep the globe centred in the free space: left of the panel on desktop, between header and sheet on phones
    if (layoutNow === 'mobile') globe.globeOffset([0, h * 0.02]);
    else if (layoutNow === 'tab') globe.globeOffset([-(360 + 40) / 2 + 40, 20]);
    else globe.globeOffset([-Math.min(410, w * 0.32) / 2 + 90, 40]);
  }
  window.addEventListener('resize', sizeGlobe); sizeGlobe();

  function hexToRgba(hex, a) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function applyGlobeColors() {
    const accent = cssVar('--accent') || '#f5a524';
    globe
      .globeImageUrl(isDark() ? 'img/earth-night.jpg' : 'img/earth-blue-marble.jpg')
      .atmosphereColor(isDark() ? accent : '#8fb4ff')
      .pointColor((d) => (state.mode === 'news' ? hexToRgba(accent, 0.92) : state.current && d.stationuuid === state.current.stationuuid ? '#ffffff' : accent))
      .ringColor(() => (t) => hexToRgba(accent, 1 - t));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark() ? '#0b0e14' : '#eef1f6';
  }
  applyGlobeColors();

  // ---------- data: Radio Browser ----------
  const MIRRORS = [
    'https://de1.api.radio-browser.info',
    'https://de2.api.radio-browser.info',
    'https://fi1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
  ].sort(() => Math.random() - 0.5);
  let apiBase = null;

  async function api(path) {
    const bases = apiBase ? [apiBase, ...MIRRORS.filter((m) => m !== apiBase)] : MIRRORS;
    let lastErr;
    for (const base of bases) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
        const r = await fetch(base + path, { signal: ctl.signal });
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        apiBase = base;
        return await r.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No API server reachable');
  }

  // Approximate population centres, used to place stations that have no coordinates
  const CENTROID = {};
  ('AD 42.5,1.5|AE 24.4,54.4|AF 34.5,69|AL 41.3,19.8|AM 40.2,44.5|AO -8.8,13.2|AR -34.6,-60|AT 47.8,14.5|AU -30,145|AZ 40.4,49.9|BA 44,18|BD 23.8,90.4|BE 50.8,4.4|BF 12.4,-1.5|BG 42.7,24.5|BH 26.2,50.6|BI -3.4,29.4|BJ 6.5,2.4|BO -16.5,-66|BR -18,-46|BS 25,-77.4|BT 27.5,89.6|BW -24.6,25.9|BY 53.9,27.6|BZ 17.2,-88.7|CA 47,-80|CD -4.3,15.3|CF 4.4,18.6|CG -4.3,15.3|CH 47,8|CI 5.4,-4|CL -33.5,-70.7|CM 4,11.5|CN 32,114|CO 4.6,-74.1|CR 9.9,-84.1|CU 23.1,-82.4|CV 14.9,-23.5|CY 35.1,33.4|CZ 49.9,15.5|DE 51,10|DJ 11.6,43.1|DK 55.9,10.5|DO 18.5,-69.9|DZ 36.7,3.1|EC -1.5,-78.5|EE 59,25.5|EG 30,31.2|ER 15.3,38.9|ES 40.2,-3.7|ET 9,38.7|FI 61.5,25|FJ -18.1,178.4|FR 46.6,2.4|GA 0.4,9.4|GB 52.8,-1.5|GE 41.7,44.8|GH 5.6,-0.2|GM 13.45,-16.6|GN 9.6,-13.6|GQ 3.75,8.8|GR 38.5,23|GT 14.6,-90.5|GY 6.8,-58.2|HK 22.3,114.2|HN 14.1,-87.2|HR 45.5,16|HT 18.5,-72.3|HU 47.3,19.3|ID -6.5,107.5|IE 53.3,-7.5|IL 32,34.8|IN 22,79|IQ 33.3,44.4|IR 34,51.5|IS 64.1,-21.9|IT 42.5,12.5|JM 18,-76.8|JO 31.95,35.9|JP 35.5,137|KE -1.3,36.8|KG 42.9,74.6|KH 11.6,104.9|KP 39,125.75|KR 37,127.5|KW 29.4,47.9|KZ 45,70|LA 17.97,102.6|LB 33.9,35.5|LK 6.9,79.9|LR 6.3,-10.8|LS -29.3,27.5|LT 55,24|LU 49.6,6.1|LV 56.95,24.1|LY 32.9,13.2|MA 33.6,-6.8|MC 43.7,7.4|MD 47,28.8|ME 42.45,19.3|MG -18.9,47.5|MK 41.99,21.4|ML 12.6,-8|MM 18,96|MN 47.9,106.9|MO 22.2,113.55|MR 18.1,-15.95|MT 35.9,14.4|MU -20.2,57.5|MV 4.2,73.5|MW -14,33.8|MX 20.5,-100|MY 3.1,101.7|MZ -25.97,32.6|NA -22.6,17.1|NE 13.5,2.1|NG 8,6|NI 12.1,-86.3|NL 52.3,5.3|NO 60.5,9|NP 27.7,85.3|NZ -39,175|OM 23.6,58.4|PA 9,-79.5|PE -12,-77|PG -9.4,147.2|PH 14.6,121|PK 30,71|PL 52,19.5|PR 18.4,-66.1|PS 31.9,35.2|PT 39.5,-8.4|PY -25.3,-57.6|QA 25.3,51.5|RE -21.1,55.5|RO 45.5,25.5|RS 44.3,20.7|RU 55.7,40|RW -1.95,30.06|SA 24.7,46.7|SC -4.6,55.45|SD 15.6,32.5|SE 59.5,16|SG 1.35,103.8|SI 46.1,14.8|SK 48.5,19|SL 8.47,-13.2|SN 14.7,-17.4|SO 2.05,45.3|SR 5.85,-55.2|SS 4.85,31.6|SV 13.7,-89.2|SY 34.5,37|SZ -26.3,31.1|TD 12.1,15|TG 6.13,1.22|TH 14.5,100.5|TJ 38.56,68.8|TL -8.55,125.6|TM 37.95,58.4|TN 36.5,10|TR 39.5,32.5|TT 10.6,-61.3|TW 24,121|TZ -6.8,39.2|UA 49.5,31|UG 0.35,32.6|US 39,-95|UY -34.6,-56|UZ 41.3,69.3|VA 41.9,12.45|VE 10.4,-66.9|VN 16,106.5|YE 15.35,44.2|ZA -27,27|ZM -15.4,28.3|ZW -17.8,31|XK 42.66,21.17|BB 13.1,-59.6|AG 17.1,-61.8|LC 14,-61|GD 12.05,-61.75|VC 13.15,-61.2|DM 15.3,-61.4|KN 17.3,-62.7|AW 12.5,-70|CW 12.15,-68.9|BM 32.3,-64.8|KY 19.3,-81.4|GU 13.45,144.75|NC -22.3,166.45|PF -17.55,-149.55|WS -13.8,-171.8|TO -21.15,-175.2|VU -17.75,168.3|SB -9.45,159.95|IM 54.2,-4.5|JE 49.2,-2.1|GG 49.45,-2.55|GI 36.1,-5.35|FO 62,-6.8|LI 47.15,9.55|SM 43.94,12.45|GL 64.2,-51.7|GP 16.25,-61.55|MQ 14.6,-61.05|GF 4.9,-52.3|YT -12.8,45.15|KM -11.7,43.25|MK 41.99,21.43')
    .split('|').forEach((x) => { const [cc, ll] = x.split(' '); CENTROID[cc] = ll.split(',').map(Number); });
  const WIDE = { US: 9, CA: 6, RU: 6, BR: 6, AU: 6, CN: 6, IN: 5, AR: 3, MX: 3, ID: 4, DE: 1.6, FR: 2, GB: 1.6, ES: 2, IT: 2, TR: 3 };
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function placeByCountry(cc, id) {
    const c = CENTROID[cc]; if (!c) return null;
    const spread = WIDE[cc] || 0.9, h = hash(id);
    const a = ((h & 0xffff) / 0xffff) * Math.PI * 2, r = Math.sqrt(((h >>> 16) & 0xffff) / 0xffff) * spread;
    return [c[0] + Math.sin(a) * r * 0.6, c[1] + Math.cos(a) * r];
  }

  const GOOD_CODECS = /^(MP3|AAC|AAC\+|OGG|OPUS)$/i;
  const H3 = 3 * 3600 * 1000;
  const parseTime = (v) => {
    if (!v) return 0;
    const t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(v) ? v : String(v).replace(' ', 'T') + 'Z');
    return isFinite(t) ? t : 0;
  };
  const ago = (t) => {
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm ago';
  };
  function clean(list, requireGeo = true) {
    const seen = new Set(), names = new Set(), out = [];
    for (const s of list) {
      if (!s || seen.has(s.stationuuid)) continue;
      let url = (s.url_resolved || s.url || '').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const secure = url.startsWith('https://');
      // the app runs on HTTPS, so plain-HTTP streams are tried over HTTPS (many servers support both)
      if (!secure && location.protocol === 'https:') url = 'https://' + url.slice(7);
      if (s.hls === 1 || /\.m3u8(\?|$)/i.test(url)) continue;
      if (s.codec && !GOOD_CODECS.test(s.codec)) continue;
      const lat = +s.geo_lat, lng = +s.geo_long;
      let hasGeo = isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0) && s.geo_lat != null;
      let glat = lat, glng = lng;
      if (!hasGeo) {
        const p = placeByCountry((s.countrycode || '').toUpperCase(), s.stationuuid || s.name);
        if (p) { [glat, glng] = p; hasGeo = true; }
      }
      if (requireGeo && !hasGeo) continue;
      const key = (s.name || '').trim().toLowerCase();
      if (!key || names.has(key)) continue;
      seen.add(s.stationuuid); names.add(key);
      out.push({
        stationuuid: s.stationuuid,
        name: s.name.trim().replace(/\s+/g, ' '),
        url,
        favicon: (s.favicon || '').startsWith('https://') ? s.favicon : '',
        country: s.country || s.countrycode || 'Unknown',
        countrycode: (s.countrycode || '').toUpperCase(),
        language: s.language || '',
        codec: s.codec || '', bitrate: s.bitrate || 0,
        clickcount: s.clickcount || 0,
        geo_lat: hasGeo ? +glat.toFixed(3) : null, geo_long: hasGeo ? +glng.toFixed(3) : null,
        secure,
        tags: (s.tags || '').toLowerCase(),
        lastClick: parseTime(s.clicktimestamp_iso8601 || s.clicktimestamp),
        region: regionOf((s.countrycode || '').toUpperCase()),
      });
    }
    // secure streams first (most reliable), then by popularity
    return out.sort((a, b) => (b.secure - a.secure) || (b.clickcount - a.clickcount));
  }

  async function loadStations() {
    const cached = store.get('gr-stations', null);
    if (cached && cached.list && cached.list.length) setStations(cached.list, true);
    else renderSkeleton();

    const q = 'hidebroken=true&order=clickcount&reverse=true';
    const TAGS = [
      ['news', 1500], ['talk', 500], ['information', 300], ['info', 300], ['news talk', 300], ['talk & news', 150],
      ['public radio', 300], ['current affairs', 150], ['politics', 150], ['world news', 150], ['public service', 100],
      ['noticias', 400], ['informativo', 100], ['nachrichten', 200], ['actualités', 150], ['actualites', 100], ['information continue', 50],
      ['notizie', 150], ['notícias', 150], ['jornalismo', 100], ['nieuws', 120], ['wiadomości', 80], ['haber', 200],
      ['новости', 200], ['أخبار', 120], ['اخبار', 80], ['akhbar', 50], ['berita', 100], ['ニュース', 40], ['新闻', 60],
      ['समाचार', 60], ['khabar', 30], ['habari', 40], ['tin tức', 40], ['ข่าว', 40], ['뉴스', 40],
      // Asian languages
      ['خبریں', 40], ['সংবাদ', 40], ['খবর', 40], ['செய்திகள்', 40], ['വാർത്ത', 40], ['వార్తలు', 30], ['ಸುದ್ದಿ', 30],
      ['ਖ਼ਬਰਾਂ', 20], ['સમાચાર', 20], ['बातम्या', 20], ['新聞', 80], ['资讯', 40], ['新聞台', 30], ['時事', 30], ['報道', 30],
      ['시사', 40], ['balita', 80], ['خبر', 60], ['haberler', 80], ['thời sự', 40], ['tin tuc', 40],
      ['ข่าวสาร', 30], ['ព័ត៌មាន', 20], ['သတင်း', 20], ['мэдээ', 20], ['жаңалықтар', 20], ['yangiliklar', 20], ['اخبار ایران', 20],
    ];
    // every Asian and Middle Eastern country: its news-tagged stations
    const ASIA_CC = 'IN PK BD LK NP BT MV CN HK MO TW JP KR KP MN PH ID MY SG BN TH VN KH LA MM TL KZ UZ KG TJ TM AF IR IQ SA AE QA KW BH OM YE JO LB SY IL PS TR AZ GE AM'.split(' ');
    const FEATURED = [
      'BBC World Service', 'BBC Radio 4', 'BBC Radio 5 Live', 'Voice of America', 'Radio France Internationale', 'RFI',
      'France Info', 'France Inter', 'Deutsche Welle', 'Deutschlandfunk', 'NPR', 'WNYC', 'Bloomberg Radio', 'CNN',
      'Fox News', 'Sky News', 'LBC', 'Times Radio', 'Al Jazeera', 'Asharq', 'Monte Carlo Doualiya', 'Radio Sawa',
      'CBC Radio', 'Radio-Canada', 'ABC NewsRadio', 'RNZ', 'NHK', 'KBS', 'Arirang', 'China Radio International', 'CGTN',
      'All India Radio', 'Radio Pakistan', 'TRT', 'RNE', 'Cadena SER', 'COPE', 'Radio Mitre', 'CBN', 'Jovem Pan', 'BandNews',
      'Rai Radio 1', 'RTÉ Radio 1', 'RTL', 'Europe 1', 'SRF', 'ORF', 'NOS', 'Radio Free Europe', 'Radio Liberty',
      'Kol Israel', 'Kan', 'Radio Nacional', 'W Radio', 'Caracol', 'RFM', 'SABC', 'Capital FM Kenya', 'Nigeria Info',
      // Asia & Middle East
      'Akashvani', 'AIR News', 'News On AIR', 'BBC Hindi', 'BBC Urdu', 'BBC Bangla', 'BBC Tamil', 'Radio Free Asia', 'VOA Urdu',
      'Dawn', 'Geo News', 'ARY News', 'Express News', 'FM 100 Pakistan', 'Somoy', 'Jamuna', 'Bangladesh Betar', 'Hiru', 'Ada Derana', 'SLBC',
      'Radio Nepal', 'Kantipur', 'NHK World', 'NHK Radio', 'TBS Radio', 'Nippon Cultural', 'YTN', 'KBS 1Radio', 'MBC', 'SBS', 'TBS eFM',
      'China National Radio', '中国之声', 'CNR', 'RTHK', 'Commercial Radio Hong Kong', 'Radio Taiwan International', 'BCC News', 'Police Radio',
      'CNA938', 'Mediacorp', 'Money FM 89.3', 'BFM 89.9', 'Bernama', 'Radio Televisyen Malaysia', 'RRI', 'Elshinta', 'Sonora', 'Radio Republik Indonesia',
      'DZRH', 'DZBB', 'DZMM', 'Radyo Pilipinas', 'Bombo Radyo', 'Radio Thailand', 'MCOT', 'VOV', 'Voice of Vietnam', 'Radio Free Asia Khmer',
      'Al Arabiya', 'Sky News Arabia', 'Al Jazeera Arabic', 'QBS', 'Qatar Radio', 'Radio Oman', 'Dubai Eye', 'Pulse 95', 'Radio Kuwait', 'SBA Radio',
      'Radio Farda', 'Iran International', 'IRIB', 'Radio Azadi', 'Ozodi', 'Radio Ozodlik', 'Kazakh Radio', 'Mongolian National Radio',
      'TRT Haber', 'Sözcü', 'Habertürk', 'NTV Radyo', 'Kan Reshet Bet', 'Galei Tzahal', 'Radio Monte Carlo', 'Radio Sawa Iraq',
    ];
    try {
      const paths = [
        ...TAGS.map(([t, n]) => `/json/stations/search?tag=${encodeURIComponent(t)}&tagExact=false&limit=${n}&${q}`),
        ...FEATURED.map((n) => `/json/stations/search?name=${encodeURIComponent(n)}&limit=12&${q}`),
        ...ASIA_CC.map((cc) => `/json/stations/search?countrycode=${cc}&tag=news&tagExact=false&limit=80&${q}`),
        ...['IN', 'PK', 'BD', 'PH', 'ID', 'JP', 'KR', 'CN', 'TR', 'SA', 'AE', 'IR'].map((cc) => `/json/stations/search?countrycode=${cc}&tag=talk&tagExact=false&limit=40&${q}`),
      ];
      // polite: at most 6 requests at a time; show stations as soon as the first batches arrive
      const all = [];
      let next = 0, done = 0, lastPaint = 0;
      async function workerLoop() {
        while (next < paths.length) {
          const path = paths[next++];
          try { all.push(...(await api(path))); } catch {}
          done++;
          if (all.length && (done === 1 || Date.now() - lastPaint > 2500) && done < paths.length) {
            lastPaint = Date.now();
            if (!cached || !cached.list || all.length > cached.list.length) setStations(clean(all), true);
            if (state.mode === 'radio') $('#countText').textContent += ` · loading ${Math.round((done / paths.length) * 100)}%`;
          }
        }
      }
      await Promise.all(Array.from({ length: 6 }, workerLoop));
      if (!all.length) throw new Error('empty');
      const list = clean(all);
      // cache for instant start next time; trim if the browser's storage is nearly full
      for (const n of [list.length, 3000, 1500]) {
        try { localStorage.setItem('gr-stations', JSON.stringify({ t: Date.now(), list: list.slice(0, n) })); break; } catch {}
      }
      setStations(list, false);
    } catch (e) {
      if (!state.stations.length) {
        $('#stations').innerHTML = `<li class="empty">Couldn't reach the station directory. Check your connection, then <button class="chip" id="retryBtn" aria-selected="true">Try again</button></li>`;
        $('#retryBtn').addEventListener('click', loadStations);
        $('#countText').textContent = 'Offline';
      } else toast('Showing saved stations. The live directory is unreachable right now.');
    }
  }

  function setStations(list, fromCache) {
    state.stations = list;
    updateCount();
    if (state.mode === 'radio') globe.pointsData(list);
    applyFilter();
    // restore last station into the player (paused) so the app opens in a working state
    if (!state.current && !fromCache) {
      const lastId = store.get('gr-last', null);
      const last = lastId && list.find((s) => s.stationuuid === lastId);
      if (last) showInPlayer(last, false);
    }
  }

  // ---------- list ----------
  function renderSkeleton() {
    $('#stations').innerHTML = Array.from({ length: 7 }, () => '<li class="skeleton"></li>').join('');
  }
  function applyFilter() {
    const q = state.query.trim().toLowerCase();
    state.filtered = state.stations.filter((s) => {
      if (state.region === 'fav') { if (!state.favs.has(s.stationuuid)) return false; }
      else if (state.region === 'recent') { if (!(s.lastClick && Date.now() - s.lastClick < H3)) return false; }
      else if (state.region !== 'all' && s.region !== state.region) return false;
      if (!q) return true;
      return (s.name + ' ' + s.country + ' ' + s.language + ' ' + (s.tags || '')).toLowerCase().includes(q);
    });
    if (state.region === 'recent') state.filtered.sort((a, b) => b.lastClick - a.lastClick);
    scheduleKeywordSearch();
    renderList();
  }
  function artHTML(s) {
    const init = esc((s.name.match(/[A-Za-z0-9]/g) || ['R']).slice(0, 2).join('').toUpperCase());
    return s.favicon
      ? `<img src="${esc(s.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${init}'))">`
      : init;
  }
  const PAGE = 120;
  let shown = PAGE;
  function renderList(reset = true) {
    if (reset) shown = PAGE;
    const ul = $('#stations');
    const kwHTML = keywordSectionsHTML();
    if (!state.filtered.length && kwHTML) { ul.innerHTML = kwHTML; return; }
    if (!state.filtered.length) {
      ul.innerHTML = `<li class="empty">${state.region === 'fav' ? 'No saved stations yet. Tap ★ in the player to save one.' : 'No stations match that search.'}</li>`;
      return;
    }
    const cur = state.current && state.current.stationuuid;
    const header = kwHTML ? `<li class="sec-head">Stations matching “${esc(state.query.trim())}”</li>` : '';
    const activeIds = new Set(kwHTML ? kw.active.map((x) => x.stationuuid) : []);
    const rows = activeIds.size ? state.filtered.filter((x) => !activeIds.has(x.stationuuid)) : state.filtered;
    ul.innerHTML = kwHTML + (rows.length ? header : '') + rows.slice(0, shown).map((s) => `
      <li class="station${s.stationuuid === cur ? ' active' : ''}" data-id="${s.stationuuid}" tabindex="0">
        <div class="art">${artHTML(s)}</div>
        <div style="min-width:0">
          <div class="s-name">${esc(s.name)}</div>
          <div class="s-meta">${flag(s.countrycode)} ${esc(s.country)}${s.language ? ' · ' + esc(s.language.split(',')[0]) : ''}</div>
        </div>
        <div class="s-side">${s.stationuuid === cur && !audioPaused() ? '<span class="eq"><i></i><i></i><i></i></span>' : sideLabel(s)}</div>
      </li>`).join('');
  }
  $('#stations').addEventListener('scroll', (e) => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 300 && shown < state.filtered.length) {
      shown += PAGE; const top = el.scrollTop; renderList(false); el.scrollTop = top;
    }
  });
  function sideLabel(s) {
    if (s.lastClick && Date.now() - s.lastClick < H3 && (state.region === 'recent' || state.query.trim()))
      return `<span class="ago">● ${ago(s.lastClick)}</span>`;
    return s.bitrate ? s.bitrate + 'k' : '';
  }
  const findStation = (id) => state.stations.find((x) => x.stationuuid === id) || kw.extra.get(id);
  $('#stations').addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]'); if (!li) return;
    const s = findStation(li.dataset.id);
    if (s) play(s);
  });
  $('#stations').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.id) e.target.click();
  });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; applyFilter(); });
  $('#regions').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.region = b.dataset.region;
    document.querySelectorAll('#regions .chip').forEach((c) => c.setAttribute('aria-selected', String(c === b)));
    applyFilter();
    $('#stations').scrollTop = 0;
  });

  // ---------- keyword search: last 3 hours ----------
  // 1) "Mentioned": lines G-Wave translated on this device in the last 3h that contain the keyword
  // 2) "Active now": stations worldwide matching the keyword that listeners tuned to in the last 3h (Radio Browser)
  const kw = { term: '', active: [], loading: false, extra: new Map(), timer: null };
  const TKEY = 'gr-transcript';
  const loadLog = () => store.get(TKEY, []).filter((x) => Date.now() - x.t < H3);
  function logLine(st, text, orig) {
    const log = loadLog();
    log.push({ t: Date.now(), id: st.stationuuid, name: st.name, cc: st.countrycode, text, orig: orig || '' });
    store.set(TKEY, log.slice(-1500));
  }
  const hl = (text, q) => {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    const a = Math.max(0, i - 60), b = Math.min(text.length, i + q.length + 80);
    return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, b)) + (b < text.length ? '…' : '');
  };
  function keywordSectionsHTML() {
    const q = state.query.trim().toLowerCase();
    if (q.length < 2) return '';
    const hits = loadLog().filter((x) => (x.text + ' ' + (x.orig || '')).toLowerCase().includes(q)).sort((a, b) => b.t - a.t).slice(0, 30);
    let html = `<li class="sec-head">Mentioned in the last 3 hours <span>${hits.length}</span></li>`;
    html += hits.length
      ? hits.map((h) => `<li class="mention" data-id="${esc(h.id)}" tabindex="0">
          <div class="m-top"><b>${flag(h.cc)} ${esc(h.name)}</b><span>${ago(h.t)}</span></div>
          <p>${hl(h.text, q)}</p>${h.orig && h.orig.toLowerCase().includes(q) && !h.text.toLowerCase().includes(q) ? `<p class="orig">${hl(h.orig, q)}</p>` : ''}</li>`).join('')
      : `<li class="sec-note">Nothing heard yet. Keep subtitles on while listening and every translated line becomes searchable here for 3 hours.</li>`;
    const act = kw.active;
    html += `<li class="sec-head">Active worldwide in the last 3 hours <span>${kw.loading ? '…' : act.length}</span></li>`;
    if (kw.loading && !act.length) html += '<li class="skeleton"></li>';
    else if (!act.length) html += `<li class="sec-note">No station matching “${esc(state.query.trim())}” was tuned in during the last 3 hours.</li>`;
    else html += act.slice(0, 25).map((s) => `
      <li class="station${state.current && s.stationuuid === state.current.stationuuid ? ' active' : ''}" data-id="${s.stationuuid}" tabindex="0">
        <div class="art">${artHTML(s)}</div>
        <div style="min-width:0">
          <div class="s-name">${esc(s.name)}</div>
          <div class="s-meta">${flag(s.countrycode)} ${esc(s.country)}${s.language ? ' · ' + esc(s.language.split(',')[0]) : ''}</div>
        </div>
        <div class="s-side"><span class="ago">● ${ago(s.lastClick)}</span></div>
      </li>`).join('');
    return html;
  }
  function scheduleKeywordSearch() {
    const q = state.query.trim();
    clearTimeout(kw.timer);
    if (q.length < 2) { kw.term = ''; kw.active = []; return; }
    if (q.toLowerCase() === kw.term) return;
    kw.loading = true;
    kw.timer = setTimeout(() => runKeywordSearch(q), 450);
  }
  async function runKeywordSearch(q) {
    const term = q.toLowerCase(); kw.term = term;
    const enc = encodeURIComponent(q);
    const opt = 'hidebroken=true&order=clicktimestamp&reverse=true&limit=150';
    const local = state.stations.filter((s) => s.lastClick && Date.now() - s.lastClick < H3 &&
      (s.name + ' ' + s.country + ' ' + s.tags + ' ' + s.language).toLowerCase().includes(term));
    let remote = [];
    try {
      const res = await Promise.allSettled([
        api(`/json/stations/search?name=${enc}&${opt}`),
        api(`/json/stations/search?tag=${enc}&${opt}`),
        api(`/json/stations/search?country=${enc}&tagList=news&${opt}`),
      ]);
      remote = clean(res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])), false);
    } catch {}
    if (kw.term !== term) return; // a newer search started
    const map = new Map();
    for (const s of [...local, ...remote]) if (s.lastClick && Date.now() - s.lastClick < H3 && !map.has(s.stationuuid)) map.set(s.stationuuid, s);
    kw.active = [...map.values()].sort((a, b) => b.lastClick - a.lastClick);
    kw.active.forEach((s) => { if (!state.stations.some((x) => x.stationuuid === s.stationuuid)) kw.extra.set(s.stationuuid, s); });
    kw.loading = false;
    const ul = $('#stations'), top = ul.scrollTop; renderList(false); ul.scrollTop = top;
  }

  // Mobile bottom sheet
  const panel = $('#panel');
  if (mqMobile.matches) panel.classList.add('collapsed');
  $('#sheetHandle').addEventListener('click', () => {
    if (panel.classList.contains('expanded')) { panel.classList.remove('expanded'); panel.classList.add('collapsed'); }
    else if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
    else panel.classList.add('expanded');
  });
  $('#search').addEventListener('focus', () => { if (mqMobile.matches) { panel.classList.remove('collapsed'); panel.classList.add('expanded'); } });
  // simple swipe on handle/header
  let sy = null;
  panel.querySelector('.panel-head').addEventListener('touchstart', (e) => (sy = e.touches[0].clientY), { passive: true });
  $('#sheetHandle').addEventListener('touchstart', (e) => (sy = e.touches[0].clientY), { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (sy == null) return; const dy = e.changedTouches[0].clientY - sy; sy = null;
    if (Math.abs(dy) < 40) return;
    if (dy < 0) { panel.classList.remove('collapsed'); panel.classList.add('expanded'); }
    else if (panel.classList.contains('expanded')) panel.classList.remove('expanded');
    else panel.classList.add('collapsed');
  });

  // ---------- audio ----------
  const aCors = $('#audioCors'), aPlain = $('#audioPlain');
  let active = aCors; // element currently in use
  let corsOK = false;
  const vol = $('#volume');
  vol.value = store.get('gr-vol', 0.9);
  [aCors, aPlain].forEach((a) => (a.volume = +vol.value));
  vol.addEventListener('input', () => { [aCors, aPlain].forEach((a) => (a.volume = +vol.value)); store.set('gr-vol', +vol.value); });
  const audioPaused = () => active.paused;

  const player = $('#player');
  function setPlayerH() {
    const h = player.hidden ? 0 : player.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--player-h', h + 'px');
  }
  window.addEventListener('resize', setPlayerH);

  function showInPlayer(s, focus = true) {
    state.current = s;
    player.hidden = false;
    $('#npName').textContent = s.name;
    $('#npMeta').innerHTML = `<span class="live">● LIVE</span> · ${flag(s.countrycode)} ${esc(s.country)}${s.codec ? ' · ' + esc(s.codec) : ''}${s.bitrate ? ' ' + s.bitrate + ' kbps' : ''}`;
    const art = $('#npArt'); art.className = 'np-art art'; art.innerHTML = artHTML(s);
    $('#favBtn').setAttribute('aria-pressed', String(state.favs.has(s.stationuuid)));
    player.classList.add('paused');
    setPlayerH();
    if (state.mode === 'radio') globe.pointsData(state.stations).ringsData(s.geo_lat != null ? [s] : []);
    applyGlobeColors();
    if (focus) {
      ctrl.autoRotate = false;
      if (s.geo_lat != null) globe.pointOfView({ lat: s.geo_lat, lng: s.geo_long, altitude: mqMobile.matches ? 2.2 : 1.7 }, 1400);
      clearTimeout(resumeT);
      resumeT = setTimeout(() => (ctrl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches), 9000);
    }
    renderList(false);
  }

  let playToken = 0;
  async function play(s) {
    const token = ++playToken;
    showInPlayer(s, true);
    store.set('gr-last', s.stationuuid);
    document.body.classList.add('playing');
    if (mqMobile.matches && panel.classList.contains('expanded')) { panel.classList.remove('expanded'); panel.classList.add('collapsed'); }
    player.classList.add('loading');
    [aCors, aPlain].forEach((a) => { a.pause(); a.removeAttribute('src'); a.load(); });
    clearCaptions();
    // Count the click with Radio Browser (helps their popularity ranking)
    if (apiBase) fetch(`${apiBase}/json/url/${s.stationuuid}`).catch(() => {});

    // 1) try with CORS so we can read the audio for subtitles
    ensureAudioGraph();
    corsOK = await tryPlay(aCors, s.url, token);
    if (token !== playToken) return;
    if (corsOK) { active = aCors; }
    else {
      // 2) fall back to plain playback (no audio access → no subtitles)
      const ok = await tryPlay(aPlain, s.url, token);
      if (token !== playToken) return;
      if (!ok) {
        player.classList.remove('loading'); player.classList.add('paused');
        toast(`${s.name} isn't broadcasting right now. Try another station.`);
        return;
      }
      active = aPlain;
    }
    player.classList.remove('loading', 'paused');
    updateMediaSession(s);
    renderList(false);
    if (state.ccOn) startCaptions();
  }

  function tryPlay(el, url, token) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (done) return; done = true; cleanup(); resolve(ok); };
      const onPlay = () => finish(true);
      const onErr = () => finish(false);
      const to = setTimeout(() => finish(false), 12000);
      function cleanup() { clearTimeout(to); el.removeEventListener('playing', onPlay); el.removeEventListener('error', onErr); }
      el.addEventListener('playing', onPlay); el.addEventListener('error', onErr);
      el.src = url;
      const p = el.play();
      if (p) p.catch((err) => { if (err && err.name === 'NotAllowedError') finish(false); });
      if (token !== playToken) finish(false);
    });
  }

  $('#playBtn').addEventListener('click', () => {
    if (!state.current) return;
    if (!active.src) { play(state.current); return; }
    if (active.paused) {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      active.play().then(() => { player.classList.remove('paused'); renderList(false); if (state.ccOn) startCaptions(); }).catch(() => play(state.current));
    } else {
      active.pause(); player.classList.add('paused'); stopCaptions(false); renderList(false);
    }
  });
  [aCors, aPlain].forEach((a) => {
    a.addEventListener('waiting', () => a === active && player.classList.add('loading'));
    a.addEventListener('playing', () => a === active && player.classList.remove('loading'));
  });

  $('#favBtn').addEventListener('click', () => {
    const s = state.current; if (!s) return;
    if (state.favs.has(s.stationuuid)) state.favs.delete(s.stationuuid); else state.favs.add(s.stationuuid);
    store.set('gr-favs', [...state.favs]);
    $('#favBtn').setAttribute('aria-pressed', String(state.favs.has(s.stationuuid)));
    toast(state.favs.has(s.stationuuid) ? `Saved ${s.name}` : `Removed ${s.name} from saved`, 1800);
    if (state.region === 'fav') applyFilter();
  });

  function updateMediaSession(s) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.name, artist: `${s.country} · Live news`, album: 'G-Wave',
      artwork: [{ src: s.favicon || 'icons/icon-512.png', sizes: '512x512' }],
    });
    navigator.mediaSession.setActionHandler('play', () => $('#playBtn').click());
    navigator.mediaSession.setActionHandler('pause', () => $('#playBtn').click());
    const step = (d) => () => {
      const list = state.filtered.length ? state.filtered : state.stations;
      const i = list.findIndex((x) => x.stationuuid === state.current.stationuuid);
      play(list[(i + d + list.length) % list.length]);
    };
    navigator.mediaSession.setActionHandler('nexttrack', step(1));
    navigator.mediaSession.setActionHandler('previoustrack', step(-1));
  }

  // ---------- live translation (Whisper in a worker) ----------
  // Audio is cut into short chunks at natural pauses, nothing is dropped while the
  // translator is busy (chunks queue and merge), and words stream onto screen as they decode.
  let audioCtx = null, tap = null, worker = null, modelReady = false, modelLoading = false, busy = false;
  let buf = [], bufLen = 0, capturing = false, pending = null, device = 'wasm';
  const TARGET_SR = 16000, MAX_S = 12;
  let chunkS = 4; // adapts to how fast this device translates

  // Capture runs on the audio thread (AudioWorklet), so a busy page never drops audio;
  // blocks are queued and delivered in order. ScriptProcessor is only a fallback for old browsers.
  const WORKLET_SRC = `
    class Tap extends AudioWorkletProcessor {
      constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
      process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch) {
          for (let i = 0; i < ch.length; i++) {
            this.buf[this.n++] = ch[i];
            if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(4096); this.n = 0; }
          }
        }
        return true;
      }
    }
    registerProcessor('gr-tap', Tap);`;
  function onPcm(block) {
    if (!capturing) return;
    const ds = downsample(block, audioCtx.sampleRate, TARGET_SR);
    buf.push(ds); bufLen += ds.length;
    if (bufLen >= TARGET_SR * chunkS) cutChunk();
  }
  function ensureAudioGraph() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    const src = audioCtx.createMediaElementSource(aCors);
    src.connect(audioCtx.destination);
    const mute = audioCtx.createGain(); mute.gain.value = 0; mute.connect(audioCtx.destination);
    const useScriptProcessor = () => {
      tap = audioCtx.createScriptProcessor(4096, 1, 1);
      tap.onaudioprocess = (e) => onPcm(e.inputBuffer.getChannelData(0));
      src.connect(tap); tap.connect(mute);
    };
    if (audioCtx.audioWorklet && window.AudioWorkletNode) {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
      audioCtx.audioWorklet.addModule(url).then(() => {
        tap = new AudioWorkletNode(audioCtx, 'gr-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
        tap.port.onmessage = (e) => onPcm(e.data);
        src.connect(tap); tap.connect(mute);
      }).catch(useScriptProcessor);
    } else useScriptProcessor();
  }
  function downsample(data, from, to) {
    if (from === to) return new Float32Array(data);
    const ratio = from / to, len = Math.floor(data.length / ratio), out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const st = Math.floor(i * ratio), en = Math.min(Math.floor((i + 1) * ratio), data.length);
      let sum = 0; for (let j = st; j < en; j++) sum += data[j];
      out[i] = sum / Math.max(1, en - st);
    }
    return out;
  }
  const rmsOf = (a, from = 0, to = a.length) => {
    let r = 0, n = 0; for (let i = from; i < to; i += 2) { r += a[i] * a[i]; n++; }
    return Math.sqrt(r / Math.max(1, n));
  };
  // Cut at the quietest 100 ms in the last second so words aren't split in half
  function cutChunk() {
    const all = new Float32Array(bufLen); let o = 0;
    for (const x of buf) { all.set(x, o); o += x.length; }
    const win = 1600, searchFrom = Math.max(0, all.length - TARGET_SR);
    let cut = all.length, best = Infinity;
    for (let i = searchFrom; i + win <= all.length; i += 400) {
      const r = rmsOf(all, i, i + win); if (r < best) { best = r; cut = i + win / 2; }
    }
    const chunk = all.slice(0, cut), rest = all.slice(cut);
    buf = rest.length ? [rest] : []; bufLen = rest.length;
    if (rmsOf(chunk) < 0.004) return; // dead air or quiet music bed
    enqueue(chunk);
  }
  function enqueue(chunk) {
    if (!modelReady) return;
    if (busy) {
      // merge into the waiting chunk instead of dropping speech; keep the newest MAX_S seconds
      if (!pending) pending = chunk;
      else {
        const m = new Float32Array(pending.length + chunk.length); m.set(pending); m.set(chunk, pending.length);
        pending = m.length > TARGET_SR * MAX_S ? m.slice(m.length - TARGET_SR * MAX_S) : m;
      }
      return;
    }
    send(chunk);
  }
  function send(chunk) {
    busy = true;
    const st = state.current;
    worker.postMessage({ type: 'run', audio: chunk, language: langCode(st), sid: st.stationuuid, secs: chunk.length / TARGET_SR }, [chunk.buffer]);
  }
  function afterResult(ms, secs) {
    busy = false;
    // adapt chunk length: shorter when the device keeps up, longer when it falls behind
    const ratio = ms / 1000 / Math.max(1, secs);
    if (ratio < 0.35) chunkS = Math.max(2.5, chunkS - 0.5);
    else if (ratio > 0.85) chunkS = Math.min(8, chunkS + 1);
    if (pending && capturing) { const p = pending; pending = null; send(p); }
  }

  function capStatus(html) { $('#capStatus').innerHTML = html; $('#capStatus').hidden = !html; }
  function clearCaptions() { $('#capLines').innerHTML = ''; buf = []; bufLen = 0; pending = null; }
  // Whisper's well-known filler phrases on music, jingles and silence
  const HALLUCINATIONS = /^\s*(?:(?:thank(?:s| you)(?: (?:very|so) much)?(?: for (?:watching|listening|your attention))?|you|bye(?: bye)?|okay|so|\[[^\]]*\]|\([^)]*\)|♪+|\.+|-+)[.!\s]*)+$|subtitles? by|amara\.org|please subscribe|like and subscribe|transcribed by/i;
  let mtNote = '';
  const LANG_NAME = Object.fromEntries(Object.entries(LANG).map(([k, v]) => [v, k[0].toUpperCase() + k.slice(1)]));
  const liveStatus = () => capStatus(`<span class="eq"><i></i><i></i><i></i></span> Live English translation · ${device === 'webgpu' ? 'GPU' : 'CPU'}${mtNote}`);
  function liveLine() {
    const lines = $('#capLines');
    let el = lines.querySelector('.cap-line.live');
    if (!el) { el = document.createElement('div'); el.className = 'cap-line live'; lines.appendChild(el); }
    return el;
  }
  function showPartial(text, src) {
    text = (text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const el = liveLine();
    el.classList.toggle('src', !!src);
    if (src) {
      const code = langCode(state.current) || '';
      el.innerHTML = (code ? `<span class="src-tag">${esc(code.toUpperCase())}</span>` : '') + esc(text);
    } else el.textContent = text;
  }
  function pushCaption(text, sid, orig) {
    text = (text || '').replace(/\s+/g, ' ').trim();
    const lines = $('#capLines');
    const live = lines.querySelector('.cap-line.live');
    if (!text || HALLUCINATIONS.test(text)) { if (live) live.remove(); return; }
    lines.querySelectorAll('.cap-line:not(.live)').forEach((l) => l.classList.add('old'));
    const el = live || liveLine();
    el.classList.remove('live', 'src'); el.textContent = text;
    while (lines.children.length > 2) lines.firstElementChild.remove();
    liveStatus();
    const st = (state.current && state.current.stationuuid === sid) ? state.current : findStation(sid);
    if (st) { logLine(st, text, orig); if (state.query.trim().length >= 2) { const ul = $('#stations'), top = ul.scrollTop; renderList(false); ul.scrollTop = top; } }
  }

  function initWorker() {
    if (worker) return;
    worker = new Worker('asr-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        capStatus(`Downloading translator <span class="bar"><i style="width:${Math.round(m.pct)}%"></i></span> ${Math.round(m.pct)}%`);
      } else if (m.type === 'ready') {
        modelReady = true; modelLoading = false; device = m.device || 'wasm';
        chunkS = device === 'webgpu' ? 3 : 5;
        capStatus('Listening… first words in a few seconds');
        if (corsOK && !active.paused) { buf = []; bufLen = 0; capturing = true; }
      } else if (m.type === 'partial') {
        if (state.current && m.sid === state.current.stationuuid) showPartial(m.text, m.src);
      } else if (m.type === 'mt-loading' || m.type === 'mt-progress') {
        const code = langCode(state.current);
        const name = (code && LANG_NAME[code]) || 'language';
        mtNote = m.type === 'mt-progress' ? ` · downloading ${name} translator ${Math.round(m.pct)}%` : ` · preparing ${name} translator`;
        if ($('#capLines').children.length) liveStatus();
      } else if (m.type === 'mt-ready') {
        mtNote = ''; if ($('#capLines').children.length) liveStatus();
      } else if (m.type === 'mt-unavailable') {
        mtNote = ' · basic mode';
      } else if (m.type === 'result') {
        if (state.current && m.sid === state.current.stationuuid) pushCaption(m.text, m.sid, m.orig);
        afterResult(m.ms || 0, m.secs || chunkS);
      } else if (m.type === 'error') {
        afterResult(0, chunkS);
        console.warn('translator:', m.message);
      } else if (m.type === 'fatal') {
        busy = false; modelLoading = false;
        capStatus('Translator couldn\'t start: ' + esc(m.message || 'unknown error'));
      }
    };
    worker.onerror = (e) => {
      console.warn('translator worker failed:', e && e.message, e && e.filename, e && e.lineno);
      modelLoading = false; worker = null;
      capStatus(navigator.onLine === false ? 'Translator needs internet the first time it loads.' : 'Translator couldn\'t load. Check your connection and tap CC again.');
    };
  }

  function startCaptions() {
    $('#captions').hidden = false;
    if (!state.current || active.paused) { capStatus('Play a station to see subtitles'); return; }
    if (!corsOK) {
      capStatus('This station blocks audio access, so subtitles aren\'t available. Most international broadcasters work.');
      capturing = false; return;
    }
    initWorker();
    if (!modelReady && !modelLoading) {
      modelLoading = true;
      capStatus('Preparing translator…');
      worker.postMessage({ type: 'load', language: langCode(state.current) });
    } else if (modelReady) {
      buf = []; bufLen = 0; pending = null; capturing = true;
      worker.postMessage({ type: 'prepare', language: langCode(state.current) });
      if (!$('#capLines').children.length) capStatus('Listening… first words in a few seconds');
    }
  }
  function stopCaptions(hide = true) {
    capturing = false; buf = []; bufLen = 0; pending = null;
    if (hide) $('#captions').hidden = true;
  }
  function setCC(on) {
    state.ccOn = on; store.set('gr-cc', on);
    $('#ccBtn').setAttribute('aria-pressed', String(on));
    if (on) startCaptions(); else stopCaptions(true);
  }
  $('#ccBtn').addEventListener('click', () => {
    if (!state.ccOn && !store.get('gr-cc-told', false)) {
      toast('Subtitles run on your device. The first time, a ~80 MB translator downloads and is then cached.', 5200);
      store.set('gr-cc-told', true);
    }
    setCC(!state.ccOn);
  });
  $('#ccBtn').setAttribute('aria-pressed', String(state.ccOn));

  // ---------- News mode: world newspaper headlines + news audio ----------
  // Headlines come from many free sources at once (see news-sources.js), merged and de-duplicated,
  // so one source being slow or down never leaves the list empty.
  // Audio: the browser's built-in speech voices (Web Speech API).
  // country name -> ISO code (for flags and globe placement)
  const NAME_CC = {};
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    Object.keys(CENTROID).forEach((cc) => { const n = dn.of(cc); if (n) NAME_CC[n.toLowerCase().replace(/[^a-z]/g, '')] = cc; });
  } catch {}
  Object.assign(NAME_CC, { unitedstates: 'US', usa: 'US', unitedkingdom: 'GB', uk: 'GB', southkorea: 'KR', northkorea: 'KP', russia: 'RU',
    hongkong: 'HK', macau: 'MO', czechrepublic: 'CZ', burma: 'MM', ivorycoast: 'CI', turkey: 'TR', macedonia: 'MK', palestine: 'PS',
    occupiedpalestinianterritory: 'PS', westbank: 'PS', gazastrip: 'PS', taiwan: 'TW', vietnam: 'VN', iran: 'IR', syria: 'SY', laos: 'LA',
    congo: 'CG', democraticrepublicofthecongo: 'CD', unitedarabemirates: 'AE', bosniaandherzegovina: 'BA' });
  const ccOf = (name) => NAME_CC[String(name || '').toLowerCase().replace(/[^a-z]/g, '')] || '';

  const news = {
    topic: 'top', region: 'all', span: '3h', english: true, query: '', country: null,
    items: [], earlier: [], points: [], loading: false, status: [], open: null,
    speaking: -1, bulletin: false, reqId: 0, keys: store.get('gw-news-keys', {}),
  };
  const NS = window.GWNewsSources;

  const normTitle = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 70);
  function mergeNews(raw) {
    const seen = new Map();
    for (const a of raw) {
      if (!a.cc && a.country) a.cc = ccOf(a.country);
      if (!a.country && a.cc) a.country = countryName(a.cc);
      const k = normTitle(a.title);
      if (!k) continue;
      const prev = seen.get(k);
      // keep the richest copy of a story (image + summary win)
      if (!prev || (!prev.image && a.image) || (!prev.desc && a.desc && !(prev.image && !a.image))) seen.set(k, { ...prev, ...a, also: prev ? (prev.also || 1) + 1 : 1 });
      else prev.also = (prev.also || 1) + 1;
    }
    const list = [...seen.values()].sort((x, y) => (y.time || 0) - (x.time || 0));
    const cutoff = Date.now() - NS.spanMs(news.span);
    let fresh = list.filter((x) => x.time && x.time >= cutoff);
    const undated = list.filter((x) => !x.time);
    const older = list.filter((x) => x.time && x.time < cutoff);
    if (news.cc) { fresh = fresh.filter((x) => x.cc === news.cc); }
    return { fresh: [...fresh, ...undated].slice(0, 200), earlier: older.filter((x) => !news.cc || x.cc === news.cc).slice(0, 60) };
  }
  let countryNamer = null;
  try { countryNamer = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
  const countryName = (cc) => { try { return (countryNamer && countryNamer.of(cc)) || cc; } catch { return cc; } };

  async function loadNews() {
    const id = ++news.reqId;
    news.loading = true; news.status = []; stopSpeaking();
    news.cc = news.country ? ccOf(news.country) : null;
    renderNews(); updateCount();
    if (!NS) { news.loading = false; renderNews(); return; }
    const apply = (raw, status, done) => {
      if (id !== news.reqId) return;
      const { fresh, earlier } = mergeNews(raw);
      news.items = fresh; news.earlier = earlier; news.status = status;
      if (done) { news.loading = false; try { if (fresh.length) localStorage.setItem('gw-news-last', JSON.stringify({ t: Date.now(), items: fresh.slice(0, 80) })); } catch {} }
      if (news.open != null && news.open >= news.items.length) news.open = null;
      buildNewsPoints();
      const ul = $('#newsList'), top = ul.scrollTop; renderNews(); ul.scrollTop = top;
      if (state.mode === 'news') updateCount();
    };
    await NS.fetchAll({
      topic: news.topic, region: news.region, country: news.country, cc: news.cc, query: news.query,
      span: news.span, english: news.english, keys: news.keys,
    }, apply);
  }
  // show the last headlines instantly while fresh ones load
  try {
    const last = JSON.parse(localStorage.getItem('gw-news-last') || 'null');
    if (last && last.items && Date.now() - last.t < 12 * 3600e3) news.items = last.items;
  } catch {}

  function buildNewsPoints() {
    const by = new Map();
    for (const a of news.items) {
      const c = CENTROID[a.cc]; if (!c) continue;
      const p = by.get(a.cc) || { cc: a.cc, country: a.country, geo_lat: c[0], geo_long: c[1], count: 0 };
      p.count++; by.set(a.cc, p);
    }
    news.points = [...by.values()];
    if (state.mode === 'news') globe.pointsData(news.points).ringsData([]);
  }
  function pickList() { return state.mode === 'news' ? news.points : state.stations; }
  function pickNewsCountry(p) {
    news.country = p.country || countryName(p.cc); news.query = ''; $('#newsSearch').value = '';
    globe.pointOfView({ lat: p.geo_lat, lng: p.geo_long, altitude: mqMobile.matches ? 2.2 : 1.8 }, 1200);
    ctrl.autoRotate = false; clearTimeout(resumeT);
    resumeT = setTimeout(() => (ctrl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches), 9000);
    if (mqMobile.matches) { panel.classList.remove('collapsed'); }
    loadNews();
  }

  const newsAgo = (t) => (t ? ago(t) : '');
  function newsCard(a, i) {
    const open = news.open === i, playing = news.speaking === i;
    const meta = [a.domain, a.country, newsAgo(a.time)].filter(Boolean).map(esc).join(' · ');
    return `<li class="news-item${open ? ' open' : ''}${playing ? ' speaking' : ''}" data-i="${i}">
      <button class="news-row" aria-expanded="${open}">
        ${a.image ? `<span class="thumb"><img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg');this.remove()"></span>` : `<span class="thumb noimg">${flag(a.cc) || '📰'}</span>`}
        <span class="n-text">
          <span class="n-title">${esc(a.title)}</span>
          <span class="n-meta">${a.cc ? flag(a.cc) + ' ' : ''}${meta}</span>
        </span>
        ${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : ''}
      </button>
      ${open ? `<div class="n-info">
        ${a.image ? `<img class="n-hero" src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        ${a.desc ? `<p class="n-desc">${esc(a.desc)}</p>` : ''}
        <dl class="n-facts">
          <div><dt>Source</dt><dd>${esc(a.domain || '—')}</dd></div>
          <div><dt>Country</dt><dd>${a.cc ? flag(a.cc) + ' ' : ''}${esc(a.country || '—')}</dd></div>
          <div><dt>Language</dt><dd>${esc(a.lang || '—')}</dd></div>
          <div><dt>Found via</dt><dd>${esc(a.src || '—')}${a.also > 1 ? ` · ${a.also} reports` : ''}</dd></div>
          <div><dt>Published</dt><dd>${a.time ? esc(new Date(a.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) + ' · ' + esc(newsAgo(a.time)) : '—'}</dd></div>
        </dl>
        <div class="n-actions">
          <button class="n-btn primary" data-act="listen">${playing ? 'Stop' : 'Listen'}</button>
          <a class="n-btn" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Read full article ↗</a>
          ${CENTROID[a.cc] ? '<button class="n-btn" data-act="globe">Show on globe</button>' : ''}
        </div>
      </div>` : ''}
    </li>`;
  }
  const newsAll = () => news.items.concat(news.earlier || []);
  function sourcesSummary() {
    const st = news.status || [];
    const ok = st.filter((x) => x.state === 'ok').length, busy = st.filter((x) => x.state === 'loading').length;
    return { ok, busy, total: st.length };
  }
  function renderNews() {
    const ul = $('#newsList');
    const f = $('#newsFilter');
    const bits = [];
    if (news.country) bits.push(`<button class="chip filter-chip" data-clear="country" aria-selected="true">${flag(ccOf(news.country))} ${esc(news.country)} ✕</button>`);
    if (news.query.trim()) bits.push(`<button class="chip filter-chip" data-clear="query" aria-selected="true">“${esc(news.query.trim())}” ✕</button>`);
    f.innerHTML = bits.join(''); f.hidden = !bits.length;
    const { ok, busy, total } = sourcesSummary();
    $('#sourcesCount').textContent = total ? `${ok}/${total}` : '';
    $('#sourcesBtn').classList.toggle('busy', busy > 0);
    if (!$('#sourcesPanel').hidden) renderSources();
    const all = newsAll();
    if (!all.length && news.loading) { ul.innerHTML = Array.from({ length: 6 }, () => '<li class="skeleton"></li>').join(''); return; }
    const spanText = { '1h': 'last hour', '3h': 'last 3 hours', '24h': 'last 24 hours' }[news.span];
    const head = `<li class="sec-head">${news.items.length} headlines · ${spanText}<span>${news.loading ? `loading ${busy} source${busy === 1 ? '' : 's'}…` : `${ok} source${ok === 1 ? '' : 's'}`}</span></li>`;
    if (!all.length) {
      const offline = navigator.onLine === false;
      ul.innerHTML = head + `<li class="sec-note">${offline ? 'You’re offline. Headlines will load when you reconnect.'
        : total && !ok ? 'None of the news sources could be reached from here. If you opened G-Wave inside a preview or an app, open it in your browser (Chrome, Safari, Edge). <button class="link-btn" data-act="sources">See sources</button>'
        : 'No headlines match. Try a wider time window, another topic, or clear the search.'}</li>`;
      return;
    }
    let html = head;
    if (!news.items.length) html += `<li class="sec-note">Nothing new in the ${spanText}. Here are the latest earlier headlines.</li>`;
    html += news.items.map((a, i) => newsCard(a, i)).join('');
    if (news.earlier && news.earlier.length) {
      html += `<li class="sec-head">Earlier<span>${news.earlier.length}</span></li>`;
      html += news.earlier.map((a, k) => newsCard(a, news.items.length + k)).join('');
    }
    ul.innerHTML = html;
  }

  // ---- sources panel: live status + optional free API keys ----
  function renderSources() {
    const st = news.status || [];
    const icon = { ok: '✓', empty: '–', error: '✕', loading: '…' };
    const rows = st.map((x) => `<li class="src-row ${x.state}">
        <span class="src-dot" aria-hidden="true">${icon[x.state]}</span>
        <span class="src-name"><b>${esc(x.name)}</b><small>${esc(x.kind)}${x.state === 'error' ? ' · ' + esc(x.error) : ''}</small></span>
        <span class="src-n">${x.state === 'loading' ? 'loading' : x.state === 'error' ? 'unavailable' : `${x.count} · ${(x.ms / 1000).toFixed(1)}s`}</span>
      </li>`).join('');
    const keys = Object.entries(NS ? NS.KEYED : {}).map(([id, d]) => `<div class="key-row">
        <label for="key-${id}"><b>${esc(d.label)}</b><small>Free: ${esc(d.free)} · <a href="${esc(d.signup)}" target="_blank" rel="noopener noreferrer">get a key ↗</a></small></label>
        <input id="key-${id}" data-key="${id}" type="password" autocomplete="off" spellcheck="false" placeholder="Paste API key" value="${esc(news.keys[id] || '')}">
      </div>`).join('');
    $('#sourcesBody').innerHTML = `
      <p class="menu-label">Sources for this view</p>
      <ul class="src-list">${rows || '<li class="sec-note">Sources appear here when headlines load.</li>'}</ul>
      <p class="menu-label">More sources with your own free key</p>
      <p class="sec-note">Optional. Keys stay in this browser only and are sent only to that provider.</p>
      ${keys}
      <div class="n-actions"><button class="n-btn primary" id="saveKeys">Save keys & reload</button></div>`;
  }
  $('#sourcesBtn').addEventListener('click', () => {
    const p = $('#sourcesPanel'); p.hidden = !p.hidden;
    $('#sourcesBtn').setAttribute('aria-expanded', String(!p.hidden));
    if (!p.hidden) renderSources();
  });
  $('#sourcesPanel').addEventListener('click', (e) => {
    if (e.target.closest('#sourcesClose')) { $('#sourcesPanel').hidden = true; $('#sourcesBtn').setAttribute('aria-expanded', 'false'); }
    if (e.target.closest('#saveKeys')) {
      const keys = {};
      $('#sourcesPanel').querySelectorAll('[data-key]').forEach((inp) => { const v = inp.value.trim(); if (v) keys[inp.dataset.key] = v; });
      news.keys = keys; store.set('gw-news-keys', keys);
      toast(Object.keys(keys).length ? `Saved ${Object.keys(keys).length} key${Object.keys(keys).length === 1 ? '' : 's'}` : 'Keys cleared', 1600);
      loadNews();
    }
  });

  // ---- news audio (Web Speech API) ----
  const synth = window.speechSynthesis;
  let voices = [];
  const loadVoices = () => { try { voices = synth ? synth.getVoices() : []; } catch { voices = []; } };
  if (synth) { loadVoices(); synth.addEventListener && synth.addEventListener('voiceschanged', loadVoices); }
  function voiceFor(langName) {
    const code = LANG[String(langName || '').toLowerCase()] || 'en';
    const list = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(code));
    return { code, voice: list.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) || list.find((v) => v.default) || list[0] || null };
  }
  function chime() {
    try {
      ensureAudioGraph();
      const ctx = audioCtx; if (!ctx) return;
      const t = ctx.currentTime;
      [880, 1320].forEach((f, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t + k * 0.14); g.gain.exponentialRampToValueAtTime(0.18, t + k * 0.14 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.14 + 0.22);
        o.connect(g); g.connect(ctx.destination); o.start(t + k * 0.14); o.stop(t + k * 0.14 + 0.25);
      });
    } catch {}
  }
  function say(text, langName, onend) {
    const u = new SpeechSynthesisUtterance(text);
    const { code, voice } = voiceFor(langName);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : code; u.rate = 1; u.pitch = 1;
    u.onend = onend; u.onerror = onend;
    synth.speak(u);
  }
  function stopSpeaking() {
    news.bulletin = false;
    if (synth) synth.cancel();
    if (news.speaking !== -1) { news.speaking = -1; renderNews(); }
    $('#bulletinBtn').setAttribute('aria-pressed', 'false');
    $('#bulletinBtn').querySelector('span').textContent = 'Play bulletin';
  }
  function speakItem(i, then) {
    const a = newsAll()[i]; if (!a) { stopSpeaking(); return; }
    if (state.current && !audioPaused()) $('#playBtn').click(); // pause the radio while reading the news
    news.speaking = i; renderNews();
    const li = $(`#newsList [data-i="${i}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (CENTROID[a.cc]) globe.ringsData([{ geo_lat: CENTROID[a.cc][0], geo_long: CENTROID[a.cc][1] }]);
    const from = [a.domain, a.country].filter(Boolean).join(', ');
    const english = !a.lang || /english/i.test(a.lang);
    const text = `${a.title}. ${a.desc ? a.desc + ' ' : ''}${english ? `From ${from}.` : ''}`;
    say(text, a.lang, () => {
      if (news.speaking !== i) return;
      if (then) then(); else { news.speaking = -1; globe.ringsData([]); renderNews(); }
    });
  }
  function startBulletin() {
    if (!synth) { toast('This browser has no built-in voices, so news audio isn’t available.'); return; }
    if (!newsAll().length) return;
    synth.cancel();
    news.bulletin = true;
    $('#bulletinBtn').setAttribute('aria-pressed', 'true');
    $('#bulletinBtn').querySelector('span').textContent = 'Stop';
    const n = Math.min(newsAll().length, 20);
    const where = news.country || (news.region === 'all' ? 'around the world' : news.region);
    chime();
    setTimeout(() => {
      say(`G-Wave news. ${n} headlines from ${where}.`, 'english', () => {
        let i = 0;
        const next = () => {
          if (!news.bulletin) return;
          if (i >= n) { say('That was the G-Wave bulletin.', 'english', stopSpeaking); return; }
          const k = i++;
          setTimeout(() => news.bulletin && (chime(), speakItem(k, next)), 450);
        };
        next();
      });
    }, 500);
  }

  // ---- news UI events ----
  $('#newsList').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="sources"]')) { $('#sourcesBtn').click(); return; }
    const li = e.target.closest('.news-item'); if (!li) return;
    const i = +li.dataset.i, a = newsAll()[i];
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'listen') {
      if (news.speaking === i) stopSpeaking();
      else if (!synth) toast('This browser has no built-in voices, so news audio isn’t available.');
      else { stopSpeaking(); speakItem(i); }
      return;
    }
    if (act && act.dataset.act === 'globe') {
      const c = CENTROID[a.cc];
      globe.pointOfView({ lat: c[0], lng: c[1], altitude: 1.8 }, 1200); globe.ringsData([{ geo_lat: c[0], geo_long: c[1] }]);
      ctrl.autoRotate = false; return;
    }
    if (e.target.closest('.news-row')) { news.open = news.open === i ? null : i; renderNews(); }
  });
  $('#newsFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]'); if (!b) return;
    if (b.dataset.clear === 'country') news.country = null; else { news.query = ''; $('#newsSearch').value = ''; }
    loadNews();
  });
  const chipGroup = (sel, attr, key) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    news[key] = b.dataset[attr];
    if (key === 'region') news.country = null;
    $(sel).querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', String(c === b)));
    loadNews();
  });
  chipGroup('#newsTopics', 'topic', 'topic');
  chipGroup('#newsRegions', 'nregion', 'region');
  $('#newsSpan').addEventListener('change', (e) => { news.span = e.target.value; loadNews(); });
  $('#newsEnglish').addEventListener('click', (e) => {
    news.english = !news.english; e.currentTarget.setAttribute('aria-pressed', String(news.english)); loadNews();
  });
  let newsT;
  $('#newsSearch').addEventListener('input', (e) => {
    clearTimeout(newsT);
    const v = e.target.value;
    if (v.trim().length && v.trim().length < 3) return; // the news index needs 3+ letters
    newsT = setTimeout(() => { news.query = v; loadNews(); }, 800);
  });
  $('#newsSearch').addEventListener('focus', () => { if (mqMobile.matches) { panel.classList.remove('collapsed'); panel.classList.add('expanded'); } });
  $('#bulletinBtn').addEventListener('click', () => (news.bulletin ? stopSpeaking() : startBulletin()));

  // ---------- Radio / News mode switch ----------
  const HERO = {
    radio: ['World news radio, live', 'Spin the planet.<br>Hear the headlines.', 'Tap any glowing point to tune in to a news station. Turn on CC for live English translation, then search any topic to see what was said in the last 3 hours.'],
    news: ['World newspapers, live', 'Every front page.<br>One planet.', 'Headlines from news sites in every country, updated every 15 minutes. Tap a country to filter, open a story for details, or play a spoken bulletin.'],
  };
  function updateCount() {
    if (state.mode === 'news') {
      $('#countText').textContent = news.loading && !news.items.length ? 'Fetching headlines…' : `${news.items.length} headlines · ${news.points.length} countries`;
    } else if (state.stations.length) {
      $('#countText').textContent = `${state.stations.length} stations · ${new Set(state.stations.map((x) => x.countrycode)).size} countries`;
    }
  }
  function setMode(mode, first = false) {
    state.mode = mode; store.set('gw-mode', mode);
    document.body.dataset.mode = mode;
    const btn = $('#modeBtn');
    btn.setAttribute('aria-checked', String(mode === 'news'));
    btn.title = mode === 'news' ? 'Switch to Radio' : 'Switch to News';
    $('#paneRadio').hidden = mode !== 'radio';
    $('#paneNews').hidden = mode !== 'news';
    panel.setAttribute('aria-label', mode === 'news' ? 'Headlines' : 'Stations');
    const [eb, ti, le] = HERO[mode];
    $('#heroEyebrow').textContent = eb; $('#heroTitle').innerHTML = ti; $('#heroLede').textContent = le;
    tip.hidden = true;
    if (mode === 'news') {
      globe
        .pointAltitude((d) => 0.01 + Math.min(0.14, d.count * 0.005))
        .pointRadius((d) => 0.35 + Math.min(1.6, Math.sqrt(d.count) * 0.28))
        .pointsData(news.points).ringsData([]);
      if (!news.items.length && !news.loading) loadNews();
    } else {
      stopSpeaking();
      globe
        .pointAltitude((d) => (state.current && d.stationuuid === state.current.stationuuid ? 0.03 : 0.012))
        .pointRadius((d) => (state.current && d.stationuuid === state.current.stationuuid ? 0.55 : (state.stations.length > 1500 ? 0.2 : 0.34)))
        .pointsData(state.stations).ringsData(state.current && state.current.geo_lat != null ? [state.current] : []);
    }
    applyGlobeColors();
    updateCount();
    if (!first) document.body.classList.toggle('playing', mode === 'radio' && !!state.current && !audioPaused());
  }
  $('#modeBtn').addEventListener('click', () => setMode(state.mode === 'news' ? 'radio' : 'news'));
  setMode(state.mode, true);

  // ---------- layout menu ----------
  const LAYOUT_LABEL = { auto: 'Auto', mobile: 'Mobile', tab: 'Tab' };
  function renderLayoutButton() {
    $('#layoutIcon').innerHTML = LAYOUT_ICONS[layoutPref];
    $('#layoutBadge').textContent = layoutPref === 'auto' ? 'A' : '';
    $('#layoutBadge').hidden = layoutPref !== 'auto';
    $('#layoutBtn').setAttribute('aria-label', `Layout: ${LAYOUT_LABEL[layoutPref]}${layoutPref === 'auto' ? ` (now ${layoutNow === 'tab' ? 'Tab' : layoutNow === 'mobile' ? 'Mobile' : 'Desktop'})` : ''}`);
    $('#layoutBtn').title = $('#layoutBtn').getAttribute('aria-label');
    document.querySelectorAll('.layout-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.layout === layoutPref)));
  }
  function relayout() {
    const prev = layoutNow;
    layoutNow = resolveLayout();
    if (prev !== layoutNow) {
      applyLayoutClass();
      panel.classList.remove('collapsed', 'expanded');
      if (layoutNow === 'mobile') panel.classList.add('collapsed');
      globe.pointOfView({ altitude: layoutNow === 'mobile' ? 3.5 : layoutNow === 'tab' ? 2.9 : 2.6 }, 600);
    }
    sizeGlobe(); setPlayerH(); renderLayoutButton();
  }
  $('#layoutBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#layoutMenu'); m.hidden = !m.hidden;
    $('#layoutBtn').setAttribute('aria-expanded', String(!m.hidden));
    $('#skinMenu').hidden = true;
  });
  $('#layoutMenu').addEventListener('click', (e) => {
    const b = e.target.closest('.layout-opt'); if (!b) return;
    layoutPref = b.dataset.layout; store.set('gw-layout', layoutPref);
    $('#layoutMenu').hidden = true; $('#layoutBtn').setAttribute('aria-expanded', 'false');
    relayout();
    toast(layoutPref === 'auto' ? 'Layout follows your screen' : `${LAYOUT_LABEL[layoutPref]} layout`, 1600);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.layout-wrap')) $('#layoutMenu').hidden = true; });
  window.addEventListener('resize', () => { clearTimeout(relayout._t); relayout._t = setTimeout(relayout, 150); });
  renderLayoutButton();

  // ---------- PWA ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => toast('G-Wave installed'));
  window.addEventListener('online', () => { if (!state.stations.length) loadStations(); });

  // keyboard: space toggles play
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) && state.current) { e.preventDefault(); $('#playBtn').click(); }
  });

  loadStations();
})();
