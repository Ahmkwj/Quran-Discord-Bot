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

function parseSurahList(str) {
  if (!str) return [];
  return str.split(',').map(Number).filter(Boolean);
}

module.exports = { fetchReciters, buildUrl, parseSurahList };
