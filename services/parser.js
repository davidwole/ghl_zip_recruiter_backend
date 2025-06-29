const Imap = require("imap");
const { simpleParser } = require("mailparser");
const EventEmitter = require("events");

class RealTimeEmailParser extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.imap = new Imap(config);
    this.applicantInfoArray = [];
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.imap.once("ready", () => {
      console.log("IMAP connection ready");
      this.openInbox();
    });

    this.imap.once("error", (err) => {
      console.error("IMAP connection error:", err);
      this.emit("error", err);
    });

    this.imap.once("end", () => {
      // console.log("IMAP connection ended");
      this.emit("disconnected");
    });

    // Listen for new emails
    this.imap.on("mail", (numNewMsgs) => {
      console.log(`${numNewMsgs} new email(s) received`);
      this.fetchNewEmails();
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log("Connecting to email server...");
      this.imap.connect();

      this.once("connected", resolve);
      this.once("error", reject);
    });
  }

  openInbox() {
    this.imap.openBox("INBOX", false, (err, box) => {
      if (err) {
        console.error("Error opening inbox:", err);
        return;
      }
      // console.log("Inbox opened, fetching job application emails...");
      this.emit("connected");
      this.fetchAllJobApplicationEmails();
    });
  }

  fetchAllJobApplicationEmails() {
    // Search for all emails (not just unseen ones)
    this.imap.search(
      ["UNSEEN", ["FROM", "davidwall230@gmail.com"]],
      (err, results) => {
        if (err) {
          console.error("Search error:", err);
          this.emit("error", err);
          return;
        }

        if (!results || !results.length) {
          console.log("No emails found");
          this.emit("processingComplete", this.applicantInfoArray);
          return;
        }

        console.log(`Found ${results.length} email(s) to process`);
        this.processedCount = 0;
        this.totalEmails = results.length;

        // Fetch all emails
        const fetch = this.imap.fetch(results, {
          bodies: "",
          markSeen: false, // Don't mark as seen when just collecting data
        });

        fetch.on("message", (msg, seqno) => {
          this.processMessage(msg, seqno);
        });

        fetch.once("error", (err) => {
          console.error("Fetch error:", err);
          this.emit("error", err);
        });

        fetch.once("end", () => {
          console.log("Finished fetching all emails");
        });
      }
    );
  }

  fetchNewEmails() {
    // Search for unseen emails
    this.imap.search(
      ["UNSEEN", ["FROM", "davidwall230@gmail.com"]],
      (err, results) => {
        if (err) {
          console.error("Search error:", err);
          return;
        }

        if (!results || !results.length) {
          console.log("No new emails found");
          return;
        }

        // console.log(`Found ${results.length} new email(s)`);

        // Fetch the latest emails
        const fetch = this.imap.fetch(results, {
          bodies: "",
          markSeen: true,
        });

        fetch.on("message", (msg, seqno) => {
          this.processMessage(msg, seqno);
        });

        fetch.once("error", (err) => {
          console.error("Fetch error:", err);
        });
      }
    );
  }

  processMessage(msg, seqno) {
    let buffer = "";

    msg.on("body", (stream, info) => {
      stream.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
      });

      stream.once("end", () => {
        // Parse the raw email
        simpleParser(buffer, (err, parsed) => {
          if (err) {
            console.error("Email parsing error:", err);
            this.processedCount++;
            this.checkIfProcessingComplete();
            return;
          }

          // Check if this is a job application email
          if (this.isJobApplicationEmail(parsed)) {
            const applicationData = this.parseJobApplication(parsed);
            const applicantInfo = this.extractApplicantInfo(applicationData);

            if (applicantInfo) {
              this.applicantInfoArray.push(applicantInfo);
            }
          }

          this.processedCount++;
          this.checkIfProcessingComplete();
        });
      });
    });

    msg.once("attributes", (attrs) => {
      // console.log(`Processing email #${seqno} with UID: ${attrs.uid}`);
    });
  }

  checkIfProcessingComplete() {
    if (this.processedCount >= this.totalEmails) {
      // console.log(
      //   `✅ Processing complete. Found ${this.applicantInfoArray.length} job applications`
      // );
      this.emit("processingComplete", this.applicantInfoArray);
    }
  }

  isJobApplicationEmail(email) {
    const subject = (email.subject || "").toLowerCase();
    const text = (email.text || "").toLowerCase();
    const html = (email.html || "").toLowerCase();

    // Check multiple patterns for job application emails
    const subjectPatterns = [
      /new job application received/i,
      /job application.*received/i,
      /application.*submitted/i,
    ];

    const bodyPatterns = [
      /new job application has.*been submitted/i,
      /job application.*submitted/i,
      /applicant.*details/i,
    ];

    const hasSubjectMatch = subjectPatterns.some((pattern) =>
      pattern.test(subject)
    );
    const hasBodyMatch = bodyPatterns.some(
      (pattern) => pattern.test(text) || pattern.test(html)
    );

    return hasSubjectMatch || hasBodyMatch;
  }

  parseJobApplication(email) {
    const text = email.text || "";
    const html = email.html || "";
    const subject = email.subject || "";

    // Combine text and HTML for better parsing
    const content = `${text}\n${html}`;

    const parsedData = {
      emailMetadata: {
        from: email.from?.text,
        to: email.to?.text,
        subject: subject,
        date: email.date,
        messageId: email.messageId,
      },
      applicantName: null,
      applicantEmail: null,
      applicantPhone: null,
      extractionMethod: [],
    };

    // Extract applicant name from subject (multiple patterns)
    const subjectPatterns = [
      /–\s*(.+?)$/, // Original pattern
      /-\s*(.+?)$/, // Dash instead of em-dash
      /received\s*[-–]\s*(.+?)$/i,
      /application.*from\s+(.+?)$/i,
    ];

    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match && match[1]) {
        parsedData.applicantNameFromSubject = match[1].trim();
        parsedData.extractionMethod.push("subject");
        break;
      }
    }

    // Extract details from email body (improved patterns)
    // Name extraction patterns
    const namePatterns = [
      /\*\*Name:\*\*\s*(.+?)(?=\s*\*\*(?:Email|Phone)|$)/s,
      /<strong>Name:<\/strong>\s*(.+?)(?=\s*<strong>(?:Email|Phone)|$)/s,
      /Name:\s*(.+?)(?=\s*(?:Email|Phone):|$)/s,
      /Applicant.*Name:\s*(.+?)(?=\s*(?:Email|Phone)|$)/s,
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        parsedData.applicantName = this.cleanExtractedText(match[1]);
        parsedData.extractionMethod.push("name-body");
        break;
      }
    }

    // Email extraction patterns
    const emailPatterns = [
      /\*\*Email:\*\*\s*(.+?)(?=\s*\*\*(?:Phone|Name)|$)/s,
      /<strong>Email:<\/strong>\s*(.+?)(?=\s*<strong>(?:Phone|Name)|$)/s,
      /Email:\s*(.+?)(?=\s*(?:Phone|Name):|$)/s,
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    ];

    for (const pattern of emailPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const email = this.cleanExtractedText(match[1]);
        if (this.isValidEmail(email)) {
          parsedData.applicantEmail = email;
          parsedData.extractionMethod.push("email-body");
          break;
        }
      }
    }

    // Phone extraction patterns
    const phonePatterns = [
      /\*\*Phone Number:\*\*\s*(.+?)(?=\s*(?:\*\*|Please|$))/s,
      /<strong>Phone.*?:<\/strong>\s*(.+?)(?=\s*(?:<strong>|Please|$))/s,
      /Phone.*?:\s*(.+?)(?=\s*(?:Please|$))/s,
      /(\+?[\d\s\-\(\)\.]{10,})/,
    ];

    for (const pattern of phonePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const phone = this.cleanExtractedText(match[1]);
        if (this.isValidPhone(phone)) {
          parsedData.applicantPhone = phone;
          parsedData.extractionMethod.push("phone-body");
          break;
        }
      }
    }

    // Fallback: Use subject name if body name not found
    if (!parsedData.applicantName && parsedData.applicantNameFromSubject) {
      parsedData.applicantName = parsedData.applicantNameFromSubject;
      parsedData.extractionMethod.push("name-subject-fallback");
    }

    return parsedData;
  }

  extractApplicantInfo(applicationData) {
    // Only return applicant info if we have at least name and email
    if (applicationData.applicantName && applicationData.applicantEmail) {
      return {
        name: applicationData.applicantName,
        email: applicationData.applicantEmail,
        phone: applicationData.applicantPhone,
        receivedAt: applicationData.emailMetadata.date,
      };
    }
    return null;
  }

  cleanExtractedText(text) {
    return text
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidPhone(phone) {
    // Remove all non-digit characters to check length
    const digitsOnly = phone.replace(/\D/g, "");
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }

  disconnect() {
    return new Promise((resolve) => {
      this.imap.end();
      setTimeout(resolve, 1000);
    });
  }

  // Method to get all applicant info collected so far
  getApplicantInfoArray() {
    return this.applicantInfoArray;
  }
}

