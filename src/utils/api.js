'use strict';

const axios = require('axios');
const NodeCache = require('node-cache');
const log = require('./logger');

const cache = new NodeCache({ stdTTL: 3600 });
const API_BASE = 'https://www.mp3quran.net/api/v3';
const AUDIO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchReciters() {
  const key = 'reciters_ar';
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await axios.get(`${API_BASE}/reciters`, {
    params: { language: 'ar' },
    timeout: 15_000,
  });

  const list = res.data.reciters || [];
  if (list.length > 0) cache.set(key, list);
  return list;
}

function buildUrl(server, surahNum) {
  const base = server.endsWith('/') ? server : server + '/';
  return base + String(surahNum).padStart(3, '0') + '.mp3';
}

async function fetchAudioStream(url) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 120_000,
    maxRedirects: 5,
    headers: {
      'User-Agent': AUDIO_UA,
      Accept: 'audio/mpeg, audio/*, */*',
    },
  });
  return res.data;
}

function parseSurahList(str) {
  if (!str) return [];
  return str.split(',').map(Number).filter(n => n >= 1 && n <= 114);
}

module.exports = { fetchReciters, buildUrl, fetchAudioStream, parseSurahList };
