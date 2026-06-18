const calendarEl = document.querySelector("#calendar");
const monthTitleEl = document.querySelector("#monthTitle");
const syncStatusEl = document.querySelector("#syncStatus");
const fullscreenButton = document.querySelector("#fullscreenButton");
const dayDialog = document.querySelector("#dayDialog");
const dialogBackdrop = document.querySelector("#dialogBackdrop");
const dialogClose = document.querySelector("#dialogClose");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogMeta = document.querySelector("#dialogMeta");
const dialogEvents = document.querySelector("#dialogEvents");

const chineseCalendarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
  month: "long",
  day: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const SOLAR_HOLIDAYS = {
  "01-01": "\u5143\u65e6",
  "05-01": "\u52b3\u52a8\u8282",
  "06-01": "\u513f\u7ae5\u8282",
  "10-01": "\u56fd\u5e86\u8282",
};

const LUNAR_HOLIDAYS = {
  "\u6b63\u6708\u521d\u4e00": "\u6625\u8282",
  "\u6b63\u6708\u5341\u4e94": "\u5143\u5bb5\u8282",
  "\u4e8c\u6708\u521d\u4e8c": "\u9f99\u62ac\u5934",
  "\u4e94\u6708\u521d\u4e94": "\u7aef\u5348\u8282",
  "\u4e03\u6708\u521d\u4e03": "\u4e03\u5915",
  "\u516b\u6708\u5341\u4e94": "\u4e2d\u79cb\u8282",
  "\u4e5d\u6708\u521d\u4e5d": "\u91cd\u9633\u8282",
  "\u814a\u6708\u521d\u516b": "\u814a\u516b\u8282",
  "\u814a\u6708\u5eff\u4e09": "\u5c0f\u5e74",
};

const LUNAR_DAY_NAMES = [
  "",
  "\u521d\u4e00",
  "\u521d\u4e8c",
  "\u521d\u4e09",
  "\u521d\u56db",
  "\u521d\u4e94",
  "\u521d\u516d",
  "\u521d\u4e03",
  "\u521d\u516b",
  "\u521d\u4e5d",
  "\u521d\u5341",
  "\u5341\u4e00",
  "\u5341\u4e8c",
  "\u5341\u4e09",
  "\u5341\u56db",
  "\u5341\u4e94",
  "\u5341\u516d",
  "\u5341\u4e03",
  "\u5341\u516b",
  "\u5341\u4e5d",
  "\u4e8c\u5341",
  "\u5eff\u4e00",
  "\u5eff\u4e8c",
  "\u5eff\u4e09",
  "\u5eff\u56db",
  "\u5eff\u4e94",
  "\u5eff\u516d",
  "\u5eff\u4e03",
  "\u5eff\u516b",
  "\u5eff\u4e5d",
  "\u4e09\u5341",
];

const MAX_PREVIEW_EVENTS = 3;

const PRIORITIES = {
  urgent: { label: "\u7d27\u6025", className: "priority-urgent" },
  high: { label: "\u91cd\u8981", className: "priority-high" },
  normal: { label: "\u666e\u901a", className: "priority-normal" },
  low: { label: "\u4e0d\u6025", className: "priority-low" },
};

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
dialogBackdrop.addEventListener("click", closeDayDialog);
dialogClose.addEventListener("click", closeDayDialog);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dayDialog.classList.contains("open")) {
    closeDayDialog();
  }
});

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
  if (dayDialog.classList.contains("open")) {
    renderDayDialog(selectedDate);
  }
}

