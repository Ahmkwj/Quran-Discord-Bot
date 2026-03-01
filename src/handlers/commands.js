"use strict";

const { errReply } = require("../utils/panel");
const log = require("../utils/logger");

function buildContext(message, args, rest) {
  const ctx = {
    message,
    user: message.author,
    guild: message.guild,
    channel: message.channel,
    member: message.member,
    client: message.client,
    channelId: message.channelId,
    guildId: message.guildId,
    args,
    rest: (rest || "").trim(),
    _replyMsg: null,
    reply(payload) {
      const opts = {};
      if (payload && typeof payload === "object") {
        if (payload.content) opts.content = payload.content;
        if (payload.embeds) opts.embeds = payload.embeds;
      } else if (typeof payload === "string") {
        opts.content = payload;
      }
      return message.reply(opts).then((m) => {
        ctx._replyMsg = m;
        return m;
      });
    },
    deferReply() {
      return Promise.resolve();
    },
    editReply(payload) {
      const opts = {};
      if (payload && typeof payload === "object") {
        if (payload.content) opts.content = payload.content;
        if (payload.embeds) opts.embeds = payload.embeds;
      } else if (typeof payload === "string") {
        opts.content = payload;
      }
      if (ctx._replyMsg) return ctx._replyMsg.edit(opts);
      return message.reply(opts).then((m) => {
        ctx._replyMsg = m;
        return m;
      });
    },
    options: {
      getString(key) {
        if (key === "name") return ctx.rest;
        if (key === "type") return ctx.args[0] || "";
        if (key === "text") return ctx.args.slice(1).join(" ").trim() || "Use play to begin";
        return ctx.rest;
      },
      getUser() {
        return message.mentions.users.first() || null;
      },
      getAttachment() {
        return message.attachments.first() || null;
      },
    },
  };
  return ctx;
}

module.exports = {
  name: "messageCreate",

  execute(message, client) {
    if (!message.guild || message.author.bot) return;
    const content = (message.content || "").trim();
    if (!content) return;

    const mention = client.user.toString();
    if (!content.startsWith(mention)) return;
    const afterMention = content.slice(mention.length).trim();
    if (!afterMention) return;

    const parts = afterMention.split(/\s+/);
    const commandName = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);
    const rest = args.join(" ");

    const cmd = client.commands.get(commandName);
    if (!cmd) return;

    const ctx = buildContext(message, args, rest);
    (async () => {
      try {
        await cmd.execute(ctx);
      } catch (err) {
        log.error("CMD " + commandName, err);
        const payload = errReply("Something went wrong. Please try again.");
        try {
          await ctx.reply(payload);
        } catch (_) {}
      }
    })();
  },
};
