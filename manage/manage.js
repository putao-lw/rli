const statusEl = document.querySelector("#status");
const formEl = document.querySelector("#eventForm");
const dateInput = document.querySelector("#dateInput");
const startTimeInput = document.querySelector("#startTimeInput");
const endTimeInput = document.querySelector("#endTimeInput");
const priorityInput = document.querySelector("#priorityInput");
const titleInput = document.querySelector("#titleInput");
const noteInput = document.querySelector("#noteInput");
const selectedTitleEl = document.querySelector("#selectedTitle");
const refreshButton = document.querySelector("#refreshButton");
const eventListEl = document.querySelector("#eventList");

const PRIORITIES = {
  urgent: { className: "priority-urgent", rank: 0 },
  high: { className: "priority-high", rank: 1 },
  normal: { className: "priority-normal", rank: 2 },
  low: { className: "priority-low", rank: 3 },
};

let events = [];
let stream;

dateInput.value = toDateKey(new Date());

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveEvent();
});

dateInput.addEventListener("change", renderEvents);
refreshButton.addEventListener("click", loadEvents);

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ""}`.trim();
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "\u8bf7\u6c42\u5931\u8d25");
  }
  return data;
}

async function checkServer() {
  try {
    const health = await request("/api/health");
    setStatus(`\u5df2\u8fde\u63a5 :${health.port}`, "ok");
  } catch (error) {
    setStatus("\u8fde\u63a5\u5931\u8d25", "bad");
  }
}

async function loadEvents() {
  try {
    const data = await request("/api/events");
    events = data.events || [];
    renderEvents();
    setStatus("\u5df2\u540c\u6b65", "ok");
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function connectStream() {
  if (stream) stream.close();
  stream = new EventSource("/api/stream");
  stream.addEventListener("ready", () => setStatus("\u5b9e\u65f6\u540c\u6b65\u5df2\u8fde\u63a5", "ok"));
  stream.addEventListener("sync", (message) => {
    const data = JSON.parse(message.data);
    events = data.events || [];
    renderEvents();
    setStatus("\u5df2\u540c\u6b65", "ok");
  });
  stream.onerror = () => setStatus("\u540c\u6b65\u65ad\u5f00\uff0c\u6b63\u5728\u91cd\u8fde", "bad");
}

async function saveEvent() {
  const body = {
    date: dateInput.value,
    startTime: startTimeInput.value,
    endTime: endTimeInput.value,
    priority: priorityInput.value,
    title: titleInput.value.trim(),
    note: noteInput.value.trim(),
  };

  if (!body.title) {
    setStatus("\u8bf7\u586b\u5199\u8981\u505a\u7684\u4e8b\u60c5", "bad");
    return;
  }

  if (body.startTime && body.endTime && body.endTime <= body.startTime) {
    setStatus("\u7ed3\u675f\u65f6\u95f4\u8981\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4", "bad");
    return;
  }

  try {
    await request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    titleInput.value = "";
    startTimeInput.value = "";
    endTimeInput.value = "";
    priorityInput.value = "normal";
    noteInput.value = "";
    setStatus("\u5df2\u6dfb\u52a0", "ok");
    await loadEvents();
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

async function deleteEvent(id) {
  try {
    await request(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    setStatus("\u5df2\u53d6\u6d88", "ok");
    await loadEvents();
  } catch (error) {
    setStatus(error.message, "bad");
  }
}

function renderEvents() {
  const date = dateInput.value || toDateKey(new Date());
  selectedTitleEl.textContent = formatDateTitle(date);
  const selectedEvents = sortEventsForDisplay(events.filter((item) => item.date === date));

  if (!selectedEvents.length) {
    eventListEl.innerHTML = `<div class="empty">\u8fd9\u4e00\u5929\u8fd8\u6ca1\u6709\u767b\u8bb0\u4e8b\u60c5\u3002</div>`;
    return;
  }

  eventListEl.innerHTML = selectedEvents
    .map((item) => {
      const priority = getPriority(item);
      const expired = isEventExpired(item, new Date());
      return `
        <article class="event-card ${priority.className} ${expired ? "is-expired" : ""}">
          <div class="event-top">
            <div>
              <p class="event-time">${escapeHtml(formatEventTimeRange(item) || "\u5168\u5929")}</p>
              <h3 class="event-title">${escapeHtml(item.title || "")}</h3>
            </div>
            ${expired ? `<span class="event-state">\u5df2\u8fc7</span>` : ""}
          </div>
          ${item.note ? `<p class="event-note">${escapeHtml(item.note)}</p>` : ""}
          <button class="delete-button" type="button" data-id="${escapeHtml(item.id)}">\u53d6\u6d88\u8fd9\u4ef6\u4e8b</button>
        </article>
      `;
    })
    .join("");

  eventListEl.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => deleteEvent(button.dataset.id));
  });
}

function sortEventsForDisplay(items) {
  return [...items].sort((a, b) => {
    const priorityCompare = getPriority(a).rank - getPriority(b).rank;
    if (priorityCompare !== 0) return priorityCompare;
    const timeCompare = String(getEventStartTime(a) || "99:99").localeCompare(
      String(getEventStartTime(b) || "99:99"),
    );
    if (timeCompare !== 0) return timeCompare;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

function getPriority(item) {
  return PRIORITIES[item.priority] || PRIORITIES.normal;
}

function getEventStartTime(item) {
  return item.startTime || item.time || "";
}

function getEventEndTime(item) {
  return item.endTime || "";
}

function formatEventTimeRange(item) {
  const startTime = getEventStartTime(item);
  const endTime = getEventEndTime(item);
  if (startTime && endTime) return `${startTime}-${endTime}`;
  if (startTime) return startTime;
  if (endTime) return `\u81f3 ${endTime}`;
  return "";
}

function isEventExpired(item, now) {
  const endDate = getEventEndDate(item);
  return endDate ? endDate.getTime() < now.getTime() : false;
}

function getEventEndDate(item) {
  if (!item.date) return null;
  const [year, month, day] = String(item.date).split("-").map(Number);
  if (!year || !month || !day) return null;
  const endTime = getEventEndTime(item) || getEventStartTime(item) || "23:59";
  const [hour, minute] = endTime.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(year, month - 1, day, hour, minute, 59, 999);
}

function formatDateTitle(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(year, month - 1, day));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

checkServer();
loadEvents().then(() => connectStream());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
