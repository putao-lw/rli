const calendarEl = document.querySelector("#calendar");
const monthTitleEl = document.querySelector("#monthTitle");
const syncStatusEl = document.querySelector("#syncStatus");
const fullscreenButton = document.querySelector("#fullscreenButton");

let events = [];
let currentMonth = startOfMonth(new Date());
let selectedDate = toDateKey(new Date());
let stream;
let pageFullscreen = false;

document.querySelector("#prevMonth").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  render();
});

document.querySelector("#nextMonth").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  render();
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setPageFullscreen(false);
    } else if (pageFullscreen) {
      setPageFullscreen(false);
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      if (!document.fullscreenElement) {
        setPageFullscreen(true);
      }
    } else {
      setPageFullscreen(true);
    }
  } catch (error) {
    setPageFullscreen(true);
  }
});

document.addEventListener("fullscreenchange", updateFullscreenButton);

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setStatus(message, type) {
  syncStatusEl.textContent = message;
  syncStatusEl.className = `status ${type || ""}`.trim();
}

function updateFullscreenButton() {
  fullscreenButton.textContent = document.fullscreenElement || pageFullscreen
    ? "\u9000\u51fa\u5168\u5c4f"
    : "\u5168\u5c4f";
}

function setPageFullscreen(enabled) {
  pageFullscreen = enabled;
  document.body.classList.toggle("page-fullscreen", enabled);
  updateFullscreenButton();
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "\u8bf7\u6c42\u5931\u8d25");
  }
  return data;
}

async function loadEvents() {
  const data = await request("/api/events");
  events = data.events || [];
  render();
}

function connectStream() {
  if (stream) {
    stream.close();
  }

  stream = new EventSource("/api/stream");
  stream.addEventListener("ready", () => setStatus("\u5b9e\u65f6\u540c\u6b65\u5df2\u8fde\u63a5", "ok"));
  stream.addEventListener("sync", (message) => {
    const data = JSON.parse(message.data);
    events = data.events || [];
    setStatus("\u5df2\u540c\u6b65", "ok");
    render();
  });
  stream.onerror = () => {
    setStatus("\u540c\u6b65\u8fde\u63a5\u65ad\u5f00\uff0c\u6b63\u5728\u91cd\u8fde", "bad");
  };
}

function render() {
  monthTitleEl.textContent = `${currentMonth.getFullYear()}\u5e74 ${currentMonth.getMonth() + 1}\u6708`;
  renderCalendar();
}

function renderCalendar() {
  calendarEl.innerHTML = "";
  const firstDay = startOfMonth(currentMonth);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);

  const byDate = events.reduce((map, item) => {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
    return map;
  }, new Map());

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateKey(date);
    const dayEvents = byDate.get(dateKey) || [];
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "day",
      date.getMonth() === currentMonth.getMonth() ? "" : "outside",
      dateKey === toDateKey(new Date()) ? "today" : "",
      dateKey === selectedDate ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    button.innerHTML = `
      <span class="date-number">${date.getDate()}</span>
      <span class="badges">
        ${dayEvents
          .slice(0, 4)
          .map((item) => `<span class="badge">${escapeHtml(item.title)}</span>`)
          .join("")}
        ${dayEvents.length > 4 ? `<span class="more">\u8fd8\u6709 ${dayEvents.length - 4} \u6761</span>` : ""}
      </span>
    `;

    button.addEventListener("click", () => {
      selectedDate = dateKey;
      if (date.getMonth() !== currentMonth.getMonth()) {
        currentMonth = startOfMonth(date);
      }
      render();
    });

    calendarEl.appendChild(button);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadEvents()
  .then(() => connectStream())
  .catch((error) => setStatus(error.message, "bad"));
