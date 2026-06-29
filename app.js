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
  activity: [],
  planner: {
    entries: [],
  },
};

let state = normalizeState(loadState());
let nextSchedulePick = "from";

const els = {
  selectedDate: document.querySelector("#selectedDate"),
  selectedDay: document.querySelector("#selectedDay"),
  fromTeacher: document.querySelector("#fromTeacher"),
  toTeacher: document.querySelector("#toTeacher"),
  fromDay: document.querySelector("#fromDay"),
  fromPeriod: document.querySelector("#fromPeriod"),
  toDay: document.querySelector("#toDay"),
  toPeriod: document.querySelector("#toPeriod"),
  fromLessonPreview: document.querySelector("#fromLessonPreview"),
  toLessonPreview: document.querySelector("#toLessonPreview"),
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
  plannerForm: document.querySelector("#plannerForm"),
  plannerTeacher: document.querySelector("#plannerTeacher"),
  plannerDay: document.querySelector("#plannerDay"),
  plannerPeriod: document.querySelector("#plannerPeriod"),
  plannerClass: document.querySelector("#plannerClass"),
  plannerSubject: document.querySelector("#plannerSubject"),
  plannerLesson: document.querySelector("#plannerLesson"),
  plannerTableBody: document.querySelector("#plannerTable tbody"),
  plannerEntryCount: document.querySelector("#plannerEntryCount"),
  plannerConflictCount: document.querySelector("#plannerConflictCount"),
  plannerExportBtn: document.querySelector("#plannerExportBtn"),
  plannerResetBtn: document.querySelector("#plannerResetBtn"),
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
    day: els.fromDay.value,
    period: Number(els.fromPeriod.value),
    fromDay: els.fromDay.value,
    fromPeriod: Number(els.fromPeriod.value),
    toDay: els.toDay.value,
    toPeriod: Number(els.toPeriod.value),
    requestDate: state.selectedDate,
    reason: els.reason.value.trim() || "사유 미입력",
    createdAt: Date.now(),
  };

  state.requests.unshift(request);
  pushActivity(`${teacherName(request.fromTeacher)} ${request.fromDay}요일 ${request.fromPeriod}교시 → ${teacherName(request.toTeacher)} ${request.toDay}요일 ${request.toPeriod}교시 ${typeLabel(request.type)}를 요청했습니다.`);
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

[els.fromTeacher, els.fromDay, els.fromPeriod].forEach((element) => {
  element.addEventListener("change", () => {
    renderLessonPreview("from");
    renderSchedule();
  });
});

[els.toTeacher, els.toDay, els.toPeriod].forEach((element) => {
  element.addEventListener("change", () => {
    renderLessonPreview("to");
    renderSchedule();
  });
});

els.newRequestBtn.addEventListener("click", () => {
  document.querySelector("#swapTitle").scrollIntoView({ behavior: "smooth", block: "center" });
  els.fromTeacher.focus();
});

els.resetDemoBtn.addEventListener("click", () => {
  state = structuredClone(initialState);
  persistAndRender();
});

els.plannerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.planner.entries.unshift({
    id: crypto.randomUUID(),
    teacherId: els.plannerTeacher.value,
    day: els.plannerDay.value,
    period: Number(els.plannerPeriod.value),
    className: els.plannerClass.value.trim(),
    subjectName: els.plannerSubject.value.trim(),
    lessonName: els.plannerLesson.value.trim(),
    createdAt: Date.now(),
  });
  els.plannerSubject.value = "";
  els.plannerLesson.value = "";
  persistAndRender();
  showSync("2학기 시간표 배치 추가됨");
});

els.plannerResetBtn.addEventListener("click", () => {
  if (!confirm("2학기 설계 데이터를 모두 삭제할까요?")) return;
  state.planner.entries = [];
  persistAndRender();
});

