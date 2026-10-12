// G-Wave live translation worker, fully in the browser.
// Stage 1: Whisper transcribes speech in its original language (words stream live).
// Stage 2: a dedicated Opus-MT model translates that text to English.
// Routing is checked on what was actually heard (its writing system), because Whisper sometimes
// writes Hindi in Urdu script, Nepali in Latin letters, or Malayalam in Tamil script.
// Languages Whisper can't transcribe reliably go straight to Whisper's own English translation.
import { pipeline, env, WhisperTextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true; // every model is cached after its first download

const ASR_MODELS = { base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };
// Opus-MT models with a dedicated <lang>→English direction (Xenova ONNX conversions)
const MT = {
  ar: 'ar', de: 'de', es: 'es', fr: 'fr', it: 'it', ru: 'ru', zh: 'zh', ko: 'ko', ja: 'ja', nl: 'nl', pl: 'pl',
  cs: 'cs', fi: 'fi', tr: 'tr', sv: 'sv', da: 'da', id: 'id', hi: 'hi', et: 'et', th: 'th', vi: 'vi', uk: 'uk',
  hu: 'hu', af: 'af', pt: 'ROMANCE', ro: 'ROMANCE', ca: 'ROMANCE', gl: 'ROMANCE', lt: 'bat', lv: 'bat',
};
const mtName = (code) => `Xenova/opus-mt-${code}-en`;

// Writing systems, and which one each language should come out in
const SCRIPTS = {
  Arabic: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g, Hebrew: /[֐-׿]/g,
  Devanagari: /[ऀ-ॿ]/g, Bengali: /[ঀ-৿]/g, Gurmukhi: /[਀-੿]/g, Gujarati: /[઀-૿]/g,
  Tamil: /[஀-௿]/g, Telugu: /[ఀ-౿]/g, Kannada: /[ಀ-೿]/g, Malayalam: /[ഀ-ൿ]/g,
  Sinhala: /[඀-෿]/g, Thai: /[฀-๿]/g, Lao: /[຀-໿]/g, Myanmar: /[က-႟]/g,
  Khmer: /[ក-៿]/g, Georgian: /[Ⴀ-ჿ]/g, Armenian: /[԰-֏]/g,
  Han: /[㐀-鿿豈-﫿]/g, Kana: /[぀-ヿ]/g, Hangul: /[가-힯ᄀ-ᇿ]/g,
  Cyrillic: /[Ѐ-ӿ]/g, Greek: /[Ͱ-Ͽἀ-῿]/g, Latin: /[A-Za-zÀ-ɏḀ-ỿ]/g,
};
const EXPECT = {
  ar: 'Arabic', fa: 'Arabic', ur: 'Arabic', ps: 'Arabic', he: 'Hebrew', hi: 'Devanagari', mr: 'Devanagari', ne: 'Devanagari',
  bn: 'Bengali', pa: 'Gurmukhi', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', si: 'Sinhala',
  th: 'Thai', lo: 'Lao', my: 'Myanmar', km: 'Khmer', ka: 'Georgian', hy: 'Armenian', zh: 'Han', ja: 'Kana|Han', ko: 'Hangul',
  ru: 'Cyrillic', uk: 'Cyrillic', bg: 'Cyrillic', sr: 'Cyrillic', mk: 'Cyrillic', kk: 'Cyrillic', mn: 'Cyrillic', el: 'Greek',
};
// Whisper's transcription of these is unreliable (measured: wrong script or garbled), so translate directly
const SCRIPT_MT = { Han: 'zh', Hangul: 'ko', Kana: 'ja', Thai: 'th', Devanagari: 'hi', Hebrew: null, Greek: null };
const DIRECT = new Set(['ml', 'ta', 'te', 'kn', 'si', 'my', 'km', 'lo', 'gu', 'pa', 'mr', 'bn', 'ne', 'ps', 'am', 'sw']);

function scriptOf(text) {
  const counts = {}; let total = 0;
  for (const [name, re] of Object.entries(SCRIPTS)) { const n = (text.match(re) || []).length; if (n) { counts[name] = n; total += n; } }
  if (!total) return { main: null, share: 0, total: 0 };
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { main: main[0], share: main[1] / total, total };
}

let asr = null, asrModel = '', device = 'wasm', canStream = true;
const translators = new Map(); // model name -> Promise<pipeline|null>

function progressReporter(kind) {
  const files = {};
  return (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = { loaded: p.loaded, total: p.total };
      let l = 0, t = 0;
      for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
      self.postMessage({ type: kind, pct: t ? (l / t) * 100 : 0 });
    }
  };
}

async function hasGPU() {
  try { return !!(self.navigator && self.navigator.gpu && (await self.navigator.gpu.requestAdapter())); } catch { return false; }
}

async function loadASR(quality) {
  const gpu = await hasGPU();
  const size = quality === 'accurate' ? 'small' : quality === 'fast' ? 'base' : (gpu ? 'small' : 'base');
  if (asr && asrModel === size) return;
  asr = null;
  const name = ASR_MODELS[size];
  const progress_callback = progressReporter('progress');
  if (gpu) {
    try {
      asr = await pipeline('automatic-speech-recognition', name, {
        device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback,
      });
      device = 'webgpu';
    } catch (e) { asr = null; }
  }
  if (!asr) {
    asr = await pipeline('automatic-speech-recognition', name, { device: 'wasm', dtype: 'q8', progress_callback });
    device = 'wasm';
  }
  asrModel = size;
  try { await asr(new Float32Array(16000), { task: 'transcribe', language: 'en', max_new_tokens: 4 }); } catch {}
}

