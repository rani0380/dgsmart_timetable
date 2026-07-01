const STORAGE_KEY = "dgsmart-timetable-hub-v2";
const sourceData = window.TIMETABLE_DATA || { teachers: [], schedules: [] };

const teachers = sourceData.teachers.map((teacher) => ({
  id: teacher.id,
  name: teacher.name,
  subject: teacher.subject || "교과",
}));
const days = [...new Set(sourceData.schedules.map((item) => item.day).filter(Boolean))].slice(0, 5);
const periods = [1, 2, 3, 4, 5, 6, 7];

const els = {
  teacherSearch: document.querySelector("#teacherSearch"),
  teacherFilter: document.querySelector("#teacherFilter"),
  visibleTeacherCount: document.querySelector("#visibleTeacherCount"),
  totalEntryCount: document.querySelector("#totalEntryCount"),
  weeklyConflictCount: document.querySelector("#weeklyConflictCount"),
  weeklyGrid: document.querySelector("#weeklyGrid"),
  weeklyEmpty: document.querySelector("#weeklyEmpty"),
  printWeeklyBtn: document.querySelector("#printWeeklyBtn"),
  syncStatus: document.querySelector("#syncStatus"),
};

const state = normalizePlannerState(loadState());

hydrateFilters();
renderWeeklyView();

els.teacherSearch.addEventListener("input", renderWeeklyView);
els.teacherFilter.addEventListener("change", renderWeeklyView);
els.printWeeklyBtn.addEventListener("click", () => window.print());

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  Object.assign(state, normalizePlannerState(loadState()));
  renderWeeklyView();
  showSync("다른 탭의 설계 변경 반영");
});

function hydrateFilters() {
  els.teacherFilter.append(new Option("전체 교사", "all"));
  for (const teacher of teachers) {
    els.teacherFilter.append(new Option(`${teacher.name} (${teacher.subject})`, teacher.id));
  }
}

function renderWeeklyView() {
  const entries = state.planner.entries;
  const conflicts = detectConflicts(entries);
  const visibleTeachers = getVisibleTeachers(entries);

  els.weeklyGrid.replaceChildren();
  for (const teacher of visibleTeachers) {
    els.weeklyGrid.append(createTeacherCard(teacher, entries, conflicts));
  }

  els.visibleTeacherCount.textContent = visibleTeachers.length;
  els.totalEntryCount.textContent = entries.length;
  els.weeklyConflictCount.textContent = conflicts.size;
  els.weeklyEmpty.hidden = visibleTeachers.length > 0;
}

function getVisibleTeachers(entries) {
  const selectedTeacher = els.teacherFilter.value;
  const keyword = els.teacherSearch.value.trim().toLowerCase();

  return teachers.filter((teacher) => {
    if (selectedTeacher !== "all" && teacher.id !== selectedTeacher) return false;
    if (!keyword) return true;
    return `${teacher.name} ${teacher.subject}`.toLowerCase().includes(keyword);
  });
}

function createTeacherCard(teacher, entries, conflicts) {
  const teacherEntries = entries.filter((entry) => entry.teacherId === teacher.id);
  const card = document.createElement("article");
  card.className = "teacher-week-card";

  const header = document.createElement("div");
  header.className = "teacher-week-header";
  header.append(makeText("strong", teacher.name), makeText("span", `${teacher.subject} · ${teacherEntries.length}시간`));

  const table = document.createElement("table");
  table.className = "teacher-week-table";
  table.append(createWeekHead(), createWeekBody(teacherEntries, conflicts));

  card.append(header, table);
  return card;
}

function createWeekHead() {
  const thead = document.createElement("thead");
  const row = document.createElement("tr");
  row.append(makeText("th", "교시"));
  for (const day of days) {
    row.append(makeText("th", day));
  }
  thead.append(row);
  return thead;
}

function createWeekBody(entries, conflicts) {
  const tbody = document.createElement("tbody");
  for (const period of periods) {
    const row = document.createElement("tr");
    const periodCell = makeText("th", `${period}교시`);
    periodCell.scope = "row";
    row.append(periodCell);

    for (const day of days) {
      const cell = document.createElement("td");
      const slotEntries = entries.filter((entry) => entry.day === day && entry.period === period);
      if (!slotEntries.length) {
        cell.append(makeText("span", "공강", "teacher-free"));
      }
      for (const entry of slotEntries) {
        cell.append(createSlot(entry, conflicts));
      }
      row.append(cell);
    }
    tbody.append(row);
  }
  return tbody;
}

function createSlot(entry, conflicts) {
  const slot = document.createElement("div");
  slot.className = "teacher-slot";
  if (conflicts.has(entry.id)) slot.classList.add("conflict");

  slot.append(
    makeText("strong", `${entry.className} · ${entry.subjectName || entry.lessonName || "교과"}`),
    makeText("span", entry.lessonName || "수업")
  );
  return slot;
}

function detectConflicts(entries) {
  const conflicts = new Set();
  const teacherSlots = new Map();
  const classSlots = new Map();

  for (const entry of entries) {
    markConflict(teacherSlots, `${entry.teacherId}-${entry.day}-${entry.period}`, entry.id, conflicts);
    markConflict(classSlots, `${entry.className}-${entry.day}-${entry.period}`, entry.id, conflicts);
  }

  return conflicts;
}

function markConflict(map, key, id, conflicts) {
  if (!key || key.startsWith("-")) return;
  if (map.has(key)) {
    conflicts.add(map.get(key));
    conflicts.add(id);
    return;
  }
  map.set(key, id);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { planner: { entries: [] } };
  try {
    return JSON.parse(saved);
  } catch {
    return { planner: { entries: [] } };
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

function makeText(tagName, text, className = "") {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function showSync(message) {
  els.syncStatus.textContent = message;
  window.clearTimeout(showSync.timer);
  showSync.timer = window.setTimeout(() => {
    els.syncStatus.textContent = "2학기 설계 데이터 기준";
  }, 2200);
}
