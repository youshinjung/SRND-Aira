'use strict';

const FORBIDDEN_FINAL_ACTIONS = Object.freeze([
  '저장', '신청', '변경신청', '발급신청', '제출', '청구', '승인', '삭제',
]);

const TYPE_FIELD_RULES = Object.freeze({
  강사료: [{ key: 'rateCategory', selector: 'input[id*="_new_form_cmb_RM239_comboedit_input"]', label: '직급/기준단가 구분' }],
  원고료: [],
  통역료: [
    { key: 'interpretationType', selector: 'input[id*="_new_form_cmb_spcUtlztransFg_comboedit_input"]', label: '통역구분' },
    { key: 'languageCategory', selector: 'input[id*="_new_form_cmb_spcUtlzLangFg_comboedit_input"]', label: '언어구분' },
  ],
  번역료: [{ key: 'translationLanguageCategory', selector: 'input[id*="_new_form_cmb_transLangFg_comboedit_input"]', label: '번역언어구분' }],
  회의수당: [{ key: 'rateCategory', selector: 'input[id*="_new_form_cmb_RM239_comboedit_input"]', label: '직급/기준단가 구분' }],
  속기료: [{ key: 'shorthandType', selector: 'input[id*="_new_form_cmb_soggiFg_comboedit_input"]', label: '속기구분' }],
  자문료: [{ key: 'rateCategory', selector: 'input[id*="_new_form_cmb_RM239_comboedit_input"]', label: '직급/기준단가 구분' }],
});

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function expertUseFrame(page) {
  for (const frame of page.frames()) {
    const title = frame.locator('input[id*="_new_form_edt_aplyTtl_input"]').first();
    const purpose = frame.locator('textarea[id*="_new_form_ta_utlzCtnt_textarea"]').first();
    if (await title.isVisible().catch(() => false) && await purpose.isVisible().catch(() => false)) return frame;
  }
  throw new Error('전문가활용비 지급신청 팝업을 찾지 못했습니다. 과제 선택 후 지출구분에서 전문가활용비를 선택해 팝업을 연 뒤 다시 시작하세요.');
}

async function requiredField(frame, selector, label) {
  const fields = frame.locator(selector);
  const count = await fields.count();
  for (let index = 0; index < count; index += 1) {
    const field = fields.nth(index);
    if (await field.isVisible().catch(() => false) && await field.isEnabled().catch(() => false)) return field;
  }
  throw new Error(`${label} 입력칸이 보이지 않거나 비활성 상태입니다. 자동입력을 중단합니다.`);
}

async function fillAndConfirm(field, value, label) {
  if (!String(value || '').trim()) return false;
  await field.click({ position: { x: 5, y: 5 } });
  await field.press(process.platform === 'win32' ? 'Control+A' : 'Meta+A');
  await field.type(String(value), { delay: 30 });
  await field.press('Tab');
  if (!String(await field.inputValue()).trim()) {
    throw new Error(`${label} 값이 화면에 반영되지 않았습니다. 자동입력을 중단합니다.`);
  }
  return true;
}

async function fillTime(field, time, label) {
  const digits = String(time).replace(/\D/g, '');
  if (digits.length !== 4) throw new Error(`${label} 시간이 올바르지 않습니다.`);
  await field.click({ position: { x: 5, y: 5 } });
  await field.press(process.platform === 'win32' ? 'Control+A' : 'Meta+A');
  await field.type(digits, { delay: 50 });
  await field.press('Tab');
  if ((await field.inputValue()).replace(/\D/g, '') !== digits) {
    await field.fill(digits);
    await field.press('Tab');
  }
  if ((await field.inputValue()).replace(/\D/g, '') !== digits) {
    throw new Error(`${label} 시간이 화면에 반영되지 않았습니다. 자동입력을 중단합니다.`);
  }
}

async function chooseVisibleCombo(frame, selector, value, label) {
  if (!value) return false;
  const combo = await requiredField(frame, selector, label);
  await combo.click({ position: { x: 5, y: 5 } });
  await combo.fill(value);
  await combo.press('ArrowDown');
  await combo.press('Enter');
  await combo.press('Tab');
  if (!String(await combo.inputValue()).trim() || (await combo.inputValue()).trim() === '선택') {
    throw new Error(`${label} 선택값이 화면에 반영되지 않았습니다. 자동입력을 중단합니다.`);
  }
  return true;
}

