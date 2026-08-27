'use strict';

const FORBIDDEN_FINAL_ACTIONS = Object.freeze(['저장', '신청', '청구', '삭제', '신청취소', '확인']);
const SELECTORS = Object.freeze({
  title: '#mainframe_VFrameSet_HFrameSet_VFrameSet_FrameSet_0120180000_new_form_edt_aplyTtl_input',
  reason: '#mainframe_VFrameSet_HFrameSet_VFrameSet_FrameSet_0120180000_new_form_txt_aplyCtnt_input',
});

function validate(data) {
  if (!data || data.refundType !== '일반') throw new Error('이 자동입력은 일반 반납 신청만 지원합니다.');
  if (typeof data.title !== 'string' || !data.title.trim() || typeof data.reason !== 'string' || !data.reason.trim()) {
    throw new Error('제목과 반납 사유가 필요합니다.');
  }
  return data;
}

/** 과제·원지출·증빙·입금 건을 사용자가 선택한 뒤, 저장 직전에 멈춘다. */
async function fill(page, data) {
  if (!page || typeof page.locator !== 'function') throw new Error('외부 Chrome에 연결된 Playwright page가 필요합니다.');
  const reviewed = validate(data);
  for (const [selector, value] of [[SELECTORS.title, reviewed.title], [SELECTORS.reason, reviewed.reason]]) {
    const field = page.locator(selector);
    await field.waitFor({ state: 'visible', timeout: 10_000 });
    await field.fill(value);
    await field.blur();
  }
  return {
    status: 'ready_for_user_review',
    filledFields: ['제목', '반납 사유'],
    remainingUserSteps: ['반납금액 음수와 처리예정액·실입금액·입금목록 금액의 일치를 검토합니다.', '저장, 신청, 청구는 사용자가 직접 처리합니다.'],
  };
}

module.exports = { fill, FORBIDDEN_FINAL_ACTIONS, SELECTORS };
