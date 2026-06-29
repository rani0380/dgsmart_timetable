const SHEET_NAME = "요청누적";
const ADMIN_EMAILS = ["담당자이메일@example.com"];

function doPost(e) {
  const sheet = getSheet_();
  const data = JSON.parse(e.postData.contents || "{}");

  sheet.appendRow([
    new Date(),
    data.requestId || "",
    data.requestDate || "",
    data.day || "",
    data.period || "",
    data.typeLabel || "",
    data.status || "",
    data.fromTeacher || "",
    data.fromSubject || "",
    data.toTeacher || "",
    data.toSubject || "",
    data.originalClass || "",
    data.originalLesson || "",
    data.reason || "",
    data.userAgent || "",
  ]);

  notifyAdmins_(data);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "DG Smart Timetable" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "접수시각",
      "요청ID",
      "기준일",
      "요일",
      "교시",
      "유형",
      "상태",
      "요청교사",
      "요청교과",
      "대상교사",
      "대상교과",
      "원수업반",
      "원수업",
      "사유",
      "접속정보",
    ]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function notifyAdmins_(data) {
  const recipients = ADMIN_EMAILS.filter((email) => email && !email.includes("example.com"));
  if (recipients.length === 0) return;

  const subject = `[시간표 ${data.typeLabel || "요청"}] ${data.fromTeacher || "요청자"} → ${data.toTeacher || "대상자"}`;
  const body = [
    "교체/보강 요청이 접수되었습니다.",
    "",
    `기준일: ${data.requestDate || ""}`,
    `요일/교시: ${data.day || ""}요일 ${data.period || ""}교시`,
    `유형: ${data.typeLabel || ""}`,
    `요청 교사: ${data.fromTeacher || ""} (${data.fromSubject || ""})`,
    `대상 교사: ${data.toTeacher || ""} (${data.toSubject || ""})`,
    `원수업: ${data.originalClass || ""} ${data.originalLesson || ""}`,
    `사유: ${data.reason || ""}`,
    "",
    "구글 시트에서 요청 누적 내역을 확인하세요.",
  ].join("\n");

  MailApp.sendEmail({
    to: recipients.join(","),
    subject,
    body,
  });
}
