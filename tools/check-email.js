const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(__dirname, "..", ".env"));

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional.
  }
}

function boolEnv(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() !== "false";
}

async function main() {
  const host = process.env.SMTP_HOST || "smtp.qq.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = boolEnv(process.env.SMTP_SECURE, true);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.REMINDER_TO;

  if (!user || !pass || !to) {
    throw new Error("Missing SMTP_USER, SMTP_PASS or REMINDER_TO.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    auth: { user, pass },
  });

  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || `"Rli 日历同步" <${user}>`,
    to,
    subject: "Rli 邮件提醒测试",
    text: "这是一封测试邮件，用来确认 SMTP 是否可用。",
  });

  console.log(
    JSON.stringify({
      ok: true,
      host,
      port,
      secure,
      accepted: info.accepted,
      rejected: info.rejected,
      messageId: info.messageId,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      response: error.response,
      message: error.message,
    }),
  );
  process.exit(1);
});
