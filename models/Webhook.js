const mongoose = require("mongoose");

const webhookSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
});

module.exports = mongoose.model("Webhook", webhookSchema);
