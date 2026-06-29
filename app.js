const STORAGE_KEY = "dgsmart-timetable-hub-v2";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("dgsmart-timetable-hub") : null;
const sourceData = window.TIMETABLE_DATA || { teachers: [], schedules: [] };
const sheetWebAppUrl = window.TIMETABLE_CONFIG?.googleSheetWebAppUrl?.trim() || "";

const teachers = sourceData.teachers.map((teacher) => ({
  id: teacher.id,
  name: teacher.name,
  subject: teacher.subject || "교과",
}));

const days = [...new Set(sourceData.schedules.map((item) => item.day).filter(Boolean))];
const defaultDay = days[0] || "월";
const scheduleIndex = new Map(
  sourceData.schedules.map((item) => [`${item.teacherId}-${item.day}-${item.period}`, item]),
);

const initialState = {
  selectedDate: "2026-06-29",
  selectedDay: defaultDay,
  gradeFilter: "all",
  requests: [],
  activity: [
    {
      id: crypto.randomUUID(),
      text: `${sourceData.sourceFile || "엑셀 시간표"} 데이터를 불러왔습니다.`,
      at: Date.now(),
    },
  ],
};

let state = normalizeState(loadState());

const els = {
  selectedDate: document.querySelector("#selectedDate"),
  selectedDay: document.querySelector("#selectedDay"),
  fromTeacher: document.querySelector("#fromTeacher"),
  toTeacher: document.querySelector("#toTeacher"),
  period: document.querySelector("#period"),
  requestType: document.querySelector("#requestType"),
  reason: document.querySelector("#reason"),
  swapForm: document.querySelector("#swapForm"),
  scheduleBody: document.querySelector("#scheduleTable tbody"),
  requestColumns: document.querySelector("#requestColumns"),
  activityList: document.querySelector("#activityList"),
  pendingCount: document.querySelector("#pendingCount"),
  approvedCount: document.querySelector("#approvedCount"),
  coverageCount: document.querySelector("#coverageCount"),
  conflictCount: document.querySelector("#conflictCount"),
  syncStatus: document.querySelector("#syncStatus"),
  newRequestBtn: document.querySelector("#newRequestBtn"),
  resetDemoBtn: document.querySelector("#resetDemoBtn"),
};

hydrateControls();
render();

els.swapForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const request = {
    id: crypto.randomUUID(),
    type: els.requestType.value,
    status: "pending",
    fromTeacher: els.fromTeacher.value,
    toTeacher: els.toTeacher.value,
    day: state.selectedDay,
    period: Number(els.period.value),
    reason: els.reason.value.trim() || "사유 미입력",
    createdAt: Date.now(),
  };

  state.requests.unshift(request);
  pushActivity(`${teacherName(request.fromTeacher)} 교사가 ${teacherName(request.toTeacher)} 교사에게 ${request.day}요일 ${request.period}교시 ${typeLabel(request.type)}를 요청했습니다.`);
  els.reason.value = "";
  persistAndRender();
  appendRequestToGoogleSheet(request);
});

els.selectedDate.addEventListener("change", () => {
  state.selectedDate = els.selectedDate.value;
  pushActivity(`기준일이 ${state.selectedDate}로 변경되었습니다.`);
  persistAndRender();
});

els.selectedDay.addEventListener("change", () => {
  state.selectedDay = els.selectedDay.value;
  render();
});

els.newRequestBtn.addEventListener("click", () => {
  document.querySelector("#swapTitle").scrollIntoView({ behavior: "smooth", block: "center" });
  els.fromTeacher.focus();
});

els.resetDemoBtn.addEventListener("click", () => {
  state = structuredClone(initialState);
  persistAndRender();
});

