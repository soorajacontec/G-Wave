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
    kannada: 'kn', gujarati: 'gu', punjabi: 'pa', panjabi: 'pa', sinhala: 'si', sinhalese: 'si', burmese: 'my', myanmar: 'my',
    khmer: 'km', cambodian: 'km', lao: 'lo', mongolian: 'mn', kazakh: 'kk', uzbek: 'uz', pashto: 'ps', azerbaijani: 'az', azeri: 'az',
    georgian: 'ka', armenian: 'hy', bangla: 'bn', nepali: 'ne', hindustani: 'hi', 'chinese mandarin': 'zh', taiwanese: 'zh',
    tajik: 'tg', turkmen: 'tk', kyrgyz: 'ky', dhivehi: 'dv', assamese: 'as', odia: 'or', oriya: 'or', kurdish: 'ku', amharic: 'am',
  };
  const langCode = (s) => {
    if (!s) return null;
    const first = String(s.language || '').toLowerCase().split(/[,;/]/)[0].trim();
    return LANG[first] || (s.langs ? s.langs.split(',')[0] : null) || null; // fall back to the detected language
  };
  const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');

  // ---------- state ----------
  const state = {
    mode: store.get('gw-mode', 'radio'),
    lang: store.get('gw-lang', 'any'), // any | ml | ta | te | hi | kn | bn | pa | ur | ar | en
    genre: store.get('gw-genre', store.get('gw-news-only', false) ? 'news' : 'all'), // all | news | music | ent | sports | faith
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

  function setTheme(opt) {
    if (opt === 'auto') { delete document.documentElement.dataset.theme; try { localStorage.removeItem('gr-theme'); } catch {} }
    else { document.documentElement.dataset.theme = opt; try { localStorage.setItem('gr-theme', opt); } catch {} }
    renderThemeSeg(); applyGlobeColors();
  }
  function renderThemeSeg() {
    const cur = document.documentElement.dataset.theme || 'auto';
    document.querySelectorAll('#themeSeg [data-theme-opt]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === cur)));
  }
  $('#themeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-theme-opt]'); if (b) setTheme(b.dataset.themeOpt); });
  renderThemeSeg();
  $('#themeBtn').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
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
      .pointColor((d) => (state.mode === 'news' ? hexToRgba(accent, 0.92) : state.current && d.stationuuid === state.current.stationuuid ? '#ffffff' : (state.genre === 'all' && d.genre !== 'news') ? hexToRgba(accent, 0.5) : accent))
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
  // Indian states (and Sri Lanka's north) — stations without coordinates are placed in their state, not the middle of India
  const STATE_CENTROID = {
    kerala: [10.35, 76.45], 'tamil nadu': [11.1, 78.65], tamilnadu: [11.1, 78.65], 'andhra pradesh': [15.9, 79.7], telangana: [17.6, 78.9],
    karnataka: [14.2, 75.9], maharashtra: [19.4, 74.9], delhi: [28.62, 77.2], 'new delhi': [28.62, 77.2], 'uttar pradesh': [26.8, 80.9],
    'west bengal': [22.9, 87.9], punjab: [30.9, 75.6], gujarat: [22.6, 71.9], rajasthan: [26.6, 73.8], 'madhya pradesh': [23.3, 77.6],
    bihar: [25.6, 85.5], odisha: [20.4, 84.6], assam: [26.2, 92.9], goa: [15.4, 74.0], puducherry: [11.94, 79.8], pondicherry: [11.94, 79.8],
    haryana: [29.1, 76.4], 'jammu and kashmir': [33.9, 75.3], uttarakhand: [30.1, 79.2], jharkhand: [23.6, 85.3], chhattisgarh: [21.3, 81.9],
    'himachal pradesh': [31.9, 77.2], chandigarh: [30.73, 76.78], mumbai: [19.08, 72.88], bangalore: [12.97, 77.59], bengaluru: [12.97, 77.59],
    chennai: [13.08, 80.27], hyderabad: [17.39, 78.49], kolkata: [22.57, 88.36], kochi: [9.93, 76.27], thiruvananthapuram: [8.52, 76.94],
    'northern province': [9.66, 80.02], jaffna: [9.66, 80.02],
  };
  function placeByState(state, id) {
    const c = STATE_CENTROID[String(state || '').toLowerCase().trim()]; if (!c) return null;
    const h = hash(id), a = ((h & 0xffff) / 0xffff) * Math.PI * 2, r = Math.sqrt(((h >>> 16) & 0xffff) / 0xffff) * 0.45;
    return [c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r];
  }
  // Which languages a station broadcasts in, from its language field, tags, name, state and script
  const LANG_DETECT = [
    ['ml', /malayalam|മലയാളം|mollywood|yesudas|kerala|kochi|cochin|calicut|kozhikode|thrissur|trivandrum|thiruvananthapuram|kannur|kottayam|[\u0D00-\u0D7F]/i],
    ['ta', /tamil|தமிழ்|kollywood|ilaiyaraaja|ilayaraja|chennai|madras|coimbatore|madurai|trichy|tiruchi|tirunelveli|jaffna|puducherry|pondicherry|[\u0B80-\u0BFF]/i],
    ['te', /telugu|తెలుగు|tollywood|hyderabad|vijayawada|visakhapatnam|vizag|tirupati|warangal|andhra|telangana|[\u0C00-\u0C7F]/i],
    ['kn', /kannada|ಕನ್ನಡ|sandalwood|bengaluru|bangalore|mysore|mysuru|mangalore|karnataka|[\u0C80-\u0CFF]/i],
    ['pa', /punjabi|panjabi|ਪੰਜਾਬੀ|bhangra|[\u0A00-\u0A7F]/i],
    ['bn', /bengali|bangla|বাংলা|kolkata|calcutta|dhaka|[\u0980-\u09FF]/i],
    ['ur', /urdu|اردو|ghazal|qawwali/i],
    ['hi', /hindi|हिन्दी|हिंदी|bollywood|vividh bharati|filmi|kishore|rafi|lata mangeshkar|hindustani|[\u0900-\u097F]/i],
    ['ar', /arabic|عربي|العربية|khaleeji|tarab/i],
  ];
  const LANG_FIELD = { malayalam: 'ml', tamil: 'ta', telugu: 'te', kannada: 'kn', punjabi: 'pa', panjabi: 'pa', bengali: 'bn', bangla: 'bn', urdu: 'ur', hindi: 'hi', arabic: 'ar', english: 'en' };
  function detectLangs(s) {
    const out = new Set();
    String(s.language || '').toLowerCase().split(/[,;/]/).forEach((x) => { const c = LANG_FIELD[x.trim()]; if (c) out.add(c); });
    const text = [s.tags, s.name, s.state].filter(Boolean).join(' ');
    for (const [code, re] of LANG_DETECT) if (re.test(text)) out.add(code);
    return [...out].join(',');
  }
  function placeByCountry(cc, id) {
    const c = CENTROID[cc]; if (!c) return null;
    const spread = WIDE[cc] || 0.9, h = hash(id);
    const a = ((h & 0xffff) / 0xffff) * Math.PI * 2, r = Math.sqrt(((h >>> 16) & 0xffff) / 0xffff) * spread;
    return [c[0] + Math.sin(a) * r * 0.6, c[1] + Math.cos(a) * r];
  }

  const NEWS_RE = /news|talk|info|current|politic|public|noticia|nachricht|actualit|haber|berita|balita|khabar|samachar|akhbar|thời sự|tin tức|خبر|اخبار|أخبار|新闻|新聞|资讯|時事|뉴스|시사|ニュース|報道|ข่าว|समाचार|सूचना|সংবাদ|খবর|செய்தி|വാർത്ത|వార్త|ಸುದ್ದಿ|bbc|voa|rfi|\bdw\b|npr|akashvani|\bair\b|world service|radio free|sawa|farda|ozod|azadi|liberty|rthk|nhk|kbs|ytn|cna|bernama|rri\b|vov\b|trt/i;
  // Genre of a station, from its tags and name. Order matters: faith and sports first, then news, then entertainment.
  const FAITH_RE = /quran|qur'an|koran|islam|islamic|muslim|sunnah|hadith|nasheed|anasheed|christian|gospel|church|catholic|worship|praise|bible|sermon|devotional|bhajan|kirtan|gurbani|bhakti|\\bhindu\\b|vedic|sikh|buddhis|dharma|mantra|spiritual|religio|evangel|القرآن|قرآن|اسلام|إسلام|ভক্তি|भक्ति|भजन|ਗੁਰਬਾਣੀ/i;
  const SPORTS_RE = /\bsports?\b|football|soccer|cricket|\bnba\b|\bnfl\b|baseball|hockey|racing|formula ?1|\bf1\b|espn|talksport|deportes|esporte|sportradio|کرکٹ|رياضة|رياضه|체육|スポーツ/i;
  const ENT_RE = /comedy|humou?r|entertain|kids|children|child|family|story|stories|storytelling|audiobook|audio book|drama|theat(er|re)|radio play|culture|cultural|arts\b|literature|poetry|podcast|lifestyle|youth|community|tamasha|manoranjan|مسلسل|ترفيه|मनोरंजन|बच्चों|子供|어린이|动漫|드라마/i;
  const NOISE_TAGS = /^(radio|fm|am|online|internet|stream|live|music|musica|música|musik|webradio|web radio|hd|24\/7|247|station|free|top|best|the|and|[a-z]{2}|\d+)$/i;
  const NEWS_STRICT = /news|noticia|nachricht|actualit|haber|berita|balita|khabar|samachar|akhbar|thời sự|tin tức|politic|current affairs|خبر|اخبار|أخبار|新闻|新聞|뉴스|ニュース|ข่าว|समाचार|সংবাদ|খবর|செய்தி|വാർത്ത|వార్త|ಸುದ್ದಿ/i;
  const MUSIC_RE = /pop|rock|hits|top ?40|dance|electro|jazz|classical|lounge|chill|hip ?hop|rnb|r&b|country|latin|reggae|oldies|\d0s|bollywood|filmi|k-?pop|j-?pop|c-?pop|anime|khaleeji|tarab|opm|dangdut|ghazal|qawwali|carnatic|instrumental|ambient|metal|blues|soul|funk|house|techno|trance|music|musik|música|musica/i;
  function genreOf(tags, name) {
    const t = (tags || '') + ' ' + (name || '');
    if (FAITH_RE.test(t)) return 'faith';
    if (SPORTS_RE.test(tags || '')) return 'sports';
    if (NEWS_STRICT.test(t)) return 'news';      // clearly news
    if (ENT_RE.test(tags || '')) return 'ent';   // "entertainment, talk" is entertainment
    if (MUSIC_RE.test(tags || '')) return 'music'; // music tags beat a news broadcaster's name (KBS Cool FM, BBC Radio 1)
    if (NEWS_RE.test(t)) return 'news';          // talk / info / public broadcasters
    return 'music';
  }
  function tagLine(tags) {
    return String(tags || '').split(',').map((x) => x.trim()).filter((x) => x && x.length < 22 && !NOISE_TAGS.test(x)).slice(0, 2).join(', ');
  }
  const GENRE_NAME = { news: 'News & talk', music: 'Music', ent: 'Entertainment', sports: 'Sports', faith: 'Faith' };

  const GOOD_CODECS = /^(MP3|AAC|AAC\+|OGG|OPUS|UNKNOWN|)$/i;
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
      const isHls = s.hls === 1 || /\.m3u8(\?|$)/i.test(url); // HLS streams play through hls.js (common for Asian broadcasters)
      if (s.codec && !GOOD_CODECS.test(s.codec) && !isHls) continue;
      const lat = +s.geo_lat, lng = +s.geo_long;
      let hasGeo = isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0) && s.geo_lat != null;
      let glat = lat, glng = lng;
      if (!hasGeo) {
        const p = ((s.countrycode || '').toUpperCase() === 'IN' || (s.countrycode || '').toUpperCase() === 'LK' ? placeByState(s.state, s.stationuuid || s.name) : null)
          || placeByCountry((s.countrycode || '').toUpperCase(), s.stationuuid || s.name);
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
        hls: isHls || undefined,
        genre: genreOf(s.tags, s.name),
        tagline: tagLine(s.tags) || undefined,
        langs: detectLangs(s) || undefined,
        state: s.state || undefined,
        lastClick: parseTime(s.clicktimestamp_iso8601 || s.clicktimestamp),
        region: regionOf((s.countrycode || '').toUpperCase()),
      });
    }
    // secure streams first (most reliable), then by popularity
    return out.sort((a, b) => (b.secure - a.secure) || ((b.genre === 'news' ? 1 : 0) - (a.genre === 'news' ? 1 : 0)) || (b.clickcount - a.clickcount));
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
    // Music & entertainment: worldwide genres, plus Asian and Gulf favourites
    const ENT_TAGS = [
      ['pop', 400], ['hits', 300], ['top 40', 200], ['rock', 250], ['classic rock', 100], ['dance', 150], ['electronic', 150],
      ['jazz', 150], ['classical', 200], ['lounge', 80], ['chillout', 100], ['ambient', 60], ['hip hop', 150], ['rnb', 80],
      ['country', 100], ['latin', 120], ['reggae', 60], ['oldies', 120], ['80s', 100], ['90s', 80], ['instrumental', 60],
      ['bollywood', 250], ['hindi', 200], ['tamil', 120], ['malayalam', 100], ['telugu', 100], ['kannada', 50], ['punjabi', 60],
      ['marathi', 30], ['bengali', 50], ['urdu', 60], ['ghazal', 40], ['qawwali', 30], ['sufi', 40], ['carnatic', 30], ['hindustani', 30],
      ['k-pop', 80], ['kpop', 60], ['j-pop', 60], ['anime', 50], ['c-pop', 40], ['mandopop', 30], ['cantopop', 30],
      ['arabic', 200], ['khaleeji', 40], ['tarab', 30], ['arabic pop', 60], ['turkish', 100], ['persian', 80], ['kurdish', 30],
      ['opm', 50], ['filipino', 60], ['indonesian', 60], ['dangdut', 40], ['malay', 50], ['thai', 50], ['luk thung', 20],
      ['vietnamese', 50], ['nepali', 30], ['sinhala', 30], ['afghan', 20],
      ['comedy', 80], ['kids', 80], ['children', 50], ['entertainment', 200], ['culture', 100], ['drama', 40], ['audiobook', 30],
      ['soundtrack', 50], ['podcast', 40], ['sports', 200], ['football', 60], ['cricket', 40],
      ['quran', 100], ['islamic', 80], ['nasheed', 30], ['christian', 100], ['gospel', 60], ['devotional', 80], ['bhajan', 40],
    ];
    const FEATURED_ENT = [
      'Radio Mirchi', 'Red FM', 'Big FM', 'Radio City', 'Fever FM', 'Club FM', 'Radio Mango', 'Suryan FM', 'Hello FM', 'Radio Suno',
      'Radio Olive', 'Radio Asia', 'Hit 96.7', 'City 1016', 'Virgin Radio Dubai', 'Arabian Radio Network', 'Al Arabiya 99', 'Rotana',
      'Nogoum FM', 'Mix FM', 'MBC FM', 'Panorama FM', 'Sawt El Ghad', 'Radio Javan', 'Power Türk', 'Kral FM', 'Süper FM',
      'J-WAVE', 'FM802', 'InterFM', 'KBS Cool FM', 'MBC FM4U', 'SBS Power FM', 'Hit FM', 'Metro Broadcast', 'Yes 933', 'Gold 905',
      'Hitz', 'Era FM', 'Sinar', 'Prambors', 'Gen FM', 'Wish 107.5', 'Love Radio', 'Magic 89.9', 'Cool Fahrenheit', 'Radio Foorti',
      'Radio Today', 'Kantipur FM', 'Hiru FM', 'Sirasa FM', 'Mast FM', 'City FM 89', 'Arman FM', 'Mega FM', 'Love FM',
    ];
    // Indian languages: by language field, by tag, by state, and well-known stations by name (India, Gulf, Sri Lanka, worldwide)
    const IN_LANGS = [['malayalam', 500], ['tamil', 500], ['telugu', 500], ['hindi', 600], ['kannada', 200], ['bengali', 200], ['punjabi', 200], ['urdu', 200], ['marathi', 100], ['gujarati', 100]];
    const IN_TAGS = ['malayalam', 'tamil', 'telugu', 'hindi', 'bollywood', 'kollywood', 'tollywood', 'mollywood', 'sandalwood', 'filmi', 'ilaiyaraaja', 'ilayaraja', 'rahman', 'yesudas', 'kishore', 'rafi', 'carnatic', 'bhajan'];
    const IN_STATES = ['Kerala', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana', 'Karnataka', 'Maharashtra', 'Delhi', 'Uttar Pradesh', 'West Bengal', 'Punjab', 'Gujarat', 'Puducherry'];
    const IN_NAMES = [
      // Malayalam
      'Club FM', 'Radio Mango', 'Red FM Malayalam', 'Mirchi Malayalam', 'Radio Suno', 'Radio Olive', 'Hit 96.7', 'Gold 101.3', 'Radio Asia', 'Radio Me',
      'Radio Keralam', 'Malayalam Radio', 'Kochi FM', 'Akashvani Thiruvananthapuram', 'Akashvani Kochi', 'Akashvani Kozhikode', 'Ananthapuri FM', 'Radio Malayalam',
      'Radio Mattoli', 'Radio Benziger', 'Radio DC', 'Radio Kerala', 'Hello FM Malayalam', 'Radio Spice', 'Gulf Malayali',
      // Tamil
      'Suryan FM', 'Hello FM', 'Radio City Tamil', 'Big FM Tamil', 'Mirchi Tamil', 'Radio One Tamil', 'Akashvani Chennai', 'Chennai Rainbow', 'Tamil FM',
      'Shakthi FM', 'Sooriyan FM', 'Vettri FM', 'Thendral FM', 'Tamil Murasam', 'IBC Tamil', 'Lankasri', 'ATBC', 'Tamil Oli', 'Puthiya Thalaimurai', 'Ilaiyaraaja',
      'Tamil Kuyil', 'Radio Tamizha', 'Tamil Isai', 'Kollywood', 'Radio Thamizh', 'Tamil 24',
      // Telugu
      'Mirchi Telugu', 'Red FM Telugu', 'Big FM Telugu', 'Radio City Telugu', 'Akashvani Hyderabad', 'Akashvani Vijayawada', 'TORI', 'Telugu One', 'TeluguOne',
      'Radio Joy', 'Telugu FM', 'Telugu Radio', 'Radio Telugu', 'Tollywood', 'Desi Telugu',
      // Hindi & pan-Indian
      'Radio Mirchi', 'Red FM 93.5', 'Big FM 92.7', 'Radio City', 'Fever 104', 'Ishq FM', 'Radio Nasha', 'Mirchi Love', 'Vividh Bharati', 'AIR FM Gold',
      'AIR FM Rainbow', 'Radio Udaan', 'Bollywood Hits', 'Bollywood Gaane Purane', 'Radio Haanji', 'Desi Radio', 'Hum FM', 'City 101.6', 'Radio Spice',
      'Sunrise Radio', 'Lyca Radio', 'Radio XL', 'Desi Beats', 'Hindi Gaane', 'Radio Bollywood', 'Bollywood Radio', 'Evergreen Hindi', 'Purani Jeans',
    ];
    try {
      const paths = [
        ...IN_LANGS.slice(0, 4).map(([l, n]) => `/json/stations/search?language=${encodeURIComponent(l)}&limit=${n}&${q}`), // Malayalam, Tamil, Telugu, Hindi first
        ...TAGS.map(([t, n]) => `/json/stations/search?tag=${encodeURIComponent(t)}&tagExact=false&limit=${n}&${q}`),
        ...IN_LANGS.slice(4).map(([l, n]) => `/json/stations/search?language=${encodeURIComponent(l)}&limit=${n}&${q}`),
        ...IN_TAGS.map((t) => `/json/stations/search?tag=${encodeURIComponent(t)}&tagExact=false&limit=300&${q}`),
        ...IN_STATES.map((st) => `/json/stations/search?countrycode=IN&state=${encodeURIComponent(st)}&limit=200&${q}`),
        `/json/stations/search?countrycode=IN&limit=800&${q}`, `/json/stations/search?countrycode=LK&limit=150&${q}`,
        ...IN_NAMES.map((n) => `/json/stations/search?name=${encodeURIComponent(n)}&limit=10&${q}`),
        ...FEATURED.map((n) => `/json/stations/search?name=${encodeURIComponent(n)}&limit=12&${q}`),
        ...ASIA_CC.map((cc) => `/json/stations/search?countrycode=${cc}&tag=news&tagExact=false&limit=80&${q}`),
        ...['IN', 'PK', 'BD', 'PH', 'ID', 'JP', 'KR', 'CN', 'TR', 'SA', 'AE', 'IR'].map((cc) => `/json/stations/search?countrycode=${cc}&tag=talk&tagExact=false&limit=40&${q}`),
        // the most-listened stations of every Asian & Middle Eastern country, any genre (many broadcasters aren't tagged "news")
        ...ASIA_CC.map((cc) => `/json/stations/search?countrycode=${cc}&limit=${['IN', 'CN', 'JP', 'KR', 'ID', 'PH', 'PK', 'TR', 'IR', 'SA', 'AE', 'VN', 'TH', 'MY', 'BD'].includes(cc) ? 120 : 50}&${q}`),
        // HLS streams (used by many Asian public broadcasters) now play too
        ...['IN', 'CN', 'JP', 'KR', 'HK', 'TW', 'SG', 'MY', 'TH', 'VN', 'ID', 'PH', 'PK', 'BD', 'LK', 'NP', 'AE', 'SA', 'QA', 'IR', 'TR'].map((cc) => `/json/stations/search?countrycode=${cc}&is_https=true&codec=AAC&limit=40&${q}`),
        // music & entertainment (after news, so news stations appear first)
        '/json/stations/topclick/600?hidebroken=true', '/json/stations/topvote/300?hidebroken=true',
        ...ENT_TAGS.map(([t, n]) => `/json/stations/search?tag=${encodeURIComponent(t)}&tagExact=false&limit=${n}&${q}`),
        ...FEATURED_ENT.map((n) => `/json/stations/search?name=${encodeURIComponent(n)}&limit=8&${q}`),
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
    // stations cached by an older version have no genre yet
    for (const x of list) { if (!x.genre) x.genre = genreOf(x.tags, x.name); if (x.langs === undefined) x.langs = detectLangs(x) || ''; }
    state.stations = list;
    const ul = $('#stations'), keepTop = ul.scrollTop;
    updateCount();
    if (state.mode === 'radio') globe.pointsData(globeStations());
    renderGenreChips(); renderLangSelect();
    ul.scrollTop = keepTop; // don't jump while more stations stream in
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
      if (state.genre !== 'all' && s.genre !== state.genre) return false;
      if (state.lang !== 'any' && !hasLang(s, state.lang)) return false;
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
          <div class="s-meta">${flag(s.countrycode)} ${esc(s.country)}${stationDetail(s)}</div>
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
  function stationDetail(s) {
    const lang = s.language ? esc(s.language.split(',')[0]) : '';
    if (s.genre === 'news' || !s.tagline) return lang ? ' · ' + lang : '';
    return ' · ' + esc(s.tagline);
  }
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
  // genre chips
  function renderGenreChips() {
    const counts = {};
    for (const x of state.stations) counts[x.genre] = (counts[x.genre] || 0) + 1;
    document.querySelectorAll('#genres .chip').forEach((c) => {
      const g = c.dataset.genre;
      c.setAttribute('aria-selected', String(g === state.genre));
      const n = g === 'all' ? state.stations.length : counts[g] || 0;
      c.querySelector('small').textContent = n ? n.toLocaleString() : '';
    });
  }
  $('#genres').addEventListener('click', (e) => {
    const b = e.target.closest('.chip[data-genre]'); if (!b) return;
    state.genre = b.dataset.genre; store.set('gw-genre', state.genre);
    renderGenreChips(); applyFilter(); refreshGlobePoints();
    $('#stations').scrollTop = 0;
  });
  // the globe shows the chosen genre only
  function hasLang(x, code) { return !!x.langs && (',' + x.langs + ',').includes(',' + code + ','); }
  function globeStations() {
    if (state.genre === 'all' && state.lang === 'any') return state.stations;
    return state.stations.filter((x) => (state.genre === 'all' || x.genre === state.genre) && (state.lang === 'any' || hasLang(x, state.lang)));
  }
  // language picker
  const LANG_OPTS = [['any', 'Any language', ''], ['ml', 'Malayalam', 'മലയാളം'], ['ta', 'Tamil', 'தமிழ்'], ['te', 'Telugu', 'తెలుగు'], ['hi', 'Hindi', 'हिन्दी'],
    ['kn', 'Kannada', 'ಕನ್ನಡ'], ['bn', 'Bengali', 'বাংলা'], ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'], ['ur', 'Urdu', 'اردو'], ['ar', 'Arabic', 'العربية'], ['en', 'English', '']];
  function renderLangSelect() {
    const counts = {};
    for (const x of state.stations) if (x.langs) for (const c of x.langs.split(',')) counts[c] = (counts[c] || 0) + 1;
    $('#langSel').innerHTML = LANG_OPTS.map(([code, name, native]) =>
      `<option value="${code}"${code === state.lang ? ' selected' : ''}>${native ? native + ' · ' : ''}${name}${code !== 'any' && counts[code] ? ` (${counts[code].toLocaleString()})` : ''}</option>`).join('');
    $('#langWrap').classList.toggle('on', state.lang !== 'any');
  }
  $('#langSel').addEventListener('change', (e) => {
    state.lang = e.target.value; store.set('gw-lang', state.lang);
    renderLangSelect(); applyFilter(); refreshGlobePoints(); $('#stations').scrollTop = 0;
    // zoom the globe to South India / India for the Indian languages
    const focus = { ml: [16, 66, 1.6], ta: [10.5, 79.5, 1.4], te: [16.8, 79.2, 1.3], kn: [14.5, 76, 1.3], hi: [25, 79, 1.5], bn: [23.5, 89, 1.3], pa: [30.9, 75.2, 1.2], ur: [29, 71, 1.6] }[state.lang];
    if (focus && state.mode === 'radio') { ctrl.autoRotate = false; globe.pointOfView({ lat: focus[0], lng: focus[1], altitude: focus[2] + (mqMobile.matches ? 0.8 : 0) }, 1200); }
  });
  function refreshGlobePoints() { if (state.mode === 'radio') { globe.pointsData(globeStations()); applyGlobeColors(); } }
  $('#regions').addEventListener('click', (e) => {
    const b = e.target.closest('.chip[data-region]'); if (!b) return; // the News-only toggle has its own handler
    state.region = b.dataset.region;
    document.querySelectorAll('#regions .chip[data-region]').forEach((c) => c.setAttribute('aria-selected', String(c === b)));
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
          <div class="s-meta">${flag(s.countrycode)} ${esc(s.country)}${stationDetail(s)}</div>
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
    $('#npMeta').innerHTML = `<span class="live">● LIVE</span> · ${s.genre && s.genre !== 'news' ? esc(GENRE_NAME[s.genre]) + ' · ' : ''}${flag(s.countrycode)} ${esc(s.country)}${s.codec ? ' · ' + esc(s.codec) : ''}${s.bitrate ? ' ' + s.bitrate + ' kbps' : ''}`;
    const art = $('#npArt'); art.className = 'np-art art'; art.innerHTML = artHTML(s);
    $('#favBtn').setAttribute('aria-pressed', String(state.favs.has(s.stationuuid)));
    player.classList.add('paused');
    setPlayerH();
    if (state.mode === 'radio') globe.pointsData(globeStations()).ringsData(s.geo_lat != null ? [s] : []);
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
    destroyHls();
    [aCors, aPlain].forEach((a) => { a.pause(); a.removeAttribute('src'); a.load(); });
    clearCaptions();
    // Count the click with Radio Browser (helps their popularity ranking)
    if (apiBase) fetch(`${apiBase}/json/url/${s.stationuuid}`).catch(() => {});

    // 1) try with CORS so we can read the audio for subtitles
    ensureAudioGraph();
    corsOK = s.hls ? await playHls(aCors, s.url, token) : await tryPlay(aCors, s.url, token);
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

  // HLS (.m3u8): hls.js feeds the stream into the page itself, so its audio is readable for subtitles.
  // Safari plays HLS natively as a fallback.
  let hlsInst = null;
  function destroyHls() { if (hlsInst) { try { hlsInst.destroy(); } catch {} hlsInst = null; } }
  function playHls(el, url, token) {
    const Hls = window.Hls;
    if (!Hls || !Hls.isSupported()) return tryPlay(el, url, token); // Safari / iOS: native HLS
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (done) return; done = true; clearTimeout(to); el.removeEventListener('playing', onPlay); if (!ok) destroyHls(); resolve(ok); };
      const onPlay = () => finish(true);
      const to = setTimeout(() => finish(false), 15000);
      destroyHls();
      const h = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 20, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 1, fragLoadingMaxRetry: 2 });
      hlsInst = h;
      h.on(Hls.Events.ERROR, (_, d) => { if (d && d.fatal) finish(false); });
      h.on(Hls.Events.MANIFEST_PARSED, () => { const p = el.play(); if (p) p.catch(() => finish(false)); });
      el.addEventListener('playing', onPlay);
      h.loadSource(url);
      h.attachMedia(el);
      if (token !== playToken) finish(false);
    });
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
  let chunkS = 6; // adapts to how fast this device translates (longer chunks = fewer cut sentences)
  let asrQuality = store.get('gw-cc-quality', 'auto'); // auto | fast | accurate

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
    // measured: chunks under ~4 s cut too many sentences; 6–9 s is the accuracy sweet spot
    if (ratio < 0.35) chunkS = Math.max(device === 'webgpu' ? 4 : 5.5, chunkS - 0.5);
    else if (ratio > 0.85) chunkS = Math.min(10, chunkS + 1);
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
        modelReady = true; modelLoading = false; device = m.device || 'wasm'; asrLoaded = m.model || 'base';
        chunkS = device === 'webgpu' ? 5 : 6.5;
        renderCcMenu();
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
      worker.postMessage({ type: 'load', language: langCode(state.current), quality: asrQuality });
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

  // ---- translation accuracy menu (next to CC) ----
  let asrLoaded = '';
  const Q_LABEL = { auto: 'Auto', fast: 'Fast', accurate: 'Accurate' };
  function renderCcMenu() {
    document.querySelectorAll('.cc-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.q === asrQuality)));
    $('#ccNow').textContent = asrLoaded ? `Now using Whisper ${asrLoaded}${device === 'webgpu' ? ' on GPU' : ' on CPU'}` : 'Downloads when you turn on CC';
  }
  $('#ccMore').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#ccMenu'); m.hidden = !m.hidden; $('#ccMore').setAttribute('aria-expanded', String(!m.hidden)); renderCcMenu();
  });
  $('#ccMenu').addEventListener('click', (e) => {
    const b = e.target.closest('.cc-opt'); if (!b) return;
    asrQuality = b.dataset.q; store.set('gw-cc-quality', asrQuality); renderCcMenu();
    $('#ccMenu').hidden = true;
    if (worker && (modelReady || modelLoading)) {
      // reload the speech model at the new size
      modelReady = false; modelLoading = true; capturing = false;
      capStatus('Switching translator…');
      worker.postMessage({ type: 'load', language: langCode(state.current), quality: asrQuality });
    }
    toast(asrQuality === 'accurate' ? 'Accurate: larger model (~240 MB), best on phones/PCs with GPU' : asrQuality === 'fast' ? 'Fast: smaller model (~80 MB), quicker but less accurate' : 'Auto: accurate on GPU, fast on CPU', 3000);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.cc-wrap')) $('#ccMenu').hidden = true; });

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
  function pickList() { return state.mode === 'news' ? news.points : globeStations(); }
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
  // ---- speech engine ----
  // Device voices first (free, offline). Fixes for known browser problems:
  //  · Chrome stops speaking after ~15 s → text is split into short sentences
  //  · Chrome loses the "finished" event if the utterance object is garbage-collected → we keep references
  //  · Chrome ignores speak() right after cancel() → short delay only when something was playing
  //  · Safari/iOS only speaks when started by a tap → the first sentence always starts inside the tap
  //  · Android in-app browsers / WebViews often have no voices → automatic switch to an online voice
  const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  const tts = { mode: synth ? store.get('gw-tts-mode', 'device') : 'online', token: 0, keep: [], audio: new Audio(), watch: 0 };
  tts.audio.preload = 'auto';
  function chunkText(text, max = 170) {
    const out = [];
    const sentences = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?。！？؟।])\s+/);
    for (let sen of sentences) {
      while (sen.length > max) {
        let cut = sen.lastIndexOf(', ', max); if (cut < 40) cut = sen.lastIndexOf(' ', max); if (cut < 40) cut = max;
        out.push(sen.slice(0, cut + 1).trim()); sen = sen.slice(cut + 1).trim();
      }
      if (sen) out.push(sen);
    }
    return out;
  }
  // unlock audio playback inside the user's tap (needed by iOS for the online voice)
  function primeAudio() {
    try { tts.audio.src = SILENT_WAV; const p = tts.audio.play(); if (p) p.catch(() => {}); } catch {}
    try { if (synth && synth.paused) synth.resume(); } catch {}
  }
  function deviceSay(part, langName, done, token) {
    const u = new SpeechSynthesisUtterance(part);
    const { code, voice } = voiceFor(langName);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : code; u.rate = 1; u.pitch = 1;
    let started = false, finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(tts.watch); if (token === tts.token) done(); };
    u.onstart = () => { started = true; };
    u.onend = finish;
    u.onerror = (e) => {
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      if (!started && token === tts.token) { switchToOnline(); onlineSay(part, langName, done, token); finished = true; } else finish();
    };
    tts.keep.push(u); if (tts.keep.length > 30) tts.keep.shift();
    synth.speak(u);
    // no sound within 3 s means this device has no working voice: use the online voice from now on
    clearTimeout(tts.watch);
    tts.watch = setTimeout(() => {
      if (!started && !finished && token === tts.token) { finished = true; try { synth.cancel(); } catch {} switchToOnline(); onlineSay(part, langName, done, token); }
    }, 3000);
    // safety net: if the end event never arrives, move on after a generous time
    setTimeout(() => { if (started && !finished && !synth.speaking) finish(); }, 1500 + part.length * 120);
  }
  function switchToOnline() {
    if (tts.mode === 'online') return;
    tts.mode = 'online'; store.set('gw-tts-mode', 'online');
    toast('Using an online voice (this device has no built-in voice)', 3000);
  }
  // Free online text-to-speech, tried in order
  const ONLINE_TTS = [
    (t, lang) => `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(t)}`,
    (t, lang) => (lang === 'en' ? `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(t)}` : null),
  ];
  function onlineSay(part, langName, done, token, k = 0) {
    const lang = LANG[String(langName || '').toLowerCase()] || 'en';
    const make = ONLINE_TTS[k];
    if (!make) { if (token === tts.token) { toast('News audio isn’t available right now. Check your connection.', 3000); stopSpeaking(); } return; }
    const url = make(part, lang);
    if (!url) return onlineSay(part, langName, done, token, k + 1);
    const a = tts.audio;
    a.onended = () => { if (token === tts.token) done(); };
    a.onerror = () => { if (token === tts.token) onlineSay(part, langName, done, token, k + 1); };
    a.src = url;
    const p = a.play(); if (p) p.catch(() => { if (token === tts.token) onlineSay(part, langName, done, token, k + 1); });
  }
  // speak text (any length) and call onend when finished; returns nothing
  function say(text, langName, onend) {
    const token = ++tts.token;
    const parts = chunkText(text);
    let i = 0;
    const next = () => {
      if (token !== tts.token) return;
      if (i >= parts.length) { if (onend) onend(); return; }
      const part = parts[i++];
      if (tts.mode === 'device' && synth) deviceSay(part, langName, next, token);
      else onlineSay(part, langName, next, token);
    };
    if (tts.mode === 'device' && synth && (synth.speaking || synth.pending)) { synth.cancel(); setTimeout(next, 120); }
    else next();
  }
  function stopSpeaking() {
    tts.token++;
    news.bulletin = false;
    clearTimeout(tts.watch);
    try { if (synth && (synth.speaking || synth.pending)) synth.cancel(); } catch {}
    try { tts.audio.pause(); tts.audio.removeAttribute('src'); } catch {}
    if (news.speaking !== -1) { news.speaking = -1; globe.ringsData([]); renderNews(); }
    $('#bulletinBtn').setAttribute('aria-pressed', 'false');
    $('#bulletinBtn').querySelector('span').textContent = 'Play bulletin';
  }
  function speakItem(i, then) {
    const a = newsAll()[i]; if (!a) { stopSpeaking(); return; }
    if (state.current && !audioPaused()) { active.pause(); player.classList.add('paused'); stopCaptions(false); } // pause the radio while reading
    news.speaking = i; renderNews();
    const li = $(`#newsList [data-i="${i}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (CENTROID[a.cc]) globe.ringsData([{ geo_lat: CENTROID[a.cc][0], geo_long: CENTROID[a.cc][1] }]);
    const from = [a.domain, a.country].filter(Boolean).join(', ');
    const english = !a.lang || /english/i.test(a.lang);
    const text = `${a.title}. ${a.desc && a.desc !== a.title ? a.desc + ' ' : ''}${english && from ? `From ${from}.` : ''}`;
    say(text, a.lang, () => {
      if (news.speaking !== i) return;
      if (then) then(); else { news.speaking = -1; globe.ringsData([]); renderNews(); }
    });
  }
  function startBulletin() {
    if (!newsAll().length) return;
    primeAudio();
    news.bulletin = true;
    $('#bulletinBtn').setAttribute('aria-pressed', 'true');
    $('#bulletinBtn').querySelector('span').textContent = 'Stop';
    const n = Math.min(newsAll().length, 20);
    const where = news.country || (news.region === 'all' ? 'around the world' : news.region);
    if (state.current && !audioPaused()) { active.pause(); player.classList.add('paused'); stopCaptions(false); }
    // the intro starts inside the tap, so Safari/iOS allow it
    say(`G-Wave news. ${n} headlines from ${where}.`, 'english', () => {
      let i = 0;
      const next = () => {
        if (!news.bulletin) return;
        if (i >= n) { say('That was the G-Wave bulletin.', 'english', stopSpeaking); return; }
        const k = i++;
        chime();
        setTimeout(() => { if (news.bulletin) speakItem(k, next); }, 450);
      };
      next();
    });
  }

  // ---- news UI events ----
  $('#newsList').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="sources"]')) { $('#sourcesBtn').click(); return; }
    const li = e.target.closest('.news-item'); if (!li) return;
    const i = +li.dataset.i, a = newsAll()[i];
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'listen') {
      if (news.speaking === i) stopSpeaking();
      else { primeAudio(); stopSpeaking(); speakItem(i); }
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
    radio: ['World radio, live', 'Spin the planet.<br>Tune in anywhere.', 'News, music and entertainment from every country. Tap a glowing point to listen, pick a genre below, and turn on CC for live English translation of talk stations.'],
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
        .pointsData(globeStations()).ringsData(state.current && state.current.geo_lat != null ? [state.current] : []);
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

  // ---------- About, How-to-use guide and guided spotlight ----------
  const APP_VERSION = '1.9';
  const ICON_INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".7" fill="currentColor"/></svg>';
  const ICON_GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
  const ICON_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
  const SECTIONS = [['start', 'Getting started', 'Start'], ['top', 'Top bar', 'Top bar'], ['radio', 'Radio', 'Radio'], ['player', 'Player & live translation', 'Player'], ['news', 'News', 'News'], ['more', 'Good to know', 'Tips']];
  // target: CSS selector, or 'globe'; mode: switch to this mode first; prep: extra set-up before showing
  const HELP = [
    { sec: 'start', id: 'globe', title: 'Spin the globe', target: 'globe', mode: 'radio', prep: 'globe', icon: ICON_GLOBE,
      text: 'Drag to spin, pinch or scroll to zoom. Every glowing dot is a station: tap one to listen. The globe turns by itself and pauses while you touch it.' },
    { sec: 'start', id: 'list', title: 'Station list', target: '#stations', mode: 'radio', prep: 'panel', icon: ICON_LIST,
      text: 'Every station on the globe is also in this list. Tap a row to play it. The moving bars show what’s playing now.' },
    { sec: 'start', id: 'sheet', title: 'Pull-up sheet (phones)', target: '#sheetHandle', mode: 'radio', when: () => mqMobile.matches,
      text: 'Tap or drag the bar up to make the list taller, and down to see more of the globe.' },
    { sec: 'top', id: 'brand', title: 'App icon', target: '#brandBtn',
      text: 'Tap the G-Wave icon to see who made the app, the version and how many stations are loaded.' },
    { sec: 'top', id: 'count', title: 'Live counter', target: '#onairCount', when: () => !mqMobile.matches,
      text: 'How many stations (or headlines in News) are loaded, and from how many countries.' },
    { sec: 'top', id: 'help', title: 'How to use (?)', target: '#helpBtn',
      text: 'Opens this guide any time.' },
    { sec: 'top', id: 'layout', title: 'Layout: Auto, Mobile, Tab', target: '#layoutBtn',
      text: 'Auto fits your screen. Mobile is the one-hand layout with a pull-up list. Tab gives bigger buttons for tablets. The small "A" means Auto is on.' },
    { sec: 'top', id: 'mode', title: 'Radio / News switch', target: '#modeBtn',
      text: 'Switch between live radio and world newspaper headlines. The radio keeps playing while you read the news.' },
    { sec: 'top', id: 'skin', title: 'Appearance & colour skin', target: '#skinBtn',
      text: 'Choose Auto, Light or Dark, and one of six colour skins: Signal, Aurora, Coral, Ion, Orchid or Mint.' },
    { sec: 'top', id: 'theme', title: 'Light / dark', target: '#themeBtn', when: () => !mqMobile.matches,
      text: 'A quick switch between light and dark. On phones it lives in the colour menu.' },
    { sec: 'top', id: 'install', title: 'Install as an app', target: '#installBtn', optional: true,
      text: 'When your browser allows it, an Install button appears here. You can also use the browser menu → Install app / Add to Home Screen. On iPhone: Share → Add to Home Screen.' },
    { sec: 'radio', id: 'search', title: 'Search', target: '#search', mode: 'radio', prep: 'panel',
      text: 'Find a station, music style, country or topic. With subtitles on, words heard on air in the last 3 hours are searchable too.' },
    { sec: 'radio', id: 'genres', title: 'Genres', target: '#genres', mode: 'radio', prep: 'panel',
      text: 'All, News, Music, Entertainment, Sports and Faith. The number is how many stations. The globe shows only the genre you pick.' },
    { sec: 'radio', id: 'lang', title: 'Language', target: '#langWrap', mode: 'radio', prep: 'panel',
      text: 'Malayalam, Tamil, Telugu, Hindi, Kannada, Bengali, Punjabi, Urdu, Arabic or English. Picking an Indian language flies the globe to that region.' },
    { sec: 'radio', id: 'regions', title: 'Regions, Last 3h and Saved', target: '#regions', mode: 'radio', prep: 'panel',
      text: 'Filter by continent. "Last 3h" lists stations people around the world played in the last 3 hours. "★ Saved" shows your favourites.' },
    { sec: 'radio', id: 'row', title: 'A station row', target: '#stations .station', mode: 'radio', prep: 'panel',
      text: 'Name, country and language or music style. On the right: the stream quality, or bars when it’s playing.' },
    { sec: 'player', id: 'play', title: 'Play / pause', target: '#playBtn', mode: 'radio', prep: 'player',
      text: 'Starts or pauses the station. On a computer, the Space bar does the same. Lock-screen and headphone buttons work too.' },
    { sec: 'player', id: 'fav', title: 'Save station (★)', target: '#favBtn', mode: 'radio', prep: 'player',
      text: 'Adds the station to ★ Saved so you can find it again quickly.' },
    { sec: 'player', id: 'cc', title: 'CC: live English subtitles', target: '#ccBtn', mode: 'radio', prep: 'player',
      text: 'Shows what’s being said, in English, a few seconds behind the audio. The original words appear first in grey, then the English. It runs on your device; the first time, a translator downloads (about 80 MB).' },
    { sec: 'player', id: 'acc', title: 'Translation accuracy', target: '#ccMore', mode: 'radio', prep: 'player',
      text: 'Fast is smaller and quicker. Accurate is bigger and much better for Asian languages. Auto picks Accurate when your device has graphics acceleration.' },
    { sec: 'player', id: 'vol', title: 'Volume', target: '.volume', mode: 'radio', prep: 'player', when: () => !mqMobile.matches,
      text: 'Sets the volume. On phones, use the phone’s volume buttons.' },
    { sec: 'player', id: 'subs', title: 'Where subtitles appear', target: null,
      text: 'Above the player on computers and tablets, at the top of the screen on phones. Some stations block audio access: they still play, but without subtitles.' },
    { sec: 'news', id: 'nsearch', title: 'Search headlines', target: '#newsSearch', mode: 'news', prep: 'panel',
      text: 'Search headlines from news sites worldwide, in the time window you choose.' },
    { sec: 'news', id: 'topics', title: 'Topics', target: '#newsTopics', mode: 'news', prep: 'panel',
      text: 'Top, World, Business, Tech, Sports, Health and Science.' },
    { sec: 'news', id: 'nregions', title: 'Regions and countries', target: '#newsRegions', mode: 'news', prep: 'panel',
      text: 'Limit headlines to a region. Tap a country on the globe to see only its headlines; tap ✕ on the filter to clear it.' },
    { sec: 'news', id: 'span', title: 'Time window and English only', target: '.news-tools', mode: 'news', prep: 'panel',
      text: 'Last hour, 3 hours or 24 hours. "English only" hides headlines in other languages.' },
    { sec: 'news', id: 'bulletin', title: 'Play bulletin', target: '#bulletinBtn', mode: 'news', prep: 'panel',
      text: 'Reads the top 20 headlines aloud with a chime between stories. The radio pauses while it reads.' },
    { sec: 'news', id: 'sources', title: 'Sources', target: '#sourcesBtn', mode: 'news', prep: 'panel',
      text: 'Shows which free news services answered. You can add your own free API keys there for even more headlines.' },
    { sec: 'news', id: 'story', title: 'A headline', target: '#newsList .news-item', mode: 'news', prep: 'panel',
      text: 'Tap it to open: source, country, time, and buttons to Listen, Read the full article, or Show on globe.' },
    { sec: 'more', id: 'offline', title: 'Install and offline', target: null,
      text: 'Installed, G-Wave opens like any app, even offline. Radio and news need an internet connection.' },
    { sec: 'more', id: 'privacy', title: 'Privacy', target: null,
      text: 'No account, no ads, no tracking. Saved stations, settings and any API keys stay in this browser on this device.' },
    { sec: 'more', id: 'offair', title: 'If a station doesn’t play', target: null,
      text: 'Some stations go off air or block browsers. G-Wave tells you, and you can simply try another one.' },
    { sec: 'more', id: 'keys', title: 'Keyboard', target: null,
      text: 'Space plays or pauses. Esc closes windows and this guide.' },
  ];
  const TOUR = ['globe', 'list', 'genres', 'lang', 'mode', 'layout', 'skin', 'play', 'cc', 'brand'];

  // ---- modals ----
  let lastFocus = null;
  function openModal(id) {
    closeTour(false);
    document.querySelectorAll('.modal').forEach((m) => { if (m.id !== id) m.hidden = true; });
    lastFocus = document.activeElement;
    const m = $('#' + id); m.hidden = false;
    const f = m.querySelector('[data-close], button'); if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal(id) { const m = $('#' + id); if (!m || m.hidden) return; m.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('[data-close]')) closeModal(m.id);
  }));

  // ---- About (app icon) ----
  function renderAbout() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const facts = [
      ['Version', APP_VERSION],
      ['Stations loaded', state.stations.length ? state.stations.length.toLocaleString() : 'Loading…'],
      ['Countries', state.stations.length ? new Set(state.stations.map((x) => x.countrycode)).size : '—'],
      ['Layout', { mobile: 'Mobile', tab: 'Tab', desktop: 'Desktop' }[layoutNow] + (layoutPref === 'auto' ? ' (Auto)' : '')],
      ['Running as', standalone ? 'Installed app' : 'Web page'],
    ];
    $('#aboutFacts').innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }
  $('#brandBtn').addEventListener('click', () => { renderAbout(); openModal('aboutModal'); });
  $('#aboutHelp').addEventListener('click', () => { closeModal('aboutModal'); openHelp(); });

  // ---- How-to-use guide ----
  let helpTab = 'all';
  const iconFor = (it) => {
    if (it.icon) return it.icon;
    const el = it.target && it.target !== 'globe' ? document.querySelector(it.target) : null;
    const svg = el && el.querySelector('svg');
    return svg ? svg.outerHTML.replace(/\sid="[^"]*"/g, '') : ICON_INFO;
  };
  function renderHelp() {
    $('#helpTabs').innerHTML = [['all', 'All']].concat(SECTIONS.map(([k, , short]) => [k, short])).map(([k, t]) =>
      `<button class="chip" data-tab="${k}" aria-selected="${k === helpTab}">${esc(t)}</button>`).join('');
    $('#helpBody').innerHTML = SECTIONS.filter(([k]) => helpTab === 'all' || k === helpTab).map(([k, title]) => {
      const items = HELP.filter((it) => it.sec === k && (!it.when || it.when()));
      return `<section class="help-sec"><h3>${esc(title)}</h3><ul>${items.map((it) => `
        <li class="help-item">
          <span class="help-ico">${iconFor(it)}</span>
          <span class="help-text"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></span>
          ${it.target && !(it.optional && !targetRect(it)) ? `<button class="n-btn show-btn" data-show="${it.id}">Show me</button>` : ''}
        </li>`).join('')}</ul></section>`;
    }).join('');
  }
  function openHelp(tab) {
    if (tab) helpTab = tab;
    renderHelp(); openModal('helpModal');
    store.set('gw-seen-help', true); $('#helpBtn').classList.remove('nudge');
  }
  $('#helpBtn').addEventListener('click', () => openHelp());
  $('#helpTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    helpTab = b.dataset.tab; renderHelp(); $('#helpBody').scrollTop = 0;
  });
  $('#helpBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]'); if (!b) return;
    const scroll = $('#helpBody').scrollTop;
    closeModal('helpModal');
    startTour([b.dataset.show], { fromHelp: true, scroll });
  });
  $('#tourBtn').addEventListener('click', () => { closeModal('helpModal'); startTour(TOUR); });

  // ---- spotlight tour ----
  const tour = { steps: [], i: 0, opts: {}, el: null, raf: 0 };
  async function prepareStep(it) {
    if (it.mode && state.mode !== it.mode) { setMode(it.mode); await new Promise((r) => setTimeout(r, 250)); }
    $('#skinMenu').hidden = true; $('#layoutMenu').hidden = true; $('#ccMenu').hidden = true;
    if (it.prep === 'globe' && mqMobile.matches) { panel.classList.remove('expanded'); panel.classList.add('collapsed'); await new Promise((r) => setTimeout(r, 380)); }
    if (it.prep === 'panel' && mqMobile.matches) { panel.classList.remove('collapsed'); if (/item|station/.test(it.target)) panel.classList.add('expanded'); }
    if (it.prep === 'player' && player.hidden) {
      const st = state.filtered[0] || state.stations[0];
      if (st) { showInPlayer(st, false); await new Promise((r) => setTimeout(r, 200)); }
    }
  }
  function targetRect(it) {
    if (it.target === 'globe') {
      const w = window.innerWidth, h = window.innerHeight, off = globe.globeOffset ? globe.globeOffset() : [0, 0];
      const size = Math.min(w, h) * (mqMobile.matches ? 0.62 : 0.5);
      return { left: w / 2 + off[0] - size / 2, top: h / 2 + off[1] - size / 2, width: size, height: size, round: true };
    }
    const el = document.querySelector(it.target);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('[hidden]')) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height, el };
  }
  async function showStep() {
    const it = HELP.find((x) => x.id === tour.steps[tour.i]); if (!it) return closeTour();
    $('#tourTip').classList.add('moving');
    await prepareStep(it);
    let r = targetRect(it);
    if (r && r.el) { r.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await new Promise((res) => setTimeout(res, 260)); r = targetRect(it); }
    $('#tour').hidden = false;
    const many = tour.steps.length > 1;
    $('#tourStep').textContent = many ? `Step ${tour.i + 1} of ${tour.steps.length}` : 'Here it is';
    $('#tourTitle').textContent = it.title;
    $('#tourText').textContent = r ? it.text : it.text + ' (Not shown on this screen right now.)';
    $('#tourBack').hidden = !many || tour.i === 0;
    $('#tourNext').textContent = many ? (tour.i === tour.steps.length - 1 ? 'Finish' : 'Next') : (tour.opts.fromHelp ? 'Back to guide' : 'Got it');
    placeSpot(r);
    $('#tourTip').classList.remove('moving');
    $('#tourNext').focus();
  }
  function placeSpot(r) {
    const hole = $('#tourHole'), tip = $('#tourTip');
    const vw = window.innerWidth, vh = window.innerHeight, pad = 6;
    if (r) {
      hole.hidden = false;
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', borderRadius: r.round ? '50%' : '14px' });
    } else hole.hidden = true;
    const tw = Math.min(330, vw - 32); tip.style.width = tw + 'px';
    const th = tip.offsetHeight || 170;
    let top, left;
    if (!r) { top = (vh - th) / 2; left = (vw - tw) / 2; }
    else {
      const below = r.top + r.height + pad + 12, above = r.top - pad - 12 - th;
      top = below + th < vh - 8 ? below : above > 8 ? above : Math.max(8, Math.min(vh - th - 8, r.top + r.height / 2 - th / 2));
      left = Math.max(16, Math.min(vw - tw - 16, r.left + r.width / 2 - tw / 2));
      // if the tip would cover a large target (globe, list), put it beside or at the bottom
      if (top > r.top - th && top < r.top + r.height && r.height > vh * 0.4) { top = vh - th - 16; }
    }
    tip.style.top = top + 'px'; tip.style.left = left + 'px';
  }
  function startTour(steps, opts = {}) {
    tour.steps = steps.filter((id) => { const it = HELP.find((x) => x.id === id); return it && (!it.when || it.when()); });
    tour.i = 0; tour.opts = opts;
    ctrl.autoRotate = false;
    showStep();
  }
  function closeTour(reopen = true) {
    if ($('#tour').hidden) return;
    $('#tour').hidden = true;
    const o = tour.opts; tour.opts = {};
    if (reopen && o.fromHelp) { openHelp(); $('#helpBody').scrollTop = o.scroll || 0; }
  }
  $('#tourNext').addEventListener('click', () => { if (tour.i < tour.steps.length - 1) { tour.i++; showStep(); } else closeTour(true); });
  $('#tourBack').addEventListener('click', () => { if (tour.i > 0) { tour.i--; showStep(); } });
  $('#tourClose').addEventListener('click', () => { tour.opts = {}; closeTour(false); });
  $('#tour').addEventListener('click', (e) => { if (e.target === $('#tour') || e.target === $('#tourHole')) { tour.opts = {}; closeTour(false); } });
  window.addEventListener('resize', () => { if (!$('#tour').hidden) showStep(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#tour').hidden) { tour.opts = {}; closeTour(false); return; }
    document.querySelectorAll('.modal:not([hidden])').forEach((m) => closeModal(m.id));
  });
  // first visit: point gently at the guide
  if (!store.get('gw-seen-help', false)) {
    $('#helpBtn').classList.add('nudge');
    setTimeout(() => { if (!store.get('gw-seen-help', false)) toast('New here? Tap ? for a quick guide.', 4500); }, 3500);
  }

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
    if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON|SELECT/.test(document.activeElement.tagName) && state.current && $('#tour').hidden && !document.querySelector('.modal:not([hidden])')) { e.preventDefault(); $('#playBtn').click(); }
  });

  loadStations();
})();