els.plannerExportBtn.addEventListener("click", exportPlannerCsv);

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
      planner: "#plannerTitle",
    }[button.dataset.view];
    document.querySelector(target).scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll("[data-metric]").forEach((metric) => {
  metric.addEventListener("click", () => handleMetricAction(metric.dataset.metric));
  metric.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleMetricAction(metric.dataset.metric);
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
    els.fromDay.append(new Option(`${day}요일`, day));
    els.toDay.append(new Option(`${day}요일`, day));
    els.plannerDay.append(new Option(`${day}요일`, day));
  }
  els.selectedDay.value = state.selectedDay;
  els.fromDay.value = state.selectedDay;
  els.toDay.value = state.selectedDay;

  for (const teacher of teachers) {
    const label = `${teacher.name} (${teacher.subject})`;
    els.fromTeacher.append(new Option(label, teacher.id));
    els.toTeacher.append(new Option(label, teacher.id));
    els.plannerTeacher.append(new Option(label, teacher.id));
  }

  for (let period = 1; period <= 7; period += 1) {
    els.fromPeriod.append(new Option(`${period}교시`, period));
    els.toPeriod.append(new Option(`${period}교시`, period));
    els.plannerPeriod.append(new Option(`${period}교시`, period));
  }

  if (teachers.length > 1) els.toTeacher.selectedIndex = 1;
  els.plannerDay.value = state.selectedDay;
  renderLessonPreview("from");
  renderLessonPreview("to");
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
  renderPlanner();
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
      div.tabIndex = 0;
      div.role = "button";
      div.title = `${teacher.name} ${state.selectedDay}요일 ${period}교시를 신청서에 입력`;
      div.dataset.teacherId = teacher.id;
      div.dataset.day = state.selectedDay;
      div.dataset.period = String(period);
      div.addEventListener("click", () => selectScheduleSlot(teacher.id, state.selectedDay, period));
      div.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectScheduleSlot(teacher.id, state.selectedDay, period);
      });
      if (conflicts.has(`${teacher.id}-${state.selectedDay}-${period}`)) div.classList.add("conflict");
      if (isSelectedScheduleSlot("from", teacher.id, state.selectedDay, period)) div.classList.add("selected-from");
      if (isSelectedScheduleSlot("to", teacher.id, state.selectedDay, period)) div.classList.add("selected-to");
      if (isHidden) div.style.opacity = "0.25";
      div.append(makeText("strong", lesson.title), makeText("span", `${lesson.className || "배정 가능"} · ${lesson.note}`));
      cell.append(div);
      row.append(cell);
    }

    els.scheduleBody.append(row);
  }
}

function selectScheduleSlot(teacherId, day, period) {
  const target = nextSchedulePick;
  setRequestSlot(target, teacherId, day, period);
  nextSchedulePick = target === "from" ? "to" : "from";
  renderSchedule();
  document.querySelector("#swapTitle").scrollIntoView({ behavior: "smooth", block: "center" });
  showSync(target === "from" ? "요청 수업 자동 입력됨" : "교체 받을 수업 자동 입력됨");
}

function setRequestSlot(kind, teacherId, day, period) {
  const isFrom = kind === "from";
  const teacher = isFrom ? els.fromTeacher : els.toTeacher;
  const daySelect = isFrom ? els.fromDay : els.toDay;
  const periodSelect = isFrom ? els.fromPeriod : els.toPeriod;

  teacher.value = teacherId;
  daySelect.value = day;
  periodSelect.value = String(period);
  renderLessonPreview(kind);
}

