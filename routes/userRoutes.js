const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const auth = require("../middleware/auth");

// Authentication routes (no auth middleware needed)
router.post("/auth/register", userController.signup);
router.post("/auth/login", userController.login);
router.get("/process/email-list", userController.getAllUsers);

// Webhook routes (auth middleware required)
router.post("/webhook/add", auth, userController.addWebhook);
router.delete("/webhook/delete/:id", auth, userController.deleteWebhook);
router.get("/webhooks", auth, userController.getWebhooks);
router.get("/webhooks/:id", auth, userController.getWebhooksByUser);

module.exports = router;