function renderCalendar() {
  calendarEl.innerHTML = "";
  const firstDay = startOfMonth(currentMonth);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();

  const byDate = events.reduce((map, item) => {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
    return map;
  }, new Map());

  for (let index = 0; index < mondayOffset; index += 1) {
    appendEmptyDay();
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateKey = toDateKey(date);
    const dayEvents = byDate.get(dateKey) || [];
    const previewEvents = dayEvents.slice(0, MAX_PREVIEW_EVENTS);
    const dayMeta = getDayMeta(date);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.date = dateKey;
    button.className = [
      "day",
      date.getMonth() === currentMonth.getMonth() ? "" : "outside",
      dateKey === toDateKey(new Date()) ? "today" : "",
      dateKey === selectedDate ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    button.innerHTML = `
      <span class="day-head">
        <span class="date-number">${date.getDate()}</span>
        <span class="day-meta">
          ${dayMeta.holiday ? `<span class="holiday">${escapeHtml(dayMeta.holiday)}</span>` : ""}
          <span class="lunar">${escapeHtml(dayMeta.lunar)}</span>
        </span>
      </span>
      <span class="badges">
        ${previewEvents
          .map(
            (item, itemIndex) => `
              <span class="event-line ${getPriority(item).className}">
                <span class="event-index">${itemIndex + 1}</span>
                <span class="priority-chip">${getPriority(item).label}</span>
                <span class="event-text">${escapeHtml(formatEventTitle(item))}</span>
              </span>
            `,
          )
          .join("")}
        ${
          dayEvents.length > MAX_PREVIEW_EVENTS
            ? `<span class="event-more">\u5171 ${dayEvents.length} \u4ef6\uff0c\u70b9\u5f00\u770b\u5168\u90e8</span>`
            : ""
        }
      </span>
    `;

    button.addEventListener("click", () => {
      selectedDate = dateKey;
      render();
      openDayDialog(dateKey);
    });

    calendarEl.appendChild(button);
  }

  const filledCells = mondayOffset + daysInMonth;
  for (let index = filledCells; index < 42; index += 1) {
    appendEmptyDay();
  }
}

function appendEmptyDay() {
  const cell = document.createElement("div");
  cell.className = "day placeholder";
  cell.setAttribute("aria-hidden", "true");
  calendarEl.appendChild(cell);
}

function formatEventTitle(item) {
  return item.time ? `${item.time} ${item.title}` : item.title;
}

function getPriority(item) {
  return PRIORITIES[item.priority] || PRIORITIES.normal;
}

function openDayDialog(dateKey) {
  renderDayDialog(dateKey);
  dayDialog.classList.add("open");
  dayDialog.setAttribute("aria-hidden", "false");
}

function renderDayDialog(dateKey) {
  const date = fromDateKey(dateKey);
  const dayMeta = getDayMeta(date);
  const dayEvents = events.filter((item) => item.date === dateKey);

  dialogTitle.textContent = fullDateFormatter.format(date);
  dialogMeta.textContent = [dayMeta.holiday, dayMeta.lunar].filter(Boolean).join(" · ");
  dialogEvents.innerHTML =
    dayEvents.length > 0
      ? dayEvents
          .map(
            (item, index) => `
              <article class="dialog-event">
                <span class="dialog-event-index ${getPriority(item).className}">${index + 1}</span>
                <div>
                  <span class="dialog-priority ${getPriority(item).className}">${getPriority(item).label}</span>
                  <strong>${escapeHtml(formatEventTitle(item))}</strong>
                  ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
                </div>
              </article>
            `,
          )
          .join("")
      : `<div class="dialog-empty">\u8fd9\u4e00\u5929\u8fd8\u6ca1\u6709\u767b\u8bb0\u4e8b\u60c5\u3002</div>`;
}

function closeDayDialog() {
  dayDialog.classList.remove("open");
  dayDialog.setAttribute("aria-hidden", "true");
}

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDayMeta(date) {
  const lunar = getLunarText(date);
  const solarHoliday = SOLAR_HOLIDAYS[toDateKey(date).slice(5)] || "";
  const lunarHoliday = LUNAR_HOLIDAYS[lunar.key] || "";
  const holiday = getQingmingName(date) || getNewYearEveName(date) || solarHoliday || lunarHoliday;
  return {
    lunar: holiday ? lunar.text : `\u519c\u5386${lunar.text}`,
    holiday,
  };
}

function getLunarText(date) {
  const raw = chineseCalendarFormatter.format(date);
  const match = /^(.+?)(\d+)\u65e5$/.exec(raw);
  if (!match) {
    return { text: raw, key: raw };
  }

  const month = match[1];
  const day = LUNAR_DAY_NAMES[Number(match[2])] || `${match[2]}\u65e5`;
  const text = `${month}${day}`;
  return { text, key: text };
}

function getQingmingName(date) {
  return date.getMonth() === 3 && date.getDate() === getQingmingDay(date.getFullYear())
    ? "\u6e05\u660e\u8282"
    : "";
}

function getQingmingDay(year) {
  const shortYear = year % 100;
  return Math.floor(shortYear * 0.2422 + 4.81) - Math.floor((shortYear - 1) / 4);
}

function getNewYearEveName(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return getLunarText(tomorrow).key === "\u6b63\u6708\u521d\u4e00" ? "\u9664\u5915" : "";
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