async function choosePaymentType(frame, paymentType) {
  if (!Object.prototype.hasOwnProperty.call(TYPE_FIELD_RULES, paymentType)) throw new Error(`지원하지 않는 지급구분입니다: ${paymentType}`);
  const group = frame.locator('div[id*="_new_form_rdo_spcUtlzFg"]').first();
  if (!await group.isVisible().catch(() => false)) throw new Error('지급구분 선택 영역을 찾지 못했습니다.');
  const option = group.getByText(paymentType, { exact: true }).first();
  if (!await option.isVisible().catch(() => false)) throw new Error(`지급구분 '${paymentType}'을 찾지 못했습니다.`);
  await option.click();
}

async function fillTypeSpecificFields(frame, expertUse) {
  const fields = TYPE_FIELD_RULES[expertUse.paymentType];
  if (!fields) return [];
  const filled = [];
  for (const field of fields) {
    const value = expertUse.variant && expertUse.variant[field.key];
    if (await chooseVisibleCombo(frame, field.selector, value, field.label)) filled.push(field.label);
  }
  return filled;
}

async function uploaderFrame(context, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      for (const frame of page.frames()) {
        if (!frame.url().includes('/plupload/fileUploader.jsp')) continue;
        if (await frame.locator('input[type="file"]').count()) return { page, frame };
      }
    }
    await sleep(200);
  }
  throw new Error('첨부파일 창을 찾지 못했습니다. SRnD에서 증빙서류의 업로드를 연 뒤 다시 시작하세요.');
}

function normalizePdfFiles(files, label) {
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
  if (!list.length) return [];
  if (list.some(file => !/\.pdf$/i.test(file))) throw new Error(`${label}에는 PDF 파일만 첨부할 수 있습니다.`);
  return list;
}

async function attachFilesToOpenUploader(page, files, label) {
  const pdfFiles = normalizePdfFiles(files, label);
  if (!pdfFiles.length) return [];
  const { frame } = await uploaderFrame(page.context());
  const fileInput = frame.locator('input[type="file"]').first();
  const fileList = frame.locator('#file_uploader_filelist').first();
  await fileInput.setInputFiles(pdfFiles);
  const fileNames = pdfFiles.map(file => file.split(/[\\/]/).pop());
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const listed = await fileList.textContent().catch(() => '');
    if (fileNames.every(fileName => listed.includes(fileName))) break;
    await sleep(200);
  }
  const listed = await fileList.textContent().catch(() => '');
  if (!fileNames.every(fileName => listed.includes(fileName))) {
    throw new Error(`${label} 파일이 첨부 목록에 모두 나타나지 않았습니다. 자동입력을 중단합니다.`);
  }
  const complete = frame.locator('#btn_upload').first();
  if (!await complete.isVisible().catch(() => false)) throw new Error('첨부 완료 버튼을 찾지 못했습니다.');
  await complete.click();
  return fileNames;
}

async function attachEvidenceFiles(page, files) {
  return attachFilesToOpenUploader(page, files, '증빙서류');
}

async function attachBottomAttachmentFiles(page, files) {
  return attachFilesToOpenUploader(page, files, '하단 첨부파일');
}

/**
 * 이미 열린 전문가활용비 지급신청 팝업의 비개인정보 일반 필수칸만 채웁니다.
 * 대상자·계좌·증빙·세목/비용·기준단가 및 저장·신청은 절대 수행하지 않습니다.
 */
