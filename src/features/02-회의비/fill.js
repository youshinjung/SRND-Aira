'use strict';

const FORBIDDEN_FINAL_ACTIONS = Object.freeze([
  '저장', '신청', '변경신청', '발급신청', '제출', '청구', '승인', '삭제',
]);

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function meetingFrame(page) {
  for (const frame of page.frames()) {
    const date = frame.locator('input[id*="cal_useDt_calendaredit_input"]').first();
    const content = frame.locator('textarea[id*="txt_aplyCtnt_textarea"]').first();
    if (await date.isVisible().catch(() => false) && await content.isVisible().catch(() => false)) return frame;
  }
  throw new Error('회의비 지출신청 팝업을 찾지 못했습니다. 과제 선택 후 지출구분에서 회의비를 선택해 팝업을 연 뒤 다시 시작하세요.');
}

async function requiredField(frame, selector, label) {
  const field = frame.locator(selector).first();
  if (!await field.isVisible().catch(() => false) || !await field.isEnabled().catch(() => false)) {
    throw new Error(`${label} 입력칸이 보이지 않거나 비활성 상태입니다. 자동입력을 중단합니다.`);
  }
  return field;
}

async function fillAndConfirm(field, value, label, position) {
  await field.click(position ? { position } : undefined);
  await field.fill(value);
  await field.press('Tab');
  if (!(await field.inputValue()).trim()) throw new Error(`${label} 값이 화면에 반영되지 않았습니다. 자동입력을 중단합니다.`);
}

async function fillTime(field, time, label) {
  const digits = time.replace(/\D/g, '');
  if (digits.length !== 4) throw new Error(`${label} 시간이 올바르지 않습니다.`);
  await field.click({ position: { x: 5, y: 5 } });
  await field.press(process.platform === 'win32' ? 'Control+A' : 'Meta+A');
  await field.type(digits, { delay: 50 });
  await field.press('Tab');
  if ((await field.inputValue()).replace(/\D/g, '') !== digits) {
    await field.click({ position: { x: 5, y: 5 } });
    await field.fill(digits);
    await field.press('Tab');
  }
  if ((await field.inputValue()).replace(/\D/g, '') !== digits) throw new Error(`${label} 시간이 화면에 반영되지 않았습니다.`);
}

async function uploaderFrame(context, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const candidate of context.pages()) {
      for (const frame of candidate.frames()) {
        if (!frame.url().includes('/plupload/fileUploader.jsp')) continue;
        if (await frame.locator('input[type="file"]').count()) return { page: candidate, frame };
      }
    }
    await sleep(200);
  }
  throw new Error('첨부파일 창을 찾지 못했습니다. SRnD에서 첨부 영역을 열고 다시 시작하세요.');
}

async function attachPdf(page, pdfPath) {
  if (!pdfPath) return false;
  const { page: uploadPage, frame } = await uploaderFrame(page.context());
  const fileInput = frame.locator('input[type="file"]').first();
  const fileList = frame.locator('#file_uploader_filelist').first();
  await fileInput.setInputFiles(pdfPath);
  const fileName = pdfPath.split(/[\\/]/).pop();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if ((await fileList.textContent().catch(() => '')).includes(fileName)) break;
    await sleep(200);
  }
  if (!(await fileList.textContent().catch(() => '')).includes(fileName)) {
    throw new Error('선택한 PDF가 첨부 목록에 나타나지 않았습니다. 자동입력을 중단합니다.');
  }
  const complete = frame.locator('#btn_upload').first();
  if (!await complete.isVisible().catch(() => false)) throw new Error('첨부 완료 버튼을 찾지 못했습니다.');
  await complete.click();
  void uploadPage;
  return true;
}

