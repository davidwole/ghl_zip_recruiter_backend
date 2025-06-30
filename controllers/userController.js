const User = require("../models/User");
const Webhook = require("../models/Webhook");
const jwt = require("jsonwebtoken");
const { validateIMAP } = require("../services/imapService");
const { trusted } = require("mongoose");

const JWT_SECRET = process.env.JWT_SECRET;

exports.signup = async (req, res) => {
  try {
    const { email, appPassword, imapHost, imapPort } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User already exists, Please login instead!" });
    }

    // Set default IMAP settings for known providers
    let finalImapHost = imapHost;
    let finalImapPort = imapPort;

    if (!imapHost || !imapPort) {
      const emailDomain = email.split("@")[1]?.toLowerCase();
      const knownProviders = {
        "gmail.com": { host: "imap.gmail.com", port: 993 },
        "googlemail.com": { host: "imap.gmail.com", port: 993 },
        "outlook.com": { host: "outlook.office365.com", port: 993 },
        "hotmail.com": { host: "outlook.office365.com", port: 993 },
        "live.com": { host: "outlook.office365.com", port: 993 },
        "yahoo.com": { host: "imap.mail.yahoo.com", port: 993 },
        "icloud.com": { host: "imap.mail.me.com", port: 993 },
        "mac.com": { host: "imap.mail.me.com", port: 993 },
        "aol.com": { host: "imap.aol.com", port: 993 },
        "zoho.com": { host: "imap.zoho.com", port: 993 },
      };

      if (knownProviders[emailDomain]) {
        finalImapHost = knownProviders[emailDomain].host;
        finalImapPort = knownProviders[emailDomain].port;
      }
    }

    // Validate IMAP credentials
    const isValid = await validateIMAP(
      email,
      appPassword,
      finalImapHost,
      finalImapPort
    );
    if (!isValid) {
      return res
        .status(401)
        .json({ error: "Invalid IMAP credentials or settings" });
    }

    // Create user
    const user = await User.create({
      email,
      appPassword,
      imapHost: finalImapHost,
      imapPort: finalImapPort,
    });

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        imapHost: user.imapHost,
        imapPort: user.imapPort,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, appPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.appPassword !== appPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addWebhook = async (req, res) => {
  try {
    console.log(req.body);
    const webhook = await Webhook.create(req.body);

    res.status(201).json({
      message: "Webhook added successfully",
      webhook: {
        id: webhook._id,
        name: webhook.name,
        url: webhook.url,
      },
    });
  } catch (error) {
    console.error("Add webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteWebhook = async (req, res) => {
  try {
    const id = req.params.id;

    const deletedWebhook = await Webhook.findByIdAndDelete(id);

    if (!deletedWebhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    res.status(200).json({ message: "Webhook deleted successfully" });
  } catch (error) {
    console.error("Delete webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getWebhooks = async (req, res) => {
  try {
    const webhooks = await Webhook.find();

    res.status(200).json(webhooks);
  } catch (error) {
    console.error("Get webhooks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getWebhooksByUser = async (req, res) => {
  try {
    const webhooks = await Webhook.find({ user: req.params.id });

    res.status(200).json(webhooks);
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
