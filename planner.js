const STORAGE_KEY = "dgsmart-timetable-hub-v2";
const sourceData = window.TIMETABLE_DATA || { teachers: [], schedules: [] };

const teachers = sourceData.teachers.map((teacher) => ({
  id: teacher.id,
  name: teacher.name,
  subject: teacher.subject || "교과",
}));
const days = [...new Set(sourceData.schedules.map((item) => item.day).filter(Boolean))].slice(0, 5);
const defaultPlannerState = { planner: { entries: [] } };

const els = {
  syncStatus: document.querySelector("#syncStatus"),
  form: document.querySelector("#plannerForm"),
  teacher: document.querySelector("#plannerTeacher"),
  day: document.querySelector("#plannerDay"),
  period: document.querySelector("#plannerPeriod"),
  className: document.querySelector("#plannerClass"),
  subject: document.querySelector("#plannerSubject"),
  lesson: document.querySelector("#plannerLesson"),
  tableBody: document.querySelector("#plannerTable tbody"),
  entryCount: document.querySelector("#plannerEntryCount"),
  conflictCount: document.querySelector("#plannerConflictCount"),
  exportBtn: document.querySelector("#plannerExportBtn"),
  resetBtn: document.querySelector("#plannerResetBtn"),
};

let state = normalizePlannerState(loadState());

hydrateControls();
renderPlanner();

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.planner.entries.unshift({
    id: crypto.randomUUID(),
    teacherId: els.teacher.value,
    day: els.day.value,
    period: Number(els.period.value),
    className: els.className.value.trim(),
    subjectName: els.subject.value.trim(),
    lessonName: els.lesson.value.trim(),
    createdAt: Date.now(),
  });
  els.subject.value = "";
  els.lesson.value = "";
  persistAndRender();
  showSync("2학기 시간표 배치 추가됨");
});

els.resetBtn.addEventListener("click", () => {
  if (!confirm("2학기 설계 데이터를 모두 삭제할까요?")) return;
  state.planner.entries = [];
  persistAndRender();
});

els.exportBtn.addEventListener("click", exportPlannerCsv);

function hydrateControls() {
  for (const teacher of teachers) {
    els.teacher.append(new Option(`${teacher.name} (${teacher.subject})`, teacher.id));
  }
  for (const day of days) {
    els.day.append(new Option(`${day}요일`, day));
  }
  for (let period = 1; period <= 7; period += 1) {
    els.period.append(new Option(`${period}교시`, period));
  }
}

function renderPlanner() {
  const entries = state.planner.entries;
  const conflicts = detectPlannerConflicts(entries);
  els.tableBody.replaceChildren();

  for (let period = 1; period <= 7; period += 1) {
    const row = document.createElement("tr");
    const periodCell = document.createElement("th");
    periodCell.scope = "row";
    periodCell.textContent = `${period}교시`;
    row.append(periodCell);

    for (const day of days) {
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

    els.tableBody.append(row);
  }

  els.entryCount.textContent = entries.length;
  els.conflictCount.textContent = conflicts.size;
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
    markPlannerConflict(teacherSlots, `${entry.teacherId}-${entry.day}-${entry.period}`, entry.id, conflicts);
    markPlannerConflict(classSlots, `${entry.className}-${entry.day}-${entry.period}`, entry.id, conflicts);
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

function persistAndRender() {
  const saved = loadState();
  saved.planner = state.planner;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  renderPlanner();
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultPlannerState);
  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(defaultPlannerState);
  }
}

function normalizePlannerState(nextState) {
  const entries = Array.isArray(nextState?.planner?.entries)
    ? nextState.planner.entries.map((entry) => ({
        ...entry,
        id: entry.id || crypto.randomUUID(),
        subjectName: entry.subjectName || entry.lessonName || "",
        lessonName: entry.subjectName ? entry.lessonName || "" : "",
        period: Number(entry.period || 1),
      }))
    : [];
  return { planner: { entries } };
}

function teacherName(id) {
  return teachers.find((teacher) => teacher.id === id)?.name ?? "알 수 없음";
}

function makeText(tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function showSync(message) {
  els.syncStatus.textContent = message;
  window.clearTimeout(showSync.timer);
  showSync.timer = window.setTimeout(() => {
    els.syncStatus.textContent = "이 브라우저에서 활성";
  }, 2200);
}
