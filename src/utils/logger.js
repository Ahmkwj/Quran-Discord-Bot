'use strict';

const RESET = '\x1b[0m';
const COLORS = {
  info:    '\x1b[36m',
  success: '\x1b[32m',
  warn:    '\x1b[33m',
  error:   '\x1b[31m',
};

function ts() {
  return new Date().toISOString();
}

function fmt(level, ctx, msg) {
  const c = COLORS[level] || '';
  return `${c}[${level.toUpperCase().padEnd(5)}]${RESET} ${ts()} [${ctx.padEnd(16)}] ${msg}`;
}

const info    = (ctx, msg) => console.log(fmt('info', ctx, msg));
const success = (ctx, msg) => console.log(fmt('success', ctx, msg));
const warn    = (ctx, msg) => console.warn(fmt('warn', ctx, msg));

function error(ctx, err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(fmt('error', ctx, msg));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

module.exports = { info, success, warn, error };
