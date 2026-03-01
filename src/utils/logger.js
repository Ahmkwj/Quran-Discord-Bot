"use strict";

const PAD = 14;
const LINE = "------------------------------------------------------------";

function ts() {
  return new Date().toISOString();
}

function tag(name) {
  return `[${String(name).padEnd(PAD)}]`;
}

function info(context, message) {
  console.log(`${tag(context)} ${ts()}  ${message}`);
}

function success(context, message) {
  console.log(`${tag(context)} ${ts()}  ${message}`);
}

function warn(context, message) {
  console.warn(`${tag(context)} ${ts()}  ${message}`);
}

function error(context, err, options = {}) {
  const showStack = options.stack !== false && err && err.stack;
  const msg = err && (err.message || String(err));
  const name = err && err.name ? err.name : "Error";

  console.error("");
  console.error(LINE);
  console.error(`${tag("ERROR")} ${ts()}`);
  console.error(`${tag(context)} ${name}: ${msg}`);
  if (showStack && err && err.stack) {
    console.error("");
    console.error(err.stack);
  }
  console.error(LINE);
  console.error("");
}

module.exports = { info, success, warn, error, LINE, tag };