function isSelectedScheduleSlot(kind, teacherId, day, period) {
  const isFrom = kind === "from";
  const selectedTeacher = isFrom ? els.fromTeacher.value : els.toTeacher.value;
  const selectedDay = isFrom ? els.fromDay.value : els.toDay.value;
  const selectedPeriod = Number(isFrom ? els.fromPeriod.value : els.toPeriod.value);
  return selectedTeacher === teacherId && selectedDay === day && selectedPeriod === period;
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
    column.dataset.status = status;
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
  card.dataset.status = request.status;
  card.dataset.requestType = request.type;
  card.querySelector("strong").textContent = `${teacherName(request.fromTeacher)} → ${teacherName(request.toTeacher)}`;
  card.querySelector(".request-top span").textContent = typeLabel(request.type);
  card.querySelector("p").textContent = request.reason;
  card.querySelector(".request-meta").textContent = requestTimeLabel(request) + ` · ${relativeTime(request.createdAt)}`;
  const actions = card.querySelector(".request-actions");

  if (request.status === "pending") {
    const approve = makeAction("승인", "approve", () => updateRequest(request.id, "approved"));
    const reject = makeAction("반려", "reject", () => updateRequest(request.id, "rejected"));
    actions.append(approve, reject);
  } else {
    actions.append(makeAction("대기로 이동", "", () => updateRequest(request.id, "pending")));
  }
  actions.append(makeAction("신청서 인쇄", "print", () => openPrintApplication(request)));

  return card;
}

function renderActivity() {
  els.activityList.replaceChildren();
  for (const item of state.activity.filter((entry) => !isDataLoadActivity(entry)).slice(0, 6)) {
    const li = document.createElement("li");
    li.append(makeText("strong", item.text), makeText("span", relativeTime(item.at)));
    els.activityList.append(li);
  }
}

function renderLessonPreview(kind) {
  const isFrom = kind === "from";
  const teacherId = isFrom ? els.fromTeacher.value : els.toTeacher.value;
  const day = isFrom ? els.fromDay.value : els.toDay.value;
  const period = Number(isFrom ? els.fromPeriod.value : els.toPeriod.value);
  const target = isFrom ? els.fromLessonPreview : els.toLessonPreview;
  const lesson = getBaseLesson(teacherId, day, period);
  const teacher = teachers.find((item) => item.id === teacherId);
  const subject = teacher?.subject || "교과";
  const title = lesson.status === "open" ? `${subject} · 공강` : `${subject} · ${lesson.title}`;
  const meta = lesson.className ? `${day}요일 ${period}교시 · ${lesson.className}` : `${day}요일 ${period}교시`;

  target.classList.toggle("open", lesson.status === "open");
  target.classList.toggle("busy", lesson.status !== "open");
  target.innerHTML = `<strong>${title}</strong><span>${meta}</span>`;
}

function renderMetrics() {
  const dayRequests = state.requests.filter((request) => request.day === state.selectedDay);
  const approved = dayRequests.filter((request) => request.status === "approved");
  const counts = {
    pending: dayRequests.filter((request) => request.status === "pending").length,
    approved: approved.length,
    coverage: dayRequests.filter((request) => request.type === "coverage" && request.status !== "approved").length,
    conflict: detectConflicts(approved).size,
  };

  els.pendingCount.textContent = counts.pending;
  els.approvedCount.textContent = counts.approved;
  els.coverageCount.textContent = counts.coverage;
  els.conflictCount.textContent = counts.conflict;

  document.querySelectorAll("[data-metric]").forEach((metric) => {
    metric.classList.toggle("empty", counts[metric.dataset.metric] === 0);
  });
}

function handleMetricAction(metric) {
  const actions = {
    pending: () => scrollToRequestColumn("pending", "대기 요청이 없습니다."),
    approved: () => scrollToRequestColumn("approved", "승인된 교체가 없습니다."),
    coverage: () => scrollToCoverageRequest(),
    conflict: () => scrollToConflict(),
  };
  actions[metric]?.();
}

function scrollToRequestColumn(status, emptyMessage) {
  const column = document.querySelector(`.request-column[data-status="${status}"]`);
  if (!column) return;
  column.scrollIntoView({ behavior: "smooth", block: "center" });
  flashElement(column);
  if (!column.querySelector(".request-card")) showSync(emptyMessage);
}

function scrollToCoverageRequest() {
  const card = document.querySelector('.request-card[data-request-type="coverage"]:not([data-status="approved"])');
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    flashElement(card);
    return;
  }
  scrollToRequestColumn("pending", "보강 필요 요청이 없습니다.");
}

