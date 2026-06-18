const calendarEl = document.querySelector("#calendar");
const monthTitleEl = document.querySelector("#monthTitle");
const selectedDateTitleEl = document.querySelector("#selectedDateTitle");
const taskListEl = document.querySelector("#taskList");
const syncStatusEl = document.querySelector("#syncStatus");
const quickForm = document.querySelector("#quickForm");
const taskTitle = document.querySelector("#taskTitle");
const taskNote = document.querySelector("#taskNote");

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

let events = [];
let currentMonth = startOfMonth(new Date());
let selectedDate = toDateKey(new Date());
let stream;

document.querySelector("#prevMonth").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  render();
});

document.querySelector("#nextMonth").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  render();
});

quickForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskTitle.value.trim();
  const note = taskNote.value.trim();
  if (!title) return;

  try {
    await request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, title, note }),
    });
    taskTitle.value = "";
    taskNote.value = "";
    await loadEvents();
  } catch (error) {
    setStatus(error.message, "bad");
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

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function setStatus(message, type) {
  syncStatusEl.textContent = message;
  syncStatusEl.className = `status ${type || ""}`.trim();
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
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
  stream.addEventListener("ready", () => setStatus("实时同步已连接", "ok"));
  stream.addEventListener("sync", (message) => {
    const data = JSON.parse(message.data);
    events = data.events || [];
    setStatus("已同步", "ok");
    render();
  });
  stream.onerror = () => {
    setStatus("同步连接断开，正在重连", "bad");
  };
}

function render() {
  monthTitleEl.textContent = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;
  selectedDateTitleEl.textContent = dayFormatter.format(fromDateKey(selectedDate));
  renderCalendar();
  renderTaskList();
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
          .slice(0, 3)
          .map((item) => `<span class="badge">${escapeHtml(item.title)}</span>`)
          .join("")}
        ${dayEvents.length > 3 ? `<span class="more">还有 ${dayEvents.length - 3} 条</span>` : ""}
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

function renderTaskList() {
  const selectedEvents = events.filter((item) => item.date === selectedDate);
  if (selectedEvents.length === 0) {
    taskListEl.innerHTML = `<div class="empty">这一天还没有登记事情。</div>`;
    return;
  }

  taskListEl.innerHTML = selectedEvents
    .map(
      (item) => `
        <article class="task">
          <strong>${escapeHtml(item.title)}</strong>
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
          <button type="button" data-delete="${item.id}">删除</button>
        </article>
      `,
    )
    .join("");

  taskListEl.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(`/api/events/${button.dataset.delete}`, { method: "DELETE" });
        await loadEvents();
      } catch (error) {
        setStatus(error.message, "bad");
      }
    });
  });
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
