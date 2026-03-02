'use strict';

const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 });
const API = 'https://www.mp3quran.net/api/v3';

async function fetchReciters() {
  const key = 'reciters_ar';
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await axios.get(`${API}/reciters`, {
    params: { language: 'ar' },
    timeout: 12000
  });
  const list = res.data.reciters || [];
  cache.set(key, list);
  return list;
}

function buildUrl(server, surahNum) {
  return server + String(surahNum).padStart(3, '0') + '.mp3';
}

const AUDIO_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchAudioStream(url) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      'User-Agent': AUDIO_USER_AGENT,
      'Accept': 'audio/mpeg, audio/*, */*',
    },
  });
  return res.data;
}

function parseSurahList(str) {
  if (!str) return [];
  return str.split(',').map(Number).filter(Boolean);
}

module.exports = { fetchReciters, buildUrl, parseSurahList, fetchAudioStream };
