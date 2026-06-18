const cors = require("cors");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { createReminderService } = require("./reminder-service");

const DISPLAY_PORT = Number(process.env.PORT || 14785);
const MANAGE_PORT = Number(process.env.MANAGE_PORT || 14786);
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MANAGE_DIR = path.join(__dirname, "..", "manage");
const ENV_FILE = path.join(__dirname, "..", ".env");

const clients = new Set();
const PRIORITY_RANK = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
let mutationQueue = Promise.resolve();
let reminderService;

loadEnvFile(ENV_FILE);

function loadEnvFile(filePath) {
  try {
    const raw = require("fs").readFileSync(filePath, "utf8");
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
    // Local .env is optional and intentionally ignored by git.
  }
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readEvents() {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map(normalizeStoredEvent).sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    if (dateCompare !== 0) return dateCompare;
    const priorityCompare = getPriorityRank(a.priority) - getPriorityRank(b.priority);
    if (priorityCompare !== 0) return priorityCompare;
    const timeCompare = String(getEventStartTime(a) || "99:99").localeCompare(
      String(getEventStartTime(b) || "99:99"),
    );
    if (timeCompare !== 0) return timeCompare;
    const endCompare = String(a.endTime || "99:99").localeCompare(String(b.endTime || "99:99"));
    if (endCompare !== 0) return endCompare;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

async function writeEvents(events) {
  await ensureStore();
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, DATA_FILE);
}

function withEvents(mutator) {
  const next = mutationQueue.then(async () => {
    const events = await readEvents();
    const result = await mutator(events);
    await writeEvents(events);
    return result;
  });

  mutationQueue = next.catch(() => {});
  return next;
}

function normalizeStoredEvent(event) {
  const startTime = normalizeEventTimeSoft(event.startTime || event.time || "");
  const endTime = normalizeEventTimeSoft(event.endTime || "");
  return {
    ...event,
    date: String(event.date || ""),
    time: startTime,
    startTime,
    endTime,
    priority: normalizePriority(event.priority),
    title: String(event.title || ""),
    note: String(event.note || ""),
  };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanPayload(body) {
  const date = String(body.date || "").trim();
  const startTime = normalizeEventTime(body.startTime ?? body.time, "\u5f00\u59cb\u65f6\u95f4");
  const endTime = normalizeEventTime(body.endTime, "\u7ed3\u675f\u65f6\u95f4");
  const priority = normalizePriority(body.priority);
  const title = String(body.title || "").trim();
  const note = String(body.note || "").trim();

  if (!isIsoDate(date)) {
    const error = new Error("\u65e5\u671f\u683c\u5f0f\u5fc5\u987b\u662f YYYY-MM-DD");
    error.status = 400;
    throw error;
  }

  if (!title) {
    const error = new Error("\u8bf7\u586b\u5199\u8981\u505a\u7684\u4e8b\u60c5");
    error.status = 400;
    throw error;
  }

  if (startTime && endTime && toMinutes(endTime) <= toMinutes(startTime)) {
    const error = new Error("\u7ed3\u675f\u65f6\u95f4\u8981\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4");
    error.status = 400;
    throw error;
  }

  return {
    date,
    time: startTime,
    startTime,
    endTime,
    priority,
    title: title.slice(0, 80),
    note: note.slice(0, 500),
  };
}

function getEventStartTime(event) {
  return event.startTime || event.time || "";
}

function getPriorityRank(priority) {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.normal;
}

function normalizePriority(value) {
  const priority = String(value || "normal").trim();
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, priority) ? priority : "normal";
}

function normalizeEventTime(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
  const hour = match ? Number(match[1]) : Number.NaN;
  if (!match || hour > 23) {
    const error = new Error(`${label}\u683c\u5f0f\u5fc5\u987b\u662f HH:mm\uff0c\u4f8b\u5982 09:30`);
    error.status = 400;
    throw error;
  }

  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function normalizeEventTimeSoft(value) {
  try {
    return normalizeEventTime(value, "\u65f6\u95f4");
  } catch {
    return "";
  }
}

function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function sendSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function broadcastSync() {
  if (clients.size === 0) return;

  const events = await readEvents();
  const payload = {
    events,
    serverTime: new Date().toISOString(),
  };

  for (const client of clients) {
    sendSse(client, "sync", payload);
  }
}

function createApp(staticDir, port) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "128kb" }));
  app.use(express.static(staticDir));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      name: "Rli Calendar Sync",
      port,
      displayPort: DISPLAY_PORT,
      managePort: MANAGE_PORT,
      reminders: reminderService ? reminderService.getConfig() : { enabled: false },
      time: new Date().toISOString(),
    });
  });

  app.get("/api/reminders/status", (req, res) => {
    res.json({
      ok: true,
      reminders: reminderService ? reminderService.getConfig() : { enabled: false },
    });
  });

  app.get("/api/events", async (req, res, next) => {
    try {
      const events = await readEvents();
      const { start, end } = req.query;
      const filtered = events.filter((event) => {
        if (start && event.date < start) return false;
        if (end && event.date > end) return false;
        return true;
      });
      res.json({ events: filtered });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/events", async (req, res, next) => {
    try {
      const payload = cleanPayload(req.body || {});
      const now = new Date().toISOString();
      const event = {
        id: crypto.randomUUID(),
        ...payload,
        createdAt: now,
        updatedAt: now,
      };

      await withEvents((events) => {
        events.push(event);
      });

      await broadcastSync();
      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/events/:id", async (req, res, next) => {
    try {
      const payload = cleanPayload(req.body || {});
      const event = await withEvents((events) => {
        const item = events.find((candidate) => candidate.id === req.params.id);
        if (!item) {
          const error = new Error("\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u65e5\u7a0b");
          error.status = 404;
          throw error;
        }

        Object.assign(item, payload, { updatedAt: new Date().toISOString() });
        return item;
      });

      await broadcastSync();
      res.json({ event });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/events/:id", async (req, res, next) => {
    try {
      let removed = false;
      await withEvents((events) => {
        const index = events.findIndex((candidate) => candidate.id === req.params.id);
        if (index === -1) {
          const error = new Error("\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u65e5\u7a0b");
          error.status = 404;
          throw error;
        }

        events.splice(index, 1);
        removed = true;
      });

      await broadcastSync();
      res.json({ ok: removed });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stream", async (req, res, next) => {
    try {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      clients.add(res);
      sendSse(res, "ready", { ok: true });
      sendSse(res, "sync", {
        events: await readEvents(),
        serverTime: new Date().toISOString(),
      });

      const ping = setInterval(() => {
        sendSse(res, "ping", { time: new Date().toISOString() });
      }, 25000);

      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) {
      console.error(error);
    }
    res.status(status).json({
      error: error.message || "\u670d\u52a1\u5668\u9519\u8bef",
    });
  });

  return app;
}

function listen(app, port, name) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`${name} running at http://0.0.0.0:${port}`);
  });
}

ensureStore()
  .then(() => {
    reminderService = createReminderService({
      dataDir: DATA_DIR,
      readEvents,
    });
    reminderService.start().catch((error) => {
      console.error("Failed to start reminder service", error);
    });
    listen(createApp(PUBLIC_DIR, DISPLAY_PORT), DISPLAY_PORT, "Rli Calendar Display");
    if (MANAGE_PORT !== DISPLAY_PORT) {
      listen(createApp(MANAGE_DIR, MANAGE_PORT), MANAGE_PORT, "Rli Calendar Manage");
    }
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