function uniqueNames(names) {
  if (!Array.isArray(names)) return [];
  return [...new Set(names.map(name => String(name || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

async function waitForPopup(frame, suffix, label, timeoutMs = 5000) {
  const popup = frame.locator(`[id$="${suffix}"]`).first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await popup.isVisible().catch(() => false)) return popup;
    await sleep(100);
  }
  throw new Error(`${label} popup did not open.`);
}

async function participantPopupFrame(context, timeoutMs = 10000) {
  const selector = '[id*="_new_hworkPaticpPsn_form_grd_main_body_gridrow_"][id$="_controlcheckbox"]';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const candidatePage of context.pages()) {
      for (const candidateFrame of candidatePage.frames()) {
        const firstCheckbox = candidateFrame.locator(selector).first();
        if (await firstCheckbox.isVisible().catch(() => false)) return candidateFrame;
      }
    }
    await sleep(150);
  }
  throw new Error('Could not find the project-participant lookup grid.');
}

async function gridRows(popup, gridPrefix) {
  return popup.locator(`div[id*="${gridPrefix}_form_grd_main_body_gridrow_"]`).evaluateAll((elements, prefix) => (
    elements
      .filter(element => new RegExp(`_${prefix}_form_grd_main_body_gridrow_\\d+$`).test(element.id))
      .map(element => ({ id: element.id, text: (element.innerText || '').replace(/\s+/g, ' ').trim() }))
  ), gridPrefix);
}

function exactNameRows(rows, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundary = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
  return rows.filter(row => boundary.test(row.text));
}

async function addInternalParticipants(page, frame, names) {
  const participants = uniqueNames(names);
  if (!participants.length) return 0;

  const openButton = frame.locator('[id$="_new_form_btn_hworkPaticpPsn"]').first();
  if (!await openButton.isVisible().catch(() => false)) throw new Error('Project participant lookup button was not found.');
  await openButton.click();

  await waitForPopup(frame, '_new_hworkPaticpPsn', 'Project participant lookup');
  // This lookup can be hosted in a separate Nexacro frame. It must be found
  // across the connected SRnD pages, not only beneath the meeting form frame.
  const popupFrame = await participantPopupFrame(page.context());
  const checkboxes = popupFrame.locator('[id*="_new_hworkPaticpPsn_form_grd_main_body_gridrow_"][id$="_controlcheckbox"]');
  const available = [];
  for (let index = 0; index < await checkboxes.count(); index += 1) {
    const checkbox = checkboxes.nth(index);
    const id = await checkbox.getAttribute('id');
    const match = id && id.match(/_gridrow_(\d+)_cell_\1_1_controlcheckbox$/);
    if (!match) continue;
    const row = match[1];
    const nameCell = popupFrame.locator(`[id*="_new_hworkPaticpPsn_form_grd_main_body_gridrow_${row}_cell_${row}_4GridCellTextContainerElement"]`).first();
    const name = String(await nameCell.textContent().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (name) available.push({ name, checkbox });
  }
  const selections = participants.map(name => ({ name, matches: available.filter(row => row.name === name) }));
  const uncertain = selections.filter(item => item.matches.length !== 1).map(item => item.name);
  if (uncertain.length) {
    const found = available.map(row => row.name).join(', ') || '(none)';
    throw new Error(`Could not uniquely match project participant: ${uncertain.join(', ')}. Lookup rows found: ${found}`);
  }
  for (const { checkbox } of selections.map(item => ({ checkbox: item.matches[0].checkbox }))) {
    const checkboxId = await checkbox.getAttribute('id');
    const selected = await checkbox.evaluate((element, imageId) => {
      const image = document.getElementById(imageId);
      return Boolean(image && getComputedStyle(image).visibility !== 'hidden');
    }, `${checkboxId}_chkimgImageElement`).catch(() => false);
    if (!selected) {
      const box = await checkbox.boundingBox();
      if (!box) throw new Error('Could not determine the participant checkbox position.');
      await popupFrame.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(150);
    }
  }
  for (const item of selections) {
    const checkbox = item.matches[0].checkbox;
    const checkboxId = await checkbox.getAttribute('id');
    const selected = await checkbox.evaluate((element, imageId) => {
      const image = document.getElementById(imageId);
      return Boolean(image && getComputedStyle(image).visibility !== 'hidden');
    }, `${checkboxId}_chkimgImageElement`).catch(() => false);
    if (!selected) throw new Error(`Project participant checkbox was not selected: ${item.name}`);
  }
  const confirm = popupFrame.locator('[id$="_new_hworkPaticpPsn_form_btn_ok"]').first();
  if (!await confirm.isVisible().catch(() => false)) throw new Error('Project participant lookup confirmation button was not found.');
  await confirm.click();
  return participants.length;
}

async function addExternalParticipants(frame, names) {
  const participants = uniqueNames(names);
  let added = 0;
  for (const name of participants) {
    const openButton = frame.locator('[id$="_new_form_btn_addRowIn"]').first();
    if (!await openButton.isVisible().catch(() => false)) throw new Error('SRnD user lookup button was not found.');
    await openButton.click();

    const popup = await waitForPopup(frame, '_new_psnPopup', 'SRnD user lookup');
    const nameField = popup.locator('input[id$="_form_edt_name_input"]').first();
    const search = popup.locator('[id$="_form_btn_search00"]').first();
    await fillAndConfirm(nameField, name, 'User name');
    await search.click();

    const deadline = Date.now() + 5000;
    let nameMatches = [];
    while (Date.now() < deadline) {
      const rows = await gridRows(popup, 'psnPopup');
      nameMatches = exactNameRows(rows, name);
      if (nameMatches.length || rows.length) break;
      await sleep(100);
    }
    // A unique name is safe to select regardless of affiliation. For homonyms,
    // prefer an Agriculture/Life Sciences affiliation only when it resolves to
    // one person; otherwise leave the decision to the user.
    const agricultureMatches = nameMatches.filter(row => row.text.includes('\uB18D\uC5C5\uC0DD\uBA85'));
    const matches = nameMatches.length === 1
      ? nameMatches
      : agricultureMatches.length === 1
        ? agricultureMatches
        : [];
    if (matches.length !== 1) {
      const close = popup.locator('[id$="_form_btn_close"]').first();
      if (await close.isVisible().catch(() => false)) await close.click();
      const candidates = nameMatches.map(row => row.text).join(' | ') || '(none)';
      throw new Error(`Could not uniquely choose an SRnD user for: ${name}. Candidates: ${candidates}`);
    }
    await popup.locator(`[id="${matches[0].id}"]`).first().click();
    const confirm = popup.locator('[id$="_form_btn_choice"]').first();
    if (!await confirm.isVisible().catch(() => false)) throw new Error('SRnD user lookup confirmation button was not found.');
    await confirm.click();
    added += 1;
  }
  return added;
}

/**
 * 이미 열려 있는 회의비 지출신청 팝업의 핵심 필수칸만 채웁니다.
 * 이 함수는 메뉴 이동, 과제 선택, 지출구분 선택, 저장, 신청을 절대 수행하지 않습니다.
 */
async function fill(page, data) {
  if (!data || !data.meeting) throw new Error('검토할 회의비 데이터가 없습니다.');
  const frame = await meetingFrame(page);
  const { meeting } = data;

  const date = await requiredField(frame, 'input[id*="cal_useDt_calendaredit_input"]', '일자');
  const start = await requiredField(frame, 'input[id*="cal_useFrTm_calendaredit_input"]', '시작 시간');
  const end = await requiredField(frame, 'input[id*="cal_useToTm_calendaredit_input"]', '종료 시간');
  const location = await requiredField(frame, 'input[id*="edt_usePlNm_input"]', '장소');
  const purpose = await requiredField(frame, 'input[id*="edt_usePurp_input"]', '회의목적');
  const content = await requiredField(frame, 'textarea[id*="txt_aplyCtnt_textarea"]', '회의내용');

  await fillAndConfirm(date, meeting.date.replace(/-/g, ''), '일자', { x: 5, y: 5 });
  await fillTime(start, meeting.startTime, '시작');
  await fillTime(end, meeting.endTime, '종료');
  await fillAndConfirm(location, meeting.location, '장소');
  await fillAndConfirm(purpose, meeting.purpose, '회의목적');
  await fillAndConfirm(content, meeting.content, '회의내용');
  const internalAdded = await addInternalParticipants(page, frame, data.attendees && data.attendees.projectParticipants);
  const externalAdded = await addExternalParticipants(frame, data.attendees && data.attendees.internalNonProjectParticipants);
  const attached = await attachPdf(page, data.attachmentPath);

  return {
    filled: ['일자', '시작 시간', '종료 시간', '장소', '회의목적', '회의내용'],
    attached,
    attendees: { internalAdded, externalAdded },
    requiresUserReview: [
      '참석자·소속·인원은 화면의 조회 결과를 사용자가 확인하여 선택',
      '첨부된 PDF와 금액·인원·결제시각을 사용자가 대조',
      '저장·신청·청구·승인 등 최종 처리는 사용자가 직접 수행',
    ],
  };
}

module.exports = { fill, FORBIDDEN_FINAL_ACTIONS };