// Load (once) a translator; resolves to null if it can't be loaded
function loadTranslator(name) {
  if (!translators.has(name)) {
    translators.set(name, (async () => {
      try {
        self.postMessage({ type: 'mt-loading', model: name });
        const t = await pipeline('translation', name, { dtype: 'q8', progress_callback: progressReporter('mt-progress') });
        self.postMessage({ type: 'mt-ready', model: name });
        return t;
      } catch (e) {
        if (name !== mtName('mul')) return loadTranslator(mtName('mul'));
        self.postMessage({ type: 'mt-unavailable' });
        return null;
      }
    })());
  }
  return translators.get(name);
}
const translatorFor = (lang) => loadTranslator(MT[lang] ? mtName(MT[lang]) : mtName('mul'));
const ready = async (p) => { const v = await Promise.race([p, new Promise((r) => setTimeout(() => r('pending'), 0))]); return v === 'pending' ? null : v; };

// Guard against Whisper's habit of repeating a phrase in a loop
function tidy(text) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  const parts = t.split(/(?<=[.!?。！？])\s+/);
  const out = [];
  for (const p of parts) if (!out.length || out[out.length - 1].toLowerCase() !== p.toLowerCase()) out.push(p);
  t = out.join(' ');
  t = t.replace(/\b((?:\S+\s+){2,7}?\S+)(?:\s+\1){2,}/gi, '$1');
  return t;
}
// English output that is mostly non-Latin letters is a failed translation: drop it
function looksEnglish(text) {
  const s = scriptOf(text);
  return !s.total || (s.main === 'Latin' && s.share > 0.8);
}

async function whisper(m, task, stream = true) {
  const opts = { task, no_repeat_ngram_size: 3, max_new_tokens: Math.round(16 + (m.secs || 5) * 8) };
  if (m.language) opts.language = m.language;
  if (stream && canStream && WhisperTextStreamer) {
    let text = '';
    opts.streamer = new WhisperTextStreamer(asr.tokenizer, {
      skip_prompt: true,
      callback_function: (t) => {
        text += t;
        self.postMessage({ type: 'partial', text: tidy(text), sid: m.sid, src: task === 'transcribe' && m.language !== 'en' });
      },
    });
  }
  try {
    return tidy((await asr(m.audio, opts)).text);
  } catch (err) {
    if (!opts.streamer) throw err;
    canStream = false;
    delete opts.streamer;
    return tidy((await asr(m.audio, opts)).text);
  }
}

async function run(m) {
  const lang = m.language;
  if (lang === 'en') return { text: await whisper(m, 'transcribe'), orig: '', via: 'whisper' };
  if (DIRECT.has(lang)) {
    const text = await whisper(m, 'translate');
    return { text: looksEnglish(text) ? text : '', orig: '', via: 'whisper-direct' };
  }
  const orig = await whisper(m, 'transcribe');
  if (!orig) return { text: '', orig: '' };
  const sc = scriptOf(orig);
  const expected = EXPECT[lang] || 'Latin';
  const scriptOK = sc.share >= 0.75 && (!lang || expected.split('|').includes(sc.main));
  // What was heard decides the translator: e.g. Hindi written in Urdu script → multilingual model
  let mtLang = lang;
  if (!scriptOK) {
    if (sc.share < 0.75 || (sc.main === 'Latin' && expected !== 'Latin')) {
      // garbled, or a non-Latin language romanised: Whisper's own translation is safer
      const text = await whisper(m, 'translate', false);
      return { text: looksEnglish(text) ? text : '', orig, via: 'whisper-direct' };
    }
    mtLang = null; // heard in a different script than expected → multilingual translator
  } else if (!lang) {
    mtLang = SCRIPT_MT[sc.main] || null; // unknown station language: only unambiguous scripts get a dedicated model
  }
  const translator = await ready(translatorFor(mtLang));
  if (translator) {
    const out = await translator(orig, { max_new_tokens: 256 });
    const text = tidy(out && out[0] && out[0].translation_text);
    if (text && looksEnglish(text)) return { text, orig, via: 'mt' };
  }
  // translator still downloading or failed: Whisper's own English for this chunk
  const text = await whisper(m, 'translate', false);
  return { text: looksEnglish(text) ? text : '', orig, via: 'whisper' };
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'load') {
    try {
      await loadASR(m.quality || 'auto');
      self.postMessage({ type: 'ready', device, model: asrModel });
      if (m.language && m.language !== 'en' && !DIRECT.has(m.language)) translatorFor(m.language);
    } catch (err) {
      self.postMessage({ type: 'fatal', message: String((err && err.message) || err).slice(0, 140) });
    }
  } else if (m.type === 'prepare') {
    if (m.language && m.language !== 'en' && !DIRECT.has(m.language)) translatorFor(m.language);
  } else if (m.type === 'run') {
    const t0 = performance.now();
    try {
      const r = asr ? await run(m) : { text: '' };
      self.postMessage({ type: 'result', ...r, sid: m.sid, secs: m.secs, ms: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err).slice(0, 140), sid: m.sid });
    }
  }
};