async function fill(page, data) {
  if (!data || !data.expertUse) throw new Error('검토할 전문가활용비 데이터가 없습니다.');
  const frame = await expertUseFrame(page);
  const { expertUse } = data;
  const startDate = await requiredField(frame, 'input[id*="_new_form_cal_frDt_calendaredit_input"]', '시작일');
  const endDate = await requiredField(frame, 'input[id*="_new_form_cal_toDt_calendaredit_input"]', '종료일');
  const startTime = await requiredField(frame, 'input[id*="_new_form_cal_useFrTm_calendaredit_input"], input[id*="_new_form_cal_frTm_calendaredit_input"]', '시작 시간');
  const endTime = await requiredField(frame, 'input[id*="_new_form_cal_useToTm_calendaredit_input"], input[id*="_new_form_cal_toTm_calendaredit_input"]', '종료 시간');
  const title = await requiredField(frame, 'input[id*="_new_form_edt_aplyTtl_input"]', '제목');
  const location = await requiredField(frame, 'input[id*="_new_form_edt_utlzPlNm_input"]', '장소');
  const purpose = await requiredField(frame, 'textarea[id*="_new_form_ta_utlzCtnt_textarea"]', '목적');

  const filled = [];
  if (expertUse.paymentType) {
    await choosePaymentType(frame, expertUse.paymentType);
    filled.push('지급구분');
    filled.push(...await fillTypeSpecificFields(frame, expertUse));
  }
  if (await fillAndConfirm(startDate, String(expertUse.startDate || '').replace(/-/g, ''), '시작일')) filled.push('시작일');
  if (await fillAndConfirm(endDate, String(expertUse.endDate || '').replace(/-/g, ''), '종료일')) filled.push('종료일');
  if (expertUse.startTime) { await fillTime(startTime, expertUse.startTime, '시작'); filled.push('시작 시간'); }
  if (expertUse.endTime) { await fillTime(endTime, expertUse.endTime, '종료'); filled.push('종료 시간'); }
  if (expertUse.modality && await chooseVisibleCombo(frame, 'input[id*="_new_form_cmb_counslMthdFg_comboedit_input"]', expertUse.modality, '대면/비대면')) filled.push('대면/비대면');
  if (await fillAndConfirm(title, expertUse.title, '제목')) filled.push('제목');
  if (await fillAndConfirm(location, expertUse.location, '장소')) filled.push('장소');
  if (await fillAndConfirm(purpose, expertUse.purpose, '목적')) filled.push('목적');

  // The caller opens each upload area in SRnD before invoking its matching
  // function. Their files remain separate because the two areas have
  // independent document classifications in SRnD.
  const evidenceFiles = data.evidenceFiles || data.attachmentPath;
  const evidenceAttached = data.uploadEvidence ? await attachEvidenceFiles(page, evidenceFiles) : [];
  const bottomAttached = data.uploadBottomAttachments ? await attachBottomAttachmentFiles(page, data.bottomAttachmentFiles) : [];

  return {
    filled,
    attached: { evidence: evidenceAttached, bottom: bottomAttached },
    requiresUserReview: [
      '지급구분·세목/비용·기준단가를 화면의 조회 결과로 확인',
      '지급 대상자·주민번호·계좌·소득 정보를 사용자가 직접 확인 및 입력',
      '증빙서류와 지급 금액을 검토한 뒤 저장·신청·청구 등 최종 처리를 직접 수행',
    ],
  };
}

const RECIPIENT_SELECTORS = Object.freeze({
  expenseFormUpload: 'div[id*="_new_form_btn_outsidRecherUpload"]',
  addRecipient: 'div[id*="_new_form_btn_addRow"]',
  researcherMode: 'div[id*="_new_form_rdo_recherSel"]',
  receiptConfirm: 'div[id*="_new_form_btn_rcptCnfm"], div:has-text("수취인확인")',
});

function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients) || !recipients.length) return [];
  const seen = new Set();
  return recipients.map((recipient, index) => {
    const name = String(recipient.name || '').trim();
    if (!name) throw new Error(`지급사항 ${index + 1}행의 지급대상자 성명이 없습니다.`);
    const affiliation = String(recipient.affiliation || '').trim();
    const key = `${name}|${affiliation}`;
    if (seen.has(key)) throw new Error(`동일 지급대상자가 PDF 지급사항에 중복되었습니다: ${name}`);
    seen.add(key);
    return { ...recipient, name, affiliation };
  });
}

async function clickVisible(page, selector, label) {
  const controls = page.locator(selector);
  for (let index = 0, count = await controls.count(); index < count; index += 1) {
    const control = controls.nth(index);
    if (await control.isVisible().catch(() => false)) { await control.click(); return; }
  }
  throw new Error(`${label} 버튼을 찾지 못했습니다.`);
}

