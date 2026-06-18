const fs = require("fs/promises");
const path = require("path");
const nodemailer = require("nodemailer");

const DEFAULT_REMINDER_MINUTES = [10, 5];
const DEFAULT_CHECK_INTERVAL_MS = 30000;
const DEFAULT_SEND_WINDOW_MS = 70000;

function createReminderService(options) {
  const dataDir = options.dataDir;
  const readEvents = options.readEvents;
  const remindersFile = path.join(dataDir, "reminders.json");
  const config = readConfig();
  let checking = false;
  let timer;

  async function start() {
    if (!config.enabled) {
      console.log("Email reminders disabled. Set SMTP_USER, SMTP_PASS and REMINDER_TO to enable.");
      return;
    }

    await ensureReminderStore();
    await checkDueReminders();
    timer = setInterval(() => {
      checkDueReminders().catch((error) => {
        console.error("Reminder check failed", error);
      });
    }, config.checkIntervalMs);
    console.log(
      `Email reminders enabled for ${maskEmail(config.to)}; before ${config.minutes.join(", ")} minutes.`,
    );
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
    }
  }

  async function checkDueReminders(now = new Date()) {
    if (checking) return;
    checking = true;
    try {
      const events = await readEvents();
      const sent = await readSentReminders();
      let changed = pruneOldReminders(sent, now);

      for (const event of events) {
        const startDate = getEventStartDate(event);
        if (!startDate) continue;

        for (const minutesBefore of config.minutes) {
          const dueAt = new Date(startDate.getTime() - minutesBefore * 60000);
          const delay = now.getTime() - dueAt.getTime();
          const beforeStart = startDate.getTime() - now.getTime();
          if (delay < 0 || delay > config.sendWindowMs || beforeStart <= 0) {
            continue;
          }

          const key = reminderKey(event, minutesBefore);
          if (sent[key]) {
            continue;
          }

          await sendReminder(event, minutesBefore, startDate);
          sent[key] = {
            eventId: event.id,
            minutesBefore,
            sentAt: new Date().toISOString(),
          };
          changed = true;
        }
      }

      if (changed) {
        await writeSentReminders(sent);
      }
    } finally {
      checking = false;
    }
  }

  async function sendReminder(event, minutesBefore, startDate) {
    const transporter = createTransporter(config);
    const subject = `日历提醒：${minutesBefore}分钟后 ${event.title}`;
    const timeRange = formatTimeRange(event);
    const dateText = formatDate(startDate);
    const note = event.note ? `\n备注：${event.note}` : "";
    const text = [
      `提醒：${minutesBefore}分钟后开始`,
      `事项：${event.title}`,
      `时间：${dateText} ${timeRange || "全天"}`,
      note.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      text,
      html: renderHtmlReminder({
        event,
        minutesBefore,
        dateText,
        timeRange: timeRange || "全天",
      }),
    });
    console.log(`Reminder sent: ${event.id} ${minutesBefore}m`);
  }

  async function ensureReminderStore() {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(remindersFile);
    } catch {
      await fs.writeFile(remindersFile, "{}\n", "utf8");
    }
  }

  async function readSentReminders() {
    await ensureReminderStore();
    const raw = await fs.readFile(remindersFile, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  async function writeSentReminders(sent) {
    const tempFile = `${remindersFile}.tmp`;
    await fs.writeFile(tempFile, `${JSON.stringify(sent, null, 2)}\n`, "utf8");
    await fs.rename(tempFile, remindersFile);
  }

  function pruneOldReminders(sent, now) {
    let changed = false;
    const maxAgeMs = 1000 * 60 * 60 * 24 * 30;
    for (const [key, value] of Object.entries(sent)) {
      const sentAt = Date.parse(value.sentAt || "");
      if (!sentAt || now.getTime() - sentAt > maxAgeMs) {
        delete sent[key];
        changed = true;
      }
    }
    return changed;
  }

  return {
    start,
    stop,
    checkDueReminders,
    isEnabled: () => config.enabled,
    getConfig: () => ({
      enabled: config.enabled,
      host: config.host,
      port: config.port,
      user: maskEmail(config.user),
      to: maskEmail(config.to),
      minutes: config.minutes,
    }),
  };
}

function readConfig() {
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const to = String(process.env.REMINDER_TO || "").trim();
  const host = String(process.env.SMTP_HOST || "smtp.qq.com").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
  const minutes = parseReminderMinutes(process.env.REMINDER_MINUTES);

  return {
    enabled: Boolean(user && pass && to),
    host,
    port,
    secure,
    user,
    pass,
    from: process.env.MAIL_FROM || `"日历同步" <${user}>`,
    to,
    minutes,
    checkIntervalMs: Number(process.env.REMINDER_CHECK_INTERVAL_MS || DEFAULT_CHECK_INTERVAL_MS),
    sendWindowMs: Number(process.env.REMINDER_SEND_WINDOW_MS || DEFAULT_SEND_WINDOW_MS),
  };
}

function parseReminderMinutes(value) {
  if (!value) return DEFAULT_REMINDER_MINUTES;
  const parsed = String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => b - a) : DEFAULT_REMINDER_MINUTES;
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function getEventStartDate(event) {
  const startTime = event.startTime || event.time || "";
  if (!event.date || !startTime) return null;
  const [year, month, day] = String(event.date).split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function reminderKey(event, minutesBefore) {
  const startTime = event.startTime || event.time || "";
  return [event.id, event.date, startTime, event.updatedAt || event.createdAt || "", minutesBefore].join(":");
}

function formatTimeRange(event) {
  const startTime = event.startTime || event.time || "";
  const endTime = event.endTime || "";
  if (startTime && endTime) return `${startTime}-${endTime}`;
  return startTime || "";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function renderHtmlReminder(data) {
  const note = data.event.note
    ? `<p style="margin:8px 0 0;color:#8b6f5a;">备注：${escapeHtml(data.event.note)}</p>`
    : "";
  return `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;background:#fff7ee;padding:18px;color:#3b2a1f;">
      <div style="max-width:560px;background:#fff;border:1px solid #efd6bd;border-radius:8px;padding:18px;">
        <p style="margin:0 0 8px;color:#c95f2a;font-weight:700;">${data.minutesBefore}分钟后开始</p>
        <h2 style="margin:0 0 12px;font-size:22px;">${escapeHtml(data.event.title)}</h2>
        <p style="margin:0;color:#3b2a1f;">${escapeHtml(data.dateText)} ${escapeHtml(data.timeRange)}</p>
        ${note}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maskEmail(value) {
  const email = String(value || "");
  const [name, domain] = email.split("@");
  if (!name || !domain) return "";
  const visible = name.length <= 3 ? name.slice(0, 1) : name.slice(0, 3);
  return `${visible}***@${domain}`;
}

module.exports = {
  createReminderService,
  getEventStartDate,
};