function scrollToConflict() {
  const conflict = document.querySelector(".lesson.conflict");
  if (!conflict) {
    document.querySelector(".schedule-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    showSync("감지된 충돌이 없습니다.");
    return;
  }
  conflict.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  flashElement(conflict);
}

function flashElement(element) {
  element.classList.remove("focus-flash");
  void element.offsetWidth;
  element.classList.add("focus-flash");
  window.setTimeout(() => element.classList.remove("focus-flash"), 1400);
}

function renderPlanner() {
  const entries = state.planner.entries;
  const conflicts = detectPlannerConflicts(entries);
  els.plannerTableBody.replaceChildren();

  for (let period = 1; period <= 7; period += 1) {
    const row = document.createElement("tr");
    const periodCell = document.createElement("th");
    periodCell.scope = "row";
    periodCell.textContent = `${period}교시`;
    row.append(periodCell);

    for (const day of days.slice(0, 5)) {
      const cell = document.createElement("td");
      const slotEntries = entries.filter((entry) => entry.day === day && entry.period === period);
      if (!slotEntries.length) {
        const empty = document.createElement("span");
        empty.className = "planner-empty";
        empty.textContent = "미배치";
        cell.append(empty);
      }
      for (const entry of slotEntries) {
        cell.append(createPlannerAssignment(entry, conflicts));
      }
      row.append(cell);
    }

    els.plannerTableBody.append(row);
  }

  els.plannerEntryCount.textContent = entries.length;
  els.plannerConflictCount.textContent = conflicts.size;
}

function createPlannerAssignment(entry, conflicts) {
  const item = document.createElement("div");
  item.className = "planner-assignment";
  if (conflicts.has(entry.id)) item.classList.add("conflict");

  const title = makeText("strong", `${entry.className} · ${entry.subjectName || entry.lessonName}`);
  const detail = entry.lessonName ? `${entry.lessonName} · ${teacherName(entry.teacherId)}` : teacherName(entry.teacherId);
  const meta = makeText("span", detail);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "삭제";
  remove.addEventListener("click", () => removePlannerEntry(entry.id));

  item.append(title, meta, remove);
  return item;
}

function detectPlannerConflicts(entries) {
  const conflicts = new Set();
  const teacherSlots = new Map();
  const classSlots = new Map();

  for (const entry of entries) {
    const teacherKey = `${entry.teacherId}-${entry.day}-${entry.period}`;
    const classKey = `${entry.className}-${entry.day}-${entry.period}`;
    markPlannerConflict(teacherSlots, teacherKey, entry.id, conflicts);
    markPlannerConflict(classSlots, classKey, entry.id, conflicts);
  }

  return conflicts;
}

function markPlannerConflict(map, key, id, conflicts) {
  if (!key || key.startsWith("-")) return;
  if (map.has(key)) {
    conflicts.add(map.get(key));
    conflicts.add(id);
    return;
  }
  map.set(key, id);
}

function removePlannerEntry(id) {
  state.planner.entries = state.planner.entries.filter((entry) => entry.id !== id);
  persistAndRender();
}

function exportPlannerCsv() {
  const header = ["요일", "교시", "학반", "교과목", "수업명/비고", "교사"];
  const rows = state.planner.entries
    .slice()
    .sort((a, b) => `${a.day}${a.period}${a.className}`.localeCompare(`${b.day}${b.period}${b.className}`))
    .map((entry) => [
      entry.day,
      `${entry.period}교시`,
      entry.className,
      entry.subjectName || "",
      entry.lessonName,
      teacherName(entry.teacherId),
    ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "2026_2학기_시간표_설계.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildLesson(teacherId, period, approved) {
  const base = getBaseLesson(teacherId, state.selectedDay, period);
  const related = approved.find((request) => {
    const fromDay = request.fromDay || request.day;
    const fromPeriod = request.fromPeriod || request.period;
    const toDay = request.toDay || request.day;
    const toPeriod = request.toPeriod || request.period;
    return (
      (request.fromTeacher === teacherId && fromDay === state.selectedDay && fromPeriod === period) ||
      (request.toTeacher === teacherId && toDay === state.selectedDay && toPeriod === period)
    );
  });

  if (!related) return base;

  if (related.toTeacher === teacherId && (related.toDay || related.day) === state.selectedDay && (related.toPeriod || related.period) === period) {
    const fromBase = getBaseLesson(related.fromTeacher, related.fromDay || related.day, related.fromPeriod || related.period);
    return {
      title: related.type === "coverage" ? `${fromBase.title} 보강` : `${fromBase.title} 교체`,
      className: fromBase.className,
      note: `${teacherName(related.fromTeacher)} ${(related.fromDay || related.day)}${related.fromPeriod || related.period} 요청 승인`,
      status: "changed",
    };
  }

  return {
    title: related.type === "coverage" ? "보강 배정됨" : "교체 승인됨",
    className: base.className,
    note: `${teacherName(related.toTeacher)} ${(related.toDay || related.day)}${related.toPeriod || related.period} 담당`,
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
    const toDay = request.toDay || request.day;
    const toPeriod = request.toPeriod || request.period;
    const key = `${request.toTeacher}-${toDay}-${toPeriod}`;
    if (toDay === state.selectedDay && (scheduleIndex.has(key) || busy.has(key))) conflicts.add(key);
    busy.set(key, true);
  }
  return conflicts;
}

function updateRequest(id, status) {
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  request.status = status;
  const statusText = { approved: "승인", rejected: "반려", pending: "대기 전환" }[status];
  pushActivity(`${teacherName(request.fromTeacher)} → ${teacherName(request.toTeacher)} ${requestTimeLabel(request)} 요청이 ${statusText}되었습니다.`);
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

  const baseLesson = getBaseLesson(request.fromTeacher, request.fromDay || request.day, request.fromPeriod || request.period);
  const targetLesson = getBaseLesson(request.toTeacher, request.toDay || request.day, request.toPeriod || request.period);
  const payload = {
    requestId: request.id,
    requestDate: request.requestDate || state.selectedDate,
    day: request.fromDay || request.day,
    period: request.fromPeriod || request.period,
    fromDay: request.fromDay || request.day,
    fromPeriod: request.fromPeriod || request.period,
    toDay: request.toDay || request.day,
    toPeriod: request.toPeriod || request.period,
    type: request.type,
    typeLabel: typeLabel(request.type),
    status: request.status,
    fromTeacher: teacherName(request.fromTeacher),
    fromSubject: teacherSubject(request.fromTeacher),
    toTeacher: teacherName(request.toTeacher),
    toSubject: teacherSubject(request.toTeacher),
    originalClass: baseLesson.className,
    originalLesson: baseLesson.title,
    targetClass: targetLesson.className,
    targetLesson: targetLesson.title,
    reason: request.reason,
    createdAt: new Date(request.createdAt).toISOString(),
    userAgent: navigator.userAgent.slice(0, 180),
  };

  submitToGoogleSheet(payload);
  pushActivity("구글 시트로 요청 데이터 전송을 요청했습니다.");
  persistAndRender();
}

function submitToGoogleSheet(payload) {
  const params = new URLSearchParams({
    payload: JSON.stringify(payload),
    t: String(Date.now()),
  });
  const beacon = new Image();
  beacon.referrerPolicy = "no-referrer";
  beacon.src = `${sheetWebAppUrl}?${params.toString()}`;
}

function openPrintApplication(request) {
  const printWindow = window.open("", "timetable-application-print", "width=900,height=1100");
  if (!printWindow) {
    alert("팝업이 차단되어 신청서를 열 수 없습니다. 브라우저 팝업 허용 후 다시 눌러 주세요.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintApplicationHtml(request));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function buildPrintApplicationHtml(request) {
  const fromDay = request.fromDay || request.day;
  const fromPeriod = request.fromPeriod || request.period;
  const toDay = request.toDay || request.day;
  const toPeriod = request.toPeriod || request.period;
  const fromLesson = getBaseLesson(request.fromTeacher, fromDay, fromPeriod);
  const toLesson = getBaseLesson(request.toTeacher, toDay, toPeriod);
  const dateParts = splitDate(request.requestDate || state.selectedDate);
  const requestType = typeLabel(request.type);
  const isCoverage = request.type === "coverage";
  const fromRow = buildPrintRow({
    dateParts,
    day: fromDay,
    className: fromLesson.className,
    period: fromPeriod,
    subject: teacherSubject(request.fromTeacher),
    teacher: teacherName(request.fromTeacher),
  });
  const toRow = buildPrintRow({
    dateParts,
    day: toDay,
    className: toLesson.className,
    period: toPeriod,
    subject: teacherSubject(request.toTeacher),
    teacher: teacherName(request.toTeacher),
  });
  const emptyRow = buildPrintRow({});
  const blankRows = Array.from({ length: 9 }, () => combinePrintRows(emptyRow, emptyRow, emptyRow)).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>수업 교체 및 결․보강 신청서</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; font-size: 12px; }
    .paper { width: 186mm; margin: 0 auto; }
    h1 { margin: 10mm 0 6mm; text-align: center; font-size: 24px; letter-spacing: 3px; }
    .approval { display: grid; grid-template-columns: 1fr 60mm; align-items: start; margin-bottom: 8mm; }
    .approval table, .main-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #000; height: 8mm; padding: 1.5mm; text-align: center; vertical-align: middle; }
    .approval th { height: 7mm; font-weight: 700; }
    .approval td { height: 16mm; }
    .line { margin: 3mm 0; line-height: 1.8; }
    .line-label { display: inline-block; min-width: 13mm; font-weight: 700; }
    .center-line { margin: 4mm 0 5mm; text-align: center; line-height: 2; }
    .teacher-sign { text-align: right; padding-right: 10mm; }
    .main-table th { height: 8mm; font-weight: 700; }
    .section-title { font-size: 14px; }
    .main-table .small { font-size: 10px; }
    .main-table td { height: 8.5mm; }
    .slash { background: linear-gradient(135deg, transparent 49%, #000 50%, transparent 51%); }
    .note { margin-top: 5mm; color: #333; font-size: 11px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="paper">
    <h1>수업 교체 및 결․보강 신청서</h1>
    <div class="approval">
      <div></div>
      <table aria-label="결재란">
        <tr><th>계</th><th>교 무</th><th>교 감</th></tr>
        <tr><td></td><td></td><td></td></tr>
      </table>
    </div>
    <div class="line">
      <span class="line-label">일&nbsp;&nbsp;시:</span>
      ${dateParts.year}년 ${dateParts.month}월 ${dateParts.day}일 (${escapeHtml(fromDay)})요일
      ${escapeHtml(String(fromPeriod))}교시
    </div>
    <div class="line"><span class="line-label">사&nbsp;&nbsp;유:</span> ${escapeHtml(request.reason || "")}</div>
    <div class="line">위와 같은 사유에 의해 아래 내용과 같이 <strong>( ${escapeHtml(requestType)} )수업</strong>을 신청하오니 허가를 바랍니다.</div>
    <div class="center-line">
      ${dateParts.year}년&nbsp;&nbsp;&nbsp;&nbsp;${dateParts.month}월&nbsp;&nbsp;&nbsp;&nbsp;${dateParts.day}일
      <div class="teacher-sign">교사: ${escapeHtml(teacherName(request.fromTeacher))} &nbsp;&nbsp;&nbsp;&nbsp; (인)</div>
    </div>
    <table class="main-table" aria-label="수업 교체 및 보강 신청 내용">
      <colgroup>
        <col span="6" />
        <col span="6" />
        <col span="2" />
      </colgroup>
      <tr>
        <th class="section-title" colspan="6">( 결강, 교체 ) 신청 수업</th>
        <th class="section-title" colspan="6">교체 수업</th>
        <th class="section-title" colspan="2">보강수업</th>
      </tr>
      <tr>
        <th class="small">월/일</th><th class="small">요일</th><th class="small">학반</th><th class="small">교시</th><th class="small">교과목</th><th class="small">수업교사</th>
        <th class="small">월/일</th><th class="small">요일</th><th class="small">교시</th><th class="small">교과목</th><th class="small">교사</th><th class="small">(인)</th>
        <th class="small">교사</th><th class="small">(인)</th>
      </tr>
      ${combinePrintRows(fromRow, isCoverage ? buildPrintRow({}) : toRow, isCoverage ? toRow : buildPrintRow({}))}
      ${blankRows}
    </table>
    <p class="note no-print">인쇄 창이 자동으로 열리지 않으면 브라우저 메뉴에서 인쇄를 선택하세요.</p>
  </div>
</body>
</html>`;
}

function buildPrintRow({ dateParts = {}, day = "", className = "", period = "", subject = "", teacher = "" }) {
  return {
    date: dateParts.month && dateParts.day ? `${dateParts.month}/${dateParts.day}` : "",
    day,
    className,
    period,
    subject,
    teacher,
  };
}

function combinePrintRows(fromRow, swapRow, coverageRow) {
  return `<tr>
    <td>${escapeHtml(fromRow.date)}</td>
    <td>${escapeHtml(fromRow.day)}</td>
    <td>${escapeHtml(fromRow.className)}</td>
    <td>${escapeHtml(String(fromRow.period || ""))}</td>
    <td>${escapeHtml(fromRow.subject)}</td>
    <td>${escapeHtml(fromRow.teacher)}</td>
    <td>${escapeHtml(swapRow.date)}</td>
    <td>${escapeHtml(swapRow.day)}</td>
    <td>${escapeHtml(String(swapRow.period || ""))}</td>
    <td>${escapeHtml(swapRow.subject)}</td>
    <td>${escapeHtml(swapRow.teacher)}</td>
    <td></td>
    <td>${escapeHtml(coverageRow.teacher)}</td>
    <td></td>
  </tr>`;
}

function splitDate(value) {
  const [year = "", month = "", day = ""] = String(value || "").split("-");
  return { year, month, day };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const requests = Array.isArray(nextState?.requests)
    ? nextState.requests.map((request) => ({
        ...request,
        fromDay: request.fromDay || request.day || defaultDay,
        fromPeriod: request.fromPeriod || request.period || 1,
        toDay: request.toDay || request.day || defaultDay,
        toPeriod: request.toPeriod || request.period || 1,
        requestDate: request.requestDate || nextState?.selectedDate || initialState.selectedDate,
        day: request.fromDay || request.day || defaultDay,
        period: request.fromPeriod || request.period || 1,
      }))
    : [];

  const activity = Array.isArray(nextState?.activity)
    ? nextState.activity.filter((entry) => !isDataLoadActivity(entry))
    : initialState.activity;
  const plannerEntries = Array.isArray(nextState?.planner?.entries)
    ? nextState.planner.entries.map((entry) => ({
        ...entry,
        id: entry.id || crypto.randomUUID(),
        subjectName: entry.subjectName || entry.lessonName || "",
        lessonName: entry.subjectName ? entry.lessonName || "" : "",
        period: Number(entry.period || 1),
      }))
    : [];

  return {
    ...structuredClone(initialState),
    ...nextState,
    selectedDay: days.includes(nextState?.selectedDay) ? nextState.selectedDay : defaultDay,
    requests,
    activity,
    planner: {
      entries: plannerEntries,
    },
  };
}

function isDataLoadActivity(entry) {
  const text = String(entry?.text || "");
  return text.includes("데이터를 불러왔습니다") || text.includes("xlsx 데이터");
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

function requestTimeLabel(request) {
  const fromDay = request.fromDay || request.day;
  const fromPeriod = request.fromPeriod || request.period;
  const toDay = request.toDay || request.day;
  const toPeriod = request.toPeriod || request.period;
  return `${fromDay}요일 ${fromPeriod}교시 → ${toDay}요일 ${toPeriod}교시`;
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
