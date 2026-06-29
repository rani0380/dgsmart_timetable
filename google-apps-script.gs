const SHEET_NAME = "요청누적";
const SPREADSHEET_ID = "1D46OIgSSAqfJmzwkWAPiFYKPnJyG32U_GXY9-6mfhgY";
const ADMIN_EMAILS = ["par0380@dge.go.kr"];
const HEADERS = [
  "접수시각",
  "요청ID",
  "기준일",
  "요일",
  "교시",
  "요청요일",
  "요청교시",
  "대상요일",
  "대상교시",
  "유형",
  "상태",
  "요청교사",
  "요청교과",
  "대상교사",
  "대상교과",
  "원수업반",
  "원수업",
  "대상수업반",
  "대상수업",
  "사유",
  "접속정보",
];

function doPost(e) {
  const data = parseRequest_(e);
  appendRequest_(data);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, mode: "post" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseRequest_(e) {
  if (!e) {
    return {
      requestId: "MANUAL-" + new Date().getTime(),
      requestDate: "2026-06-29",
      day: "월",
      period: "",
      typeLabel: "수동실행",
      status: "manual",
      fromTeacher: "Apps Script",
      fromSubject: "",
      toTeacher: "직접 doPost 실행",
      toSubject: "",
      originalClass: "",
      originalLesson: "",
      reason: "doPost를 직접 실행했습니다. 실제 테스트는 testAppendRequest_ 함수를 실행하세요.",
      userAgent: "Apps Script manual run",
    };
  }

  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }

  return {};
}

function doGet(e) {
  if (e && e.parameter && e.parameter.payload) {
    const data = parseRequest_(e);
    appendRequest_(data);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, mode: "get" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: "DG Smart Timetable",
      spreadsheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendRequest_(data) {
  const sheet = getSheet_();

  sheet.appendRow([
    new Date(),
    data.requestId || "",
    data.requestDate || "",
    data.day || "",
    data.period || "",
    data.fromDay || data.day || "",
    data.fromPeriod || data.period || "",
    data.toDay || "",
    data.toPeriod || "",
    data.typeLabel || "",
    data.status || "",
    data.fromTeacher || "",
    data.fromSubject || "",
    data.toTeacher || "",
    data.toSubject || "",
    data.originalClass || "",
    data.originalLesson || "",
    data.targetClass || "",
    data.targetLesson || "",
    data.reason || "",
    data.userAgent || "",
  ]);

  try {
    notifyAdmins_(data);
  } catch (error) {
    console.error("알림 메일 발송 실패:", error);
  }
}

function testAppendRequest_() {
  doPost({
    postData: {
      contents: JSON.stringify({
        requestId: "TEST-" + new Date().getTime(),
        requestDate: "2026-06-29",
        day: "월",
        period: 5,
        fromDay: "월",
        fromPeriod: 5,
        toDay: "수",
        toPeriod: 3,
        typeLabel: "교체",
        status: "pending",
        fromTeacher: "테스트 요청교사",
        fromSubject: "국어",
        toTeacher: "테스트 대상교사",
        toSubject: "수학",
        originalClass: "1-1",
        originalLesson: "16",
        targetClass: "2-1",
        targetLesson: "21",
        reason: "Apps Script 연결 테스트",
        userAgent: "Apps Script test",
      }),
    },
  });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
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
    `요청 수업: ${data.fromDay || data.day || ""}요일 ${data.fromPeriod || data.period || ""}교시`,
    `교체 받을 수업: ${data.toDay || ""}요일 ${data.toPeriod || ""}교시`,
    `유형: ${data.typeLabel || ""}`,
    `요청 교사: ${data.fromTeacher || ""} (${data.fromSubject || ""})`,
    `대상 교사: ${data.toTeacher || ""} (${data.toSubject || ""})`,
    `원수업: ${data.originalClass || ""} ${data.originalLesson || ""}`,
    `대상수업: ${data.targetClass || ""} ${data.targetLesson || ""}`,
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
