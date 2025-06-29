const imaps = require("imap-simple");

async function validateIMAP(email, password, imapHost, imapPort) {
  try {
    const config = {
      imap: {
        user: email,
        password,
        host: imapHost,
        port: imapPort,
        tls: true,
        authTimeout: 5000,
      },
    };

    const connection = await imaps.connect(config);
    await connection.end();
    return true;
  } catch (err) {
    return false;
  }
}

async function parseInbox(email, password) {
  // Dummy implementation - replace with actual logic
  return {
    email,
    password,
    phoneNumber: "123-456-7890",
  };
}

module.exports = { validateIMAP, parseInbox };