async function uploadExpenseForm(page, workbookPath, { allowUpload = false } = {}) {
  if (!workbookPath) return false;
  if (!/\.xlsx?m?$/i.test(workbookPath)) throw new Error('경비지급서식은 .xls, .xlsx 또는 .xlsm 파일이어야 합니다.');
  if (!allowUpload) throw new Error('테스트 모드에서는 경비지급서식 업로드를 실행하지 않습니다.');
  const oneTime = page.getByText('일회성경비지급자', { exact: true }).last();
  if (!await oneTime.isVisible().catch(() => false)) throw new Error('일회성경비지급자 선택 영역을 찾지 못했습니다.');
  await oneTime.click();
  await clickVisible(page, RECIPIENT_SELECTORS.expenseFormUpload, '경비지급 서식 업로드');
  return true;
}

async function addResearchers(page, recipients, { searchAndChoose } = {}) {
  const list = normalizeRecipients(recipients);
  if (!list.length) return [];
  if (typeof searchAndChoose !== 'function') throw new TypeError('연구원검색 팝업 처리기가 필요합니다.');
  const mode = page.getByText('SRnD등록 연구자', { exact: true }).last();
  if (!await mode.isVisible().catch(() => false)) throw new Error('SRnD등록 연구자 선택 영역을 찾지 못했습니다.');
  await mode.click();
  const notice = page.getByText('확인', { exact: true }).last();
  if (await notice.isVisible().catch(() => false)) await notice.click();
  for (const recipient of list) {
    await clickVisible(page, RECIPIENT_SELECTORS.addRecipient, '대상자추가');
    await searchAndChoose(recipient);
  }
  return list.map(item => item.name);
}

function createResearcherSearchHandler(page) {
  return async recipient => {
    const name = page.locator('input[id*="new_psnPopup_form_div_search_edt_user_nm_input"]').first();
    if (!await name.isVisible().catch(() => false)) throw new Error('연구원검색(멀티) 팝업의 성명 입력칸을 찾지 못했습니다.');
    await fillAndConfirm(name, recipient.name, '성명');
    await clickVisible(page, 'div[id*="new_psnPopup_form_div_search_btn_search"]', '조회');
    await sleep(500);
    const rows = page.locator('div[id*="new_psnPopup"] [id*="body_gridrow_"][id$="GridAreaContainerElement"]');
    const matched = [];
    for (let index = 0, count = await rows.count(); index < count; index += 1) {
      const row = rows.nth(index);
      const text = String(await row.textContent()).replace(/\s+/g, ' ').trim();
      if (text.includes(recipient.name) && (!recipient.affiliation || text.includes(recipient.affiliation))) matched.push(row);
    }
    if (matched.length !== 1) throw new Error(`${recipient.name}: PDF 소속과 일치하는 연구원 검색 결과가 ${matched.length}명입니다.`);
    await matched[0].locator('[id*="controlcheckbox"]').first().click();
    await clickVisible(page, 'div[id*="new_psnPopup_form_btn_ok"]', '확인');
  };
}

async function selectAllForReceiptConfirmation(page, { testMode = true } = {}) {
  if (testMode) return { selected: false, receiptConfirmed: false };
  const checkbox = page.locator('div[id*="_new_form_Grid01_head"] [id*="controlcheckbox"]').first();
  if (!await checkbox.isVisible().catch(() => false)) throw new Error('지급대상자 전체 선택 체크박스를 찾지 못했습니다.');
  await checkbox.click();
  await clickVisible(page, RECIPIENT_SELECTORS.receiptConfirm, '수취인확인');
  return { selected: true, receiptConfirmed: true };
}

module.exports = {
  fill, FORBIDDEN_FINAL_ACTIONS, TYPE_FIELD_RULES,
  attachFilesToOpenUploader, attachEvidenceFiles, attachBottomAttachmentFiles,
  RECIPIENT_SELECTORS, normalizeRecipients, uploadExpenseForm, addResearchers,
  createResearcherSearchHandler, selectAllForReceiptConfirmation,
};
