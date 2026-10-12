/* G-Wave news sources: many free news feeds queried in parallel and merged.
   Keyless: GDELT, publisher RSS feeds (via free RSS→JSON converters / CORS relays), The Guardian (public
   developer key), Hacker News (Algolia), Spaceflight News, Wikipedia "In the news", NewsAPI mirror.
   Optional free keys: GNews, NewsData.io, Currents, TheNewsAPI, Noozra. */
(function () {
  'use strict';

  // ---------- publisher RSS feeds (English), tagged by country, region and topic ----------
  // [name, url, ISO country, region, topic]   topic 'top' = general news
  const FEEDS = [
    // World / global
    ['BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'GB', 'Europe', 'top'],
    ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'QA', 'Middle East', 'top'],
    ['DW', 'https://rss.dw.com/rdf/rss-en-all', 'DE', 'Europe', 'top'],
    ['France 24', 'https://www.france24.com/en/rss', 'FR', 'Europe', 'top'],
    ['UN News', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'US', 'Americas', 'top'],
    ['NPR', 'https://feeds.npr.org/1001/rss.xml', 'US', 'Americas', 'top'],
    ['The Guardian World', 'https://www.theguardian.com/world/rss', 'GB', 'Europe', 'top'],
    ['Sky News', 'https://feeds.skynews.com/feeds/rss/world.xml', 'GB', 'Europe', 'top'],
    ['CBS News', 'https://www.cbsnews.com/latest/rss/world', 'US', 'Americas', 'top'],
    ['ABC News (US)', 'https://abcnews.go.com/abcnews/internationalheadlines', 'US', 'Americas', 'top'],
    ['New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'US', 'Americas', 'top'],
    // Asia
    ['The Hindu', 'https://www.thehindu.com/news/national/feeder/default.rss', 'IN', 'Asia', 'top'],
    ['Times of India', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', 'IN', 'Asia', 'top'],
    ['NDTV', 'https://feeds.feedburner.com/ndtvnews-top-stories', 'IN', 'Asia', 'top'],
    ['Indian Express', 'https://indianexpress.com/feed/', 'IN', 'Asia', 'top'],
    ['Dawn', 'https://www.dawn.com/feeds/home', 'PK', 'Asia', 'top'],
    ['Express Tribune', 'https://tribune.com.pk/feed/home', 'PK', 'Asia', 'top'],
    ['The Daily Star', 'https://www.thedailystar.net/frontpage/rss.xml', 'BD', 'Asia', 'top'],
    ['CNA', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', 'SG', 'Asia', 'top'],
    ['The Straits Times', 'https://www.straitstimes.com/news/asia/rss.xml', 'SG', 'Asia', 'top'],
    ['South China Morning Post', 'https://www.scmp.com/rss/91/feed', 'HK', 'Asia', 'top'],
    ['The Japan Times', 'https://www.japantimes.co.jp/feed/', 'JP', 'Asia', 'top'],
    ['Yonhap', 'https://en.yna.co.kr/RSS/news.xml', 'KR', 'Asia', 'top'],
    ['The Korea Herald', 'https://www.koreaherald.com/common/rss_xml.php?ct=102', 'KR', 'Asia', 'top'],
    ['Rappler', 'https://www.rappler.com/feed/', 'PH', 'Asia', 'top'],
    ['Inquirer', 'https://newsinfo.inquirer.net/feed', 'PH', 'Asia', 'top'],
    ['Bangkok Post', 'https://www.bangkokpost.com/rss/data/topstories.xml', 'TH', 'Asia', 'top'],
    ['VnExpress International', 'https://e.vnexpress.net/rss/news.rss', 'VN', 'Asia', 'top'],
    ['Malay Mail', 'https://www.malaymail.com/feed/rss/malaysia', 'MY', 'Asia', 'top'],
    ['Antara News', 'https://en.antaranews.com/rss/news.xml', 'ID', 'Asia', 'top'],
    ['The Kathmandu Post', 'https://kathmandupost.com/rss', 'NP', 'Asia', 'top'],
    ['Daily Mirror Sri Lanka', 'https://www.dailymirror.lk/RSS_Feeds/breaking-news', 'LK', 'Asia', 'top'],
    ['Taipei Times', 'https://www.taipeitimes.com/xml/index.rss', 'TW', 'Asia', 'top'],
    // Middle East
    ['Arab News', 'https://www.arabnews.com/rss.xml', 'SA', 'Middle East', 'top'],
    ['Doha News', 'https://dohanews.co/feed/', 'QA', 'Middle East', 'top'],
    ['Middle East Eye', 'https://www.middleeasteye.net/rss', 'GB', 'Middle East', 'top'],
    ['The Times of Israel', 'https://www.timesofisrael.com/feed/', 'IL', 'Middle East', 'top'],
    ['Al-Monitor', 'https://www.al-monitor.com/rss', 'US', 'Middle East', 'top'],
    ['Daily Sabah', 'https://www.dailysabah.com/rss/turkey', 'TR', 'Middle East', 'top'],
    ['Tehran Times', 'https://www.tehrantimes.com/rss', 'IR', 'Middle East', 'top'],
    ['BBC Middle East', 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', 'GB', 'Middle East', 'top'],
    // Europe
    ['BBC UK', 'https://feeds.bbci.co.uk/news/uk/rss.xml', 'GB', 'Europe', 'top'],
    ['Euronews', 'https://www.euronews.com/rss?level=theme&name=news', 'FR', 'Europe', 'top'],
    ['Politico Europe', 'https://www.politico.eu/feed/', 'BE', 'Europe', 'top'],
    ['The Kyiv Independent', 'https://kyivindependent.com/news-archive/rss/', 'UA', 'Europe', 'top'],
    ['Irish Times', 'https://www.irishtimes.com/arc/outboundfeeds/feed-irish-news/', 'IE', 'Europe', 'top'],
    // Americas
    ['CBC News', 'https://www.cbc.ca/webfeed/rss/rss-topstories', 'CA', 'Americas', 'top'],
    ['NYT Home', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 'US', 'Americas', 'top'],
    ['MercoPress', 'https://en.mercopress.com/rss', 'UY', 'Americas', 'top'],
    ['BBC Latin America', 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml', 'GB', 'Americas', 'top'],
    // Africa
    ['AllAfrica', 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', 'ZA', 'Africa', 'top'],
    ['News24', 'https://feeds.news24.com/articles/news24/TopStories/rss', 'ZA', 'Africa', 'top'],
    ['Premium Times', 'https://www.premiumtimesng.com/feed', 'NG', 'Africa', 'top'],
    ['Mail & Guardian', 'https://mg.co.za/feed/', 'ZA', 'Africa', 'top'],
    ['BBC Africa', 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', 'GB', 'Africa', 'top'],
    // Oceania
    ['ABC Australia', 'https://www.abc.net.au/news/feed/2942460/rss.xml', 'AU', 'Oceania', 'top'],
    ['RNZ', 'https://www.rnz.co.nz/rss/national.xml', 'NZ', 'Oceania', 'top'],
    ['Guardian Australia', 'https://www.theguardian.com/australia-news/rss', 'AU', 'Oceania', 'top'],
    // Topics (global)
    ['BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'GB', 'Europe', 'business'],
    ['CNBC World', 'https://www.cnbc.com/id/100727362/device/rss/rss.html', 'US', 'Americas', 'business'],
    ['Economic Times', 'https://economictimes.indiatimes.com/rssfeedstopstories.cms', 'IN', 'Asia', 'business'],
    ['BBC Technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'GB', 'Europe', 'tech'],
    ['The Verge', 'https://www.theverge.com/rss/index.xml', 'US', 'Americas', 'tech'],
    ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'US', 'Americas', 'tech'],
    ['TechCrunch', 'https://techcrunch.com/feed/', 'US', 'Americas', 'tech'],
    ['BBC Sport', 'https://feeds.bbci.co.uk/sport/rss.xml', 'GB', 'Europe', 'sports'],
    ['ESPN', 'https://www.espn.com/espn/rss/news', 'US', 'Americas', 'sports'],
    ['ESPNcricinfo', 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', 'IN', 'Asia', 'sports'],
    ['BBC Health', 'https://feeds.bbci.co.uk/news/health/rss.xml', 'GB', 'Europe', 'health'],
    ['WHO', 'https://www.who.int/rss-feeds/news-english.xml', 'CH', 'Europe', 'health'],
    ['BBC Science', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'GB', 'Europe', 'science'],
    ['ScienceDaily', 'https://www.sciencedaily.com/rss/all.xml', 'US', 'Americas', 'science'],
    ['NASA', 'https://www.nasa.gov/news-release/feed/', 'US', 'Americas', 'science'],
  ];

  const TOPIC_WORDS = {
    business: /econom|market|stock|business|inflation|trade|bank|oil|compan|invest|tariff|gdp/i,
    tech: /tech|\bai\b|artificial intelligence|software|app\b|smartphone|cyber|chip|startup|robot|internet/i,
    sports: /football|soccer|cricket|olympic|tennis|world cup|league|match|championship|nba|f1|goal|coach/i,
    health: /health|hospital|disease|vaccine|medical|outbreak|virus|doctor|patients?|cancer/i,
    science: /science|climate|space|research|scientist|nasa|planet|species|study finds|environment/i,
    world: /un\b|united nations|summit|diplomat|ceasefire|sanction|embassy|foreign minister|treaty/i,
  };

  // ---------- helpers ----------
  const now = () => Date.now();
  const strip = (html) => {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const firstImg = (html) => { const m = /<img[^>]+src=["']([^"']+)/i.exec(html || ''); return m ? m[1] : ''; };
  const https = (u) => (u && /^https:\/\//.test(u) ? u : u && /^\/\//.test(u) ? 'https:' + u : '');
  const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  function parseTime(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    let t = Date.parse(v);
    if (!isFinite(t) && /^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(v)) t = Date.parse(v.replace(' ', 'T') + 'Z');
    else if (/^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(v)) t = Date.parse(v.replace(' ', 'T') + 'Z'); // converters report UTC
    return isFinite(t) && t < now() + 3600e3 ? t : 0;
  }
  async function getJSON(url, opts = {}, ms = 12000) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      try { return JSON.parse(text); } catch { return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')); }
    } finally { clearTimeout(to); }
  }
  async function getText(url, ms = 12000) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { clearTimeout(to); }
  }
  // run async jobs with limited parallelism
  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch {} }
    }));
  }

  // ---------- RSS via free converters / relays (tried in order; the one that works moves to the front) ----------
  const RELAYS = [
    { name: 'rss2json', json: true, url: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}` },
    { name: 'allorigins', url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
    { name: 'corsproxy', url: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
    { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  ];
  let relayOrder = RELAYS.slice();
  const feedCache = new Map(); // url -> { t, items }

  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Not a feed');
    const nodes = [...doc.querySelectorAll('item, entry')];
    if (!nodes.length) throw new Error('Empty feed');
    const txt = (el, sel) => { const n = el.getElementsByTagName(sel)[0]; return n ? n.textContent : ''; };
    return nodes.map((el) => {
      const linkEl = el.getElementsByTagName('link')[0];
      const link = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent) : '';
      const media = el.getElementsByTagName('media:content')[0] || el.getElementsByTagName('media:thumbnail')[0] || el.getElementsByTagName('enclosure')[0];
      const descHtml = txt(el, 'description') || txt(el, 'summary') || txt(el, 'content:encoded') || txt(el, 'content');
      return {
        title: strip(txt(el, 'title')), url: (link || '').trim(),
        time: parseTime(txt(el, 'pubDate') || txt(el, 'published') || txt(el, 'updated') || txt(el, 'dc:date')),
        image: https(media ? media.getAttribute('url') : '') || https(firstImg(descHtml)),
        desc: strip(descHtml).slice(0, 400),
      };
    });
  }
  function fromRss2json(d) {
    if (!d || d.status !== 'ok' || !Array.isArray(d.items)) throw new Error((d && d.message) || 'Converter error');
    return d.items.map((it) => ({
      title: strip(it.title), url: it.link,
      time: parseTime(it.pubDate),
      image: https(it.thumbnail) || https(it.enclosure && it.enclosure.link) || https(firstImg(it.description || it.content)),
      desc: strip(it.description || it.content).slice(0, 400),
    }));
  }
  async function fetchFeed(url) {
    const c = feedCache.get(url);
    if (c && now() - c.t < 10 * 60e3) return c.items;
    let lastErr;
    for (const relay of relayOrder) {
      try {
        const items = relay.json ? fromRss2json(await getJSON(relay.url(url), {}, 10000)) : parseXML(await getText(relay.url(url), 10000));
        if (!items.length) throw new Error('Empty feed');
        if (relayOrder[0] !== relay) relayOrder = [relay, ...relayOrder.filter((r) => r !== relay)];
        feedCache.set(url, { t: now(), items });
        return items;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Feed unavailable');
  }

  // ---------- GDELT ----------
  const GD_TOPICS = {
    top: '(government OR president OR minister OR election OR economy OR war OR court OR police OR crisis OR protest)',
    world: '(international OR diplomacy OR "united nations" OR summit OR ceasefire OR sanctions OR embassy)',
    business: '(economy OR markets OR stocks OR business OR inflation OR trade OR oil OR banking)',
    tech: '(technology OR "artificial intelligence" OR software OR smartphone OR cyber OR startup)',
    sports: '(football OR cricket OR olympics OR tennis OR "world cup" OR league OR championship)',
    health: '(health OR hospital OR disease OR vaccine OR medical OR outbreak)',
    science: '(science OR climate OR space OR research OR scientists OR environment)',
  };
  const GD_REGIONS = {
    Asia: 'india china japan southkorea pakistan bangladesh indonesia philippines malaysia singapore thailand vietnam srilanka nepal taiwan hongkong',
    'Middle East': 'qatar saudiarabia unitedarabemirates kuwait bahrain oman iran iraq israel jordan lebanon syria turkey yemen',
    Europe: 'unitedkingdom france germany italy spain netherlands poland ukraine russia sweden ireland belgium switzerland austria greece',
    Americas: 'unitedstates canada mexico brazil argentina colombia chile peru venezuela',
    Africa: 'nigeria southafrica kenya ghana egypt ethiopia morocco algeria tanzania uganda zimbabwe senegal',
    Oceania: 'australia newzealand fiji papuanewguinea',
  };
  let gdeltLast = 0;
  async function gdelt(p) {
    const wait = gdeltLast + 5200 - now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    gdeltLast = now();
    const parts = [];
    const q = p.query.trim();
    parts.push(q ? (/\s/.test(q) && !/["()]|\bOR\b/.test(q) ? `"${q.replace(/"/g, '')}"` : q) : GD_TOPICS[p.topic] || GD_TOPICS.top);
    if (p.country) parts.push('sourcecountry:' + p.country.toLowerCase().replace(/[^a-z]/g, ''));
    else if (p.region !== 'all') parts.push('(' + GD_REGIONS[p.region].split(' ').map((c) => 'sourcecountry:' + c).join(' OR ') + ')');
    if (p.english) parts.push('sourcelang:english');
    const span = { '1h': '1h', '3h': '3h', '24h': '24h' }[p.span] || '3h';
    const d = await getJSON('https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&sort=datedesc&maxrecords=150'
      + `&timespan=${span}&query=${encodeURIComponent(parts.join(' '))}`, {}, 25000);
    const m = (v) => { const x = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(v || ''); return x ? Date.UTC(+x[1], x[2] - 1, +x[3], +x[4], +x[5], +x[6]) : 0; };
    return (d.articles || []).map((a) => ({
      title: String(a.title || '').trim(), url: a.url, domain: a.domain, country: a.sourcecountry || '', lang: a.language || '',
      time: m(a.seendate), image: https(a.socialimage), desc: '',
    }));
  }

  // ---------- The Guardian (public developer key "test", rate-limited) ----------
  const GU_SECTION = { world: 'world', business: 'business', tech: 'technology', sports: 'sport', science: 'science' };
  const GU_TAG = { Asia: 'world/asia-pacific', 'Middle East': 'world/middleeast', Europe: 'world/europe-news', Americas: 'world/americas', Africa: 'world/africa', Oceania: 'australia-news/australia-news' };
  async function guardian(p) {
    const from = new Date(now() - spanMs(p.span) - 3600e3).toISOString().slice(0, 10);
    let u = `https://content.guardianapis.com/search?api-key=test&page-size=50&order-by=newest&show-fields=thumbnail,trailText&from-date=${from}`;
    if (p.query.trim()) u += '&q=' + encodeURIComponent(p.query.trim());
    else if (p.topic === 'health') u += '&q=health';
    else if (GU_SECTION[p.topic]) u += '&section=' + GU_SECTION[p.topic];
    if (p.region !== 'all' && GU_TAG[p.region]) u += '&tag=' + encodeURIComponent(GU_TAG[p.region]);
    const d = await getJSON(u);
    const res = (d.response && d.response.results) || [];
    return res.map((r) => ({
      title: r.webTitle, url: r.webUrl, domain: 'theguardian.com', country: 'United Kingdom', cc: 'GB', lang: 'English',
      time: parseTime(r.webPublicationDate), image: https(r.fields && r.fields.thumbnail), desc: strip(r.fields && r.fields.trailText),
    }));
  }

  // ---------- Hacker News (tech) ----------
  async function hackerNews(p) {
    const since = Math.floor((now() - spanMs(p.span)) / 1000);
    const d = await getJSON(`https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=40&numericFilters=created_at_i>${since},points>5`
      + (p.query.trim() ? '&query=' + encodeURIComponent(p.query.trim()) : ''));
    return (d.hits || []).filter((h) => h.url && h.title).map((h) => ({
      title: h.title, url: h.url, domain: domainOf(h.url), country: '', lang: 'English',
      time: (h.created_at_i || 0) * 1000, image: '', desc: `${h.points || 0} points on Hacker News`,
    }));
  }

  // ---------- Spaceflight News (science) ----------
  async function spaceflight(p) {
    const d = await getJSON('https://api.spaceflightnewsapi.net/v4/articles/?limit=30&ordering=-published_at'
      + (p.query.trim() ? '&search=' + encodeURIComponent(p.query.trim()) : ''));
    return (d.results || []).map((a) => ({
      title: a.title, url: a.url, domain: domainOf(a.url) || a.news_site, country: '', lang: 'English',
      time: parseTime(a.published_at), image: https(a.image_url), desc: (a.summary || '').slice(0, 400),
    }));
  }

  // ---------- Wikipedia "In the news" ----------
  async function wikipedia() {
    const d = new Date();
    const path = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
    const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/featured/${path}`);
    return (j.news || []).map((n) => {
      const l = (n.links || [])[0] || {};
      return {
        title: strip(n.story), url: (l.content_urls && l.content_urls.desktop && l.content_urls.desktop.page) || 'https://en.wikipedia.org/wiki/Portal:Current_events',
        domain: 'wikipedia.org', country: '', lang: 'English', time: 0,
        image: https(l.thumbnail && l.thumbnail.source), desc: (l.extract || '').slice(0, 400),
      };
    });
  }

  // ---------- NewsAPI mirror ----------
  const MIRROR_CAT = { top: 'general', world: 'general', business: 'business', tech: 'technology', sports: 'sports', health: 'health', science: 'science' };
  const MIRROR_CC = { all: ['us', 'gb', 'in'], Asia: ['in'], 'Middle East': [], Europe: ['gb', 'fr'], Americas: ['us'], Africa: [], Oceania: ['au'] };
  const MIRROR_NAME = { us: 'United States', gb: 'United Kingdom', in: 'India', au: 'Australia', fr: 'France', ru: 'Russia' };
  async function mirror(p) {
    const ccs = MIRROR_CC[p.region] || ['us'];
    if (!ccs.length) return [];
    const out = [];
    await Promise.all(ccs.map(async (cc) => {
      const d = await getJSON(`https://saurav.tech/NewsAPI/top-headlines/category/${MIRROR_CAT[p.topic] || 'general'}/${cc}.json`);
      (d.articles || []).forEach((a) => out.push({
        title: a.title, url: a.url, domain: (a.source && a.source.name) || domainOf(a.url), country: MIRROR_NAME[cc], cc: cc.toUpperCase(), lang: 'English',
        time: parseTime(a.publishedAt), image: https(a.urlToImage), desc: a.description || '',
      }));
    }));
    return out;
  }

  // ---------- optional keyed sources (free plans) ----------
  const GNEWS_CAT = { top: 'general', world: 'world', business: 'business', tech: 'technology', sports: 'sports', health: 'health', science: 'science' };
  const KEYED = {
    gnews: {
      label: 'GNews', signup: 'https://gnews.io', free: '100 requests/day',
      async run(p, key) {
        const base = p.query.trim()
          ? `https://gnews.io/api/v4/search?q=${encodeURIComponent(p.query.trim())}&lang=en&max=50&sortby=publishedAt`
          : `https://gnews.io/api/v4/top-headlines?category=${GNEWS_CAT[p.topic] || 'general'}&lang=en&max=50`;
        const d = await getJSON(base + '&apikey=' + encodeURIComponent(key));
        return (d.articles || []).map((a) => ({ title: a.title, url: a.url, domain: domainOf(a.url) || (a.source && a.source.name), country: '', lang: 'English', time: parseTime(a.publishedAt), image: https(a.image), desc: a.description || '' }));
      },
    },
    newsdata: {
      label: 'NewsData.io', signup: 'https://newsdata.io', free: '200 credits/day',
      async run(p, key) {
        let u = `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(key)}&language=en`;
        if (p.query.trim()) u += '&q=' + encodeURIComponent(p.query.trim());
        const cat = { top: 'top', world: 'world', business: 'business', tech: 'technology', sports: 'sports', health: 'health', science: 'science' }[p.topic];
        if (cat) u += '&category=' + cat;
        const d = await getJSON(u);
        return (d.results || []).map((a) => ({ title: a.title, url: a.link, domain: domainOf(a.link) || a.source_id, country: Array.isArray(a.country) ? a.country[0] : '', lang: 'English', time: parseTime(a.pubDate), image: https(a.image_url), desc: a.description || '' }));
      },
    },
    currents: {
      label: 'Currents', signup: 'https://currentsapi.services', free: '600 requests/day',
      async run(p, key) {
        const u = p.query.trim()
          ? `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(p.query.trim())}&language=en&apiKey=${encodeURIComponent(key)}`
          : `https://api.currentsapi.services/v1/latest-news?language=en&apiKey=${encodeURIComponent(key)}`;
        const d = await getJSON(u);
        return (d.news || []).map((a) => ({ title: a.title, url: a.url, domain: domainOf(a.url), country: '', lang: 'English', time: parseTime(a.published), image: a.image && a.image !== 'None' ? https(a.image) : '', desc: a.description || '' }));
      },
    },
    thenewsapi: {
      label: 'TheNewsAPI', signup: 'https://www.thenewsapi.com', free: '100 requests/day',
      async run(p, key) {
        const u = p.query.trim()
          ? `https://api.thenewsapi.com/v1/news/all?search=${encodeURIComponent(p.query.trim())}&language=en&sort=published_at&api_token=${encodeURIComponent(key)}`
          : `https://api.thenewsapi.com/v1/news/top?language=en&api_token=${encodeURIComponent(key)}`;
        const d = await getJSON(u);
        return (d.data || []).map((a) => ({ title: a.title, url: a.url, domain: a.source || domainOf(a.url), country: '', lang: 'English', time: parseTime(a.published_at), image: https(a.image_url), desc: a.description || a.snippet || '' }));
      },
    },
    noozra: {
      label: 'Noozra', signup: 'https://noozra.com/account/api', free: '100 requests/day',
      async run(p, key) {
        const u = p.query.trim() ? `https://noozra.com/api/search?q=${encodeURIComponent(p.query.trim())}&limit=100` : 'https://noozra.com/api/articles?limit=100&group=story';
        const d = await getJSON(u, { headers: { Authorization: 'Bearer ' + key } });
        return (d.articles || d.results || []).map((a) => ({ title: a.headline || a.title, url: a.url, domain: domainOf(a.url) || a.source, country: '', lang: 'English', time: parseTime(a.published_at), image: https(a.image_url), desc: a.description || '' }));
      },
    },
  };

  const spanMs = (s) => ({ '1h': 3600e3, '3h': 3 * 3600e3, '24h': 24 * 3600e3 }[s] || 3 * 3600e3);

  // ---------- orchestrator ----------
  // p = { topic, region, country (name|null), cc (ISO|null), query, span, english, keys:{name:key} }
  // onUpdate(items, status) is called every time a source finishes.
  async function fetchAll(p, onUpdate) {
    const status = [];
    const all = [];
    const q = p.query.trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 1);
    const matchQ = (it) => !words.length || words.every((w) => (it.title + ' ' + it.desc).toLowerCase().includes(w));
    const matchTopic = (it) => p.topic === 'top' || !TOPIC_WORDS[p.topic] || TOPIC_WORDS[p.topic].test(it.title + ' ' + it.desc);
    let tick = 0;
    const emit = () => { const t = ++tick; Promise.resolve().then(() => t === tick && onUpdate(all.slice(), status.slice())); };
    const add = (name, items, extra = {}) => {
      let n = 0;
      for (const it of items) {
        if (!it || !it.title || !it.url || it.title.length < 12) continue;
        all.push({ desc: '', image: '', cc: '', country: '', lang: 'English', ...it, ...extra, src: name }); n++;
      }
      return n;
    };
    const job = async (name, kind, fn) => {
      const t0 = now(); const st = { name, kind, state: 'loading', count: 0, ms: 0, error: '' };
      status.push(st); emit();
      try { st.count = await fn(); st.state = st.count ? 'ok' : 'empty'; }
      catch (e) { st.state = 'error'; st.error = String((e && e.message) || e).slice(0, 80); }
      st.ms = now() - t0; emit();
    };

    // which RSS feeds fit this view
    let feeds = FEEDS.filter((f) => (p.topic === 'top' || p.topic === 'world' ? f[4] === 'top' : f[4] === p.topic || (p.region !== 'all' && f[4] === 'top')));
    if (p.cc) feeds = FEEDS.filter((f) => f[2] === p.cc && f[4] === 'top');
    else if (p.region !== 'all') feeds = feeds.filter((f) => f[3] === p.region || (f[4] !== 'top' && p.topic !== 'top'));
    if (q && !p.cc && p.region === 'all') feeds = FEEDS.filter((f) => f[4] === 'top' || f[4] === p.topic);
    const english = p.english !== false;

    const jobs = [];
    jobs.push(job('GDELT', 'Global news index', async () => add('GDELT', await gdelt(p))));
    jobs.push(job(`Publisher feeds (${feeds.length})`, 'RSS via free converters', async () => {
      let n = 0;
      await pool(feeds, 8, async ([name, url, cc, region]) => {
        const items = await fetchFeed(url);
        const keep = items.filter((it) => matchQ(it) && (p.topic === 'top' || feedsTopic(url) === p.topic || matchTopic(it)));
        n += add(name, keep.map((it) => ({ ...it, domain: domainOf(it.url) || name, cc, country: '' })));
        emit();
      });
      return n;
    }));
    if (english && !p.cc) jobs.push(job('The Guardian', 'Open developer key', async () => add('The Guardian', await guardian(p))));
    if ((p.topic === 'tech' || q) && !p.cc && p.region === 'all') jobs.push(job('Hacker News', 'Tech', async () => add('Hacker News', await hackerNews(p))));
    if ((p.topic === 'science' || q) && !p.cc && p.region === 'all') jobs.push(job('Spaceflight News', 'Space & science', async () => add('Spaceflight News', await spaceflight(p))));
    if ((p.topic === 'top' || p.topic === 'world') && !q && !p.cc && p.region === 'all') jobs.push(job('Wikipedia', 'In the news', async () => add('Wikipedia', await wikipedia())));
    if (!p.cc) jobs.push(job('NewsAPI mirror', 'Backup headlines', async () => add('NewsAPI mirror', (await mirror(p)).filter(matchQ))));
    for (const [id, def] of Object.entries(KEYED)) {
      const key = p.keys && p.keys[id];
      if (key && !p.cc) jobs.push(job(def.label, 'Your API key', async () => add(def.label, await def.run(p, key))));
    }
    await Promise.all(jobs);
    onUpdate(all.slice(), status.slice(), true);
    return { items: all, status };
  }
  const feedTopicByUrl = new Map(FEEDS.map((f) => [f[1], f[4]]));
  const feedsTopic = (url) => feedTopicByUrl.get(url);

  window.GWNewsSources = { fetchAll, KEYED, FEEDS, spanMs };
})();
