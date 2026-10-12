// G-Radio live translation worker, fully in the browser.
// Stage 1: Whisper transcribes speech in its original language (accurate, words stream live).
// Stage 2: a dedicated Opus-MT model translates that text to English.
// Fallbacks: multilingual Opus-MT (mul-en), then Whisper's own translate mode.
import { pipeline, env, WhisperTextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true; // every model is cached after its first download

const ASR_MODEL = 'onnx-community/whisper-base';
// Opus-MT models with a dedicated <lang>→English direction (Xenova ONNX conversions)
const MT = {
  ar: 'ar', de: 'de', es: 'es', fr: 'fr', it: 'it', ru: 'ru', zh: 'zh', ko: 'ko', ja: 'ja', nl: 'nl', pl: 'pl',
  cs: 'cs', fi: 'fi', tr: 'tr', sv: 'sv', da: 'da', id: 'id', hi: 'hi', et: 'et', th: 'th', vi: 'vi', uk: 'uk',
  hu: 'hu', af: 'af', pt: 'ROMANCE', ro: 'ROMANCE', ca: 'ROMANCE', gl: 'ROMANCE', lt: 'bat', lv: 'bat',
};
const mtName = (lang) => `Xenova/opus-mt-${MT[lang] || 'mul'}-en`;

let asr = null, device = 'wasm', canStream = true;
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

async function loadASR() {
  const progress_callback = progressReporter('progress');
  if (self.navigator && self.navigator.gpu) {
    try {
      const adapter = await self.navigator.gpu.requestAdapter();
      if (adapter) {
        asr = await pipeline('automatic-speech-recognition', ASR_MODEL, {
          device: 'webgpu',
          dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
          progress_callback,
        });
        device = 'webgpu';
      }
    } catch (e) { asr = null; }
  }
  if (!asr) {
    asr = await pipeline('automatic-speech-recognition', ASR_MODEL, { device: 'wasm', dtype: 'q8', progress_callback });
    device = 'wasm';
  }
  try { await asr(new Float32Array(16000), { task: 'transcribe', language: 'en', max_new_tokens: 4 }); } catch {}
}

// Load (once) the best translator for a language; resolves to null if none can be loaded
function getTranslator(lang) {
  const chain = MT[lang] ? [mtName(lang), 'Xenova/opus-mt-mul-en'] : ['Xenova/opus-mt-mul-en'];
  const key = chain[0];
  if (!translators.has(key)) {
    translators.set(key, (async () => {
      for (const name of chain) {
        try {
          self.postMessage({ type: 'mt-loading', model: name });
          const t = await pipeline('translation', name, { dtype: 'q8', progress_callback: progressReporter('mt-progress') });
          self.postMessage({ type: 'mt-ready', model: name });
          return t;
        } catch (e) { /* try the next one */ }
      }
      self.postMessage({ type: 'mt-unavailable' });
      return null;
    })());
  }
  return translators.get(key);
}

// Guard against Whisper's habit of repeating a phrase in a loop
function tidy(text) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  const parts = t.split(/(?<=[.!?。！？])\s+/);
  const out = [];
  for (const p of parts) if (!out.length || out[out.length - 1].toLowerCase() !== p.toLowerCase()) out.push(p);
  t = out.join(' ');
  // collapse any 3–8 word phrase repeated 3+ times in a row
  t = t.replace(/\b((?:\S+\s+){2,7}?\S+)(?:\s+\1){2,}/gi, '$1');
  return t;
}

async function whisper(m, task) {
  const opts = {
    task,
    no_repeat_ngram_size: 3,
    max_new_tokens: Math.round(16 + (m.secs || 5) * 8),
  };
  if (m.language) opts.language = m.language;
  if (canStream && WhisperTextStreamer) {
    let text = '';
    opts.streamer = new WhisperTextStreamer(asr.tokenizer, {
      skip_prompt: true,
      callback_function: (t) => {
        text += t;
        // stream words as they decode; src=true means original language (English follows)
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
  if (m.language === 'en') {
    const text = await whisper(m, 'transcribe');
    return { text, orig: '', via: 'whisper' };
  }
  const translator = await Promise.race([getTranslator(m.language), new Promise((r) => setTimeout(() => r('pending'), 0))]);
  if (translator && translator !== 'pending') {
    const orig = await whisper(m, 'transcribe');
    if (!orig) return { text: '', orig: '' };
    const out = await translator(orig, { max_new_tokens: 256 });
    return { text: tidy(out && out[0] && out[0].translation_text), orig, via: 'mt' };
  }
  // translator still downloading (or unavailable): use Whisper's own translation meanwhile
  const text = await whisper(m, 'translate');
  return { text, orig: '', via: 'whisper' };
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'load') {
    try {
      if (!asr) await loadASR();
      self.postMessage({ type: 'ready', device });
      if (m.language && m.language !== 'en') getTranslator(m.language);
    } catch (err) {
      self.postMessage({ type: 'fatal', message: String((err && err.message) || err).slice(0, 140) });
    }
  } else if (m.type === 'prepare') {
    if (m.language !== 'en') getTranslator(m.language);
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
