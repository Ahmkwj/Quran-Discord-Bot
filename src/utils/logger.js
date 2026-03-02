"use strict";

const fs = require("fs");
const path = require("path");

const PAD = 14;
const LINE = "------------------------------------------------------------";
const LOG_FILE = path.join(process.cwd(), "bot.log");

function ts() {
  return new Date().toISOString();
}

function tag(name) {
  return `[${String(name).padEnd(PAD)}]`;
}

function toFile(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {}
}

function info(context, message) {
  const line = `${tag(context)} ${ts()}  ${message}`;
  console.log(line);
  toFile(line);
}

function success(context, message) {
  const line = `${tag(context)} ${ts()}  ${message}`;
  console.log(line);
  toFile(line);
}

function warn(context, message) {
  const line = `${tag(context)} ${ts()}  ${message}`;
  console.warn(line);
  toFile(line);
}

function error(context, err, options = {}) {
  const showStack = options.stack !== false && err && err.stack;
  const msg = err && (err.message || String(err));
  const name = err && err.name ? err.name : "Error";

  const lines = [
    "",
    LINE,
    `${tag("ERROR")} ${ts()}`,
    `${tag(context)} ${name}: ${msg}`,
  ];
  if (showStack && err && err.stack) {
    lines.push("", err.stack);
  }
  lines.push(LINE, "");

  const block = lines.join("\n");
  console.error(block);
  toFile(block);
}

module.exports = { info, success, warn, error };
