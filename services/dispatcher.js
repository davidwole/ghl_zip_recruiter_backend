const User = require("../models/User");
const Webhook = require("../models/Webhook");
const { parseInbox } = require("./parser");
const axios = require("axios");

async function runForAllUsers() {
  const users = await User.find();

  for (const user of users) {
    const webhooks = await Webhook.find({ user: user._id });
    if (webhooks.length === 0) continue;

    let inboxData;
    try {
      inboxData = await parseInbox(
        user.email,
        user.appPassword,
        user.imapHost,
        user.imapPort
      );
    } catch (err) {
      console.error(`Failed to parse inbox for ${user.email}:`, err.message);
      continue;
    }

    if (!Array.isArray(inboxData) || inboxData.length === 0) {
      console.log(`No data found for ${user.email}`);
      continue;
    }

    for (const data of inboxData) {
      for (const hook of webhooks) {
        try {
          await axios.post(hook.url, data);
          console.log(`Sent data to ${hook.url} for ${user.email}`);
        } catch (err) {
          console.error(`Failed to POST to ${hook.url}:`, err.message);
        }
      }
    }
  }
}

module.exports = { runForAllUsers };
