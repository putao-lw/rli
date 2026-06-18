const cors = require("cors");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 14785);
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const clients = new Set();
let mutationQueue = Promise.resolve();

app.use(cors());
app.use(express.json({ limit: "128kb" }));
app.use(express.static(PUBLIC_DIR));

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
  const events = JSON.parse(raw || "[]");
  if (!Array.isArray(events)) {
    return [];
  }

  return events.sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = String(a.time || "99:99").localeCompare(String(b.time || "99:99"));
    if (timeCompare !== 0) return timeCompare;
    return String(a.createdAt).localeCompare(String(b.createdAt));
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

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanPayload(body) {
  const date = String(body.date || "").trim();
  const time = normalizeEventTime(body.time);
  const title = String(body.title || "").trim();
  const note = String(body.note || "").trim();

  if (!isIsoDate(date)) {
    const error = new Error("日期格式必须是 YYYY-MM-DD");
    error.status = 400;
    throw error;
  }

  if (!title) {
    const error = new Error("请填写要做的事情");
    error.status = 400;
    throw error;
  }

  return {
    date,
    time,
    title: title.slice(0, 80),
    note: note.slice(0, 500),
  };
}

function normalizeEventTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
  const hour = match ? Number(match[1]) : Number.NaN;
  if (!match || hour > 23) {
    const error = new Error("时间格式必须是 HH:mm，例如 09:30");
    error.status = 400;
    throw error;
  }

  return `${String(hour).padStart(2, "0")}:${match[2]}`;
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

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "Rli Calendar Sync",
    port: PORT,
    time: new Date().toISOString(),
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
        const error = new Error("没有找到这个日程");
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
        const error = new Error("没有找到这个日程");
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
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({
    error: error.message || "服务器错误",
  });
});

ensureStore()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Rli Calendar Sync running at http://0.0.0.0:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