document.querySelectorAll("[data-grade]").forEach((button) => {
  button.addEventListener("click", () => {
    state.gradeFilter = button.dataset.grade;
    document.querySelectorAll("[data-grade]").forEach((item) => item.classList.toggle("active", item === button));
    renderSchedule();
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
    const target = {
      board: ".schedule-panel",
      requests: ".request-board",
      coverage: ".right-rail",
      audit: "#activityTitle",
    }[button.dataset.view];
    document.querySelector(target).scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  state = normalizeState(JSON.parse(event.newValue));
  render();
  showSync("다른 탭 변경 반영됨");
});

if (channel) {
  channel.addEventListener("message", (event) => {
    if (event.data?.type !== "state:update") return;
    state = normalizeState(event.data.state);
    render();
    showSync("실시간 변경 반영됨");
  });
}

function hydrateControls() {
  els.selectedDate.value = state.selectedDate;

  for (const day of days) {
    els.selectedDay.append(new Option(`${day}요일`, day));
  }
  els.selectedDay.value = state.selectedDay;

  for (const teacher of teachers) {
    const label = `${teacher.name} (${teacher.subject})`;
    els.fromTeacher.append(new Option(label, teacher.id));
    els.toTeacher.append(new Option(label, teacher.id));
  }

  for (let period = 1; period <= 7; period += 1) {
    els.period.append(new Option(`${period}교시`, period));
  }

  if (teachers.length > 1) els.toTeacher.selectedIndex = 1;
}

function render() {
  els.selectedDate.value = state.selectedDate;
  els.selectedDay.value = state.selectedDay;
  document.querySelectorAll("[data-grade]").forEach((item) => {
    item.classList.toggle("active", item.dataset.grade === state.gradeFilter);
  });
  renderSchedule();
  renderRequests();
  renderActivity();
  renderMetrics();
}

function renderSchedule() {
  els.scheduleBody.replaceChildren();
  const approved = state.requests.filter((request) => request.status === "approved" && request.day === state.selectedDay);
  const conflicts = detectConflicts(approved);

  for (const teacher of teachers) {
    const row = document.createElement("tr");
    const teacherCell = document.createElement("th");
    teacherCell.scope = "row";
    teacherCell.className = "teacher-cell";
    teacherCell.append(makeText("strong", teacher.name), makeText("span", teacher.subject));
    row.append(teacherCell);

    for (let period = 1; period <= 7; period += 1) {
      const cell = document.createElement("td");
      const lesson = buildLesson(teacher.id, period, approved);
      const isHidden = state.gradeFilter !== "all" && lesson.className && !lesson.className.startsWith(`${state.gradeFilter}-`);
      const div = document.createElement("div");
      div.className = `lesson ${lesson.status}`;
      if (conflicts.has(`${teacher.id}-${state.selectedDay}-${period}`)) div.classList.add("conflict");
      if (isHidden) div.style.opacity = "0.25";
      div.append(makeText("strong", lesson.title), makeText("span", `${lesson.className || "배정 가능"} · ${lesson.note}`));
      cell.append(div);
      row.append(cell);
    }

    els.scheduleBody.append(row);
  }
}

function renderRequests() {
  const groups = [
    ["pending", "대기"],
    ["approved", "승인"],
    ["rejected", "반려"],
  ];
  els.requestColumns.replaceChildren();

  for (const [status, label] of groups) {
    const column = document.createElement("section");
    column.className = "request-column";
    column.append(makeText("h3", label));
    const cards = state.requests.filter((request) => request.status === status);
    if (!cards.length) {
      const empty = makeText("p", "처리할 요청이 없습니다.");
      empty.className = "request-meta";
      column.append(empty);
    }
    for (const request of cards) {
      column.append(createRequestCard(request));
    }
    els.requestColumns.append(column);
  }
}

function createRequestCard(request) {
  const template = document.querySelector("#requestCardTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  card.querySelector("strong").textContent = `${teacherName(request.fromTeacher)} → ${teacherName(request.toTeacher)}`;
  card.querySelector(".request-top span").textContent = typeLabel(request.type);
  card.querySelector("p").textContent = request.reason;
  card.querySelector(".request-meta").textContent = `${request.day}요일 ${request.period}교시 · ${relativeTime(request.createdAt)}`;
  const actions = card.querySelector(".request-actions");

  if (request.status === "pending") {
    const approve = makeAction("승인", "approve", () => updateRequest(request.id, "approved"));
    const reject = makeAction("반려", "reject", () => updateRequest(request.id, "rejected"));
    actions.append(approve, reject);
  } else {
    actions.append(makeAction("대기로 이동", "", () => updateRequest(request.id, "pending")));
  }

  return card;
}

function renderActivity() {
  els.activityList.replaceChildren();
  for (const item of state.activity.slice(0, 6)) {
    const li = document.createElement("li");
    li.append(makeText("strong", item.text), makeText("span", relativeTime(item.at)));
    els.activityList.append(li);
  }
}

function renderMetrics() {
  const dayRequests = state.requests.filter((request) => request.day === state.selectedDay);
  const approved = dayRequests.filter((request) => request.status === "approved");
  els.pendingCount.textContent = dayRequests.filter((request) => request.status === "pending").length;
  els.approvedCount.textContent = approved.length;
  els.coverageCount.textContent = dayRequests.filter((request) => request.type === "coverage" && request.status !== "approved").length;
  els.conflictCount.textContent = detectConflicts(approved).size;
}

function buildLesson(teacherId, period, approved) {
  const base = getBaseLesson(teacherId, state.selectedDay, period);
  const related = approved.find((request) => request.period === period && (request.fromTeacher === teacherId || request.toTeacher === teacherId));

  if (!related) return base;

  if (related.toTeacher === teacherId) {
    const fromBase = getBaseLesson(related.fromTeacher, state.selectedDay, period);
    return {
      title: related.type === "coverage" ? `${fromBase.title} 보강` : `${fromBase.title} 교체`,
      className: fromBase.className,
      note: `${teacherName(related.fromTeacher)} 요청 승인`,
      status: "changed",
    };
  }

  return {
    title: related.type === "coverage" ? "보강 배정됨" : "교체 승인됨",
    className: base.className,
    note: `${teacherName(related.toTeacher)} 담당`,
    status: "changed",
  };
}

function getBaseLesson(teacherId, day, period) {
  const item = scheduleIndex.get(`${teacherId}-${day}-${period}`);
  if (!item) {
    return {
      title: "공강",
      className: "",
      note: "보강 후보",
      status: "open",
    };
  }
  return {
    title: item.raw,
    className: item.className,
    note: "정규 배정",
    status: "",
  };
}

function detectConflicts(approved) {
  const busy = new Map();
  const conflicts = new Set();
  for (const request of approved) {
    const key = `${request.toTeacher}-${request.day}-${request.period}`;
    if (scheduleIndex.has(key) || busy.has(key)) conflicts.add(key);
    busy.set(key, true);
  }
  return conflicts;
}

function updateRequest(id, status) {
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  request.status = status;
  const statusText = { approved: "승인", rejected: "반려", pending: "대기 전환" }[status];
  pushActivity(`${teacherName(request.fromTeacher)} → ${teacherName(request.toTeacher)} ${request.day}요일 ${request.period}교시 요청이 ${statusText}되었습니다.`);
  persistAndRender();
}

function pushActivity(text) {
  state.activity.unshift({
    id: crypto.randomUUID(),
    text,
    at: Date.now(),
  });
  state.activity = state.activity.slice(0, 30);
}

async function appendRequestToGoogleSheet(request) {
  if (!sheetWebAppUrl) {
    showSync("구글 시트 URL 미설정");
    return;
  }

  const baseLesson = getBaseLesson(request.fromTeacher, request.day, request.period);
  const payload = {
    requestId: request.id,
    requestDate: state.selectedDate,
    day: request.day,
    period: request.period,
    type: request.type,
    typeLabel: typeLabel(request.type),
    status: request.status,
    fromTeacher: teacherName(request.fromTeacher),
    fromSubject: teacherSubject(request.fromTeacher),
    toTeacher: teacherName(request.toTeacher),
    toSubject: teacherSubject(request.toTeacher),
    originalClass: baseLesson.className,
    originalLesson: baseLesson.title,
    reason: request.reason,
    createdAt: new Date(request.createdAt).toISOString(),
    userAgent: navigator.userAgent,
  };

  try {
    await fetch(sheetWebAppUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    pushActivity("구글 시트로 요청 데이터 전송을 시도했습니다.");
    persistAndRender();
  } catch (error) {
    pushActivity("구글 시트 전송에 실패했습니다. 로컬에는 저장되어 있습니다.");
    persistAndRender();
  }
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  channel?.postMessage({ type: "state:update", state });
  render();
  showSync("변경 사항 저장됨");
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(initialState);
  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(initialState);
  }
}

function normalizeState(nextState) {
  return {
    ...structuredClone(initialState),
    ...nextState,
    selectedDay: days.includes(nextState?.selectedDay) ? nextState.selectedDay : defaultDay,
    requests: Array.isArray(nextState?.requests) ? nextState.requests : [],
    activity: Array.isArray(nextState?.activity) ? nextState.activity : initialState.activity,
  };
}

function teacherName(id) {
  return teachers.find((teacher) => teacher.id === id)?.name ?? "알 수 없음";
}

function teacherSubject(id) {
  return teachers.find((teacher) => teacher.id === id)?.subject ?? "";
}

function typeLabel(type) {
  return type === "coverage" ? "보강" : "교체";
}

function relativeTime(timestamp) {
  const diff = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diff < 60) return `${diff}분 전`;
  const hours = Math.round(diff / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function showSync(message) {
  els.syncStatus.textContent = message;
  window.clearTimeout(showSync.timer);
  showSync.timer = window.setTimeout(() => {
    els.syncStatus.textContent = "이 브라우저에서 활성";
  }, 2200);
}

function makeText(tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function makeAction(text, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener("click", handler);
  return button;
}