// Simple function that takes email config and returns array of applicant info
async function getJobApplications(emailConfig, timeout = 999930000) {
  return new Promise(async (resolve, reject) => {
    const emailParser = new RealTimeEmailParser(emailConfig);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      emailParser.disconnect().then(() => {
        reject(
          new Error(
            `Timeout: Could not fetch job applications within ${timeout}ms`
          )
        );
      });
    }, timeout);

    try {
      // Connect to email server
      await emailParser.connect();

      // Wait for processing to complete
      emailParser.once("processingComplete", async (applicantInfoArray) => {
        clearTimeout(timeoutId);
        await emailParser.disconnect();
        resolve(applicantInfoArray);
      });

      // Handle errors
      emailParser.once("error", async (error) => {
        clearTimeout(timeoutId);
        await emailParser.disconnect();
        reject(error);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      await emailParser.disconnect();
      reject(error);
    }
  });
}

async function parseInbox(email, appPassword, imapHost, imapPort) {
  const emailConfig = {
    user: email,
    password: appPassword,
    host: imapHost,
    port: imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  };

  try {
    console.log("📧 Fetching job applications...");
    const applications = await getJobApplications(emailConfig);

    // console.log(`✅ Found ${applications.length} job applications:`);

    return applications;
  } catch (error) {
    console.error("❌ Error fetching job applications:", error);
    throw error;
  }
}

// Export both the class and the simple function
module.exports = {
  RealTimeEmailParser,
  getJobApplications,
  parseInbox,
};

// Uncomment to run the example
// example();
