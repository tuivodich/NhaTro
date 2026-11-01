"use strict";

/** Máy khách Telegram Bot API tối thiểu (chỉ cần fetch có sẵn trong Node 22). */
function createTelegram(token, fetchImpl = fetch) {
  const call = async (method, body) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram ${method} lỗi: ${data.description ?? res.status}`);
    return data.result;
  };
  return {
    getMe: () => call("getMe"),
    sendMessage: (chatId, text, extra = {}) => call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }),
    sendPhoto: (chatId, photo, caption, extra = {}) => call("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", ...extra }),
    editMessageText: (chatId, messageId, text, extra = {}) => call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }),
    answerCallbackQuery: (id, text) => call("answerCallbackQuery", { callback_query_id: id, text }),
    setWebhook: (url, secretToken) => call("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"], drop_pending_updates: true }),
    setMyCommands: (commands, scope, languageCode) => call("setMyCommands", { commands, ...(scope ? { scope } : {}), ...(languageCode ? { language_code: languageCode } : {}) }),
  };
}

module.exports = { createTelegram };
