'use strict';

const FORBIDDEN_FINAL_ACTIONS = Object.freeze([
  '저장', '신청', '변경신청', '발급신청', '제출', '청구', '승인', '삭제', '확인',
]);

const SELECTORS = Object.freeze({
  changeReason: '#mainframe_VFrameSet_HFrameSet_VFrameSet_FrameSet_0120051100_form_div_workForm_tab_paticp_tab3_div_rprjMain_ta_resnCtnt_textarea',
  calculationRate: '#mainframe_VFrameSet_HFrameSet_VFrameSet_FrameSet_0120051100_form_div_workForm_tab_paticp_tab3_tab3div_mae_paticpRate_input',
});

function validatedData(data) {
  if (!data || typeof data !== 'object') throw new Error('검토된 변경신청 데이터가 필요합니다.');
  if (data.requestType !== '변경신청') throw new Error('이 자동입력은 변경신청만 지원합니다.');
  if (typeof data.changeReason !== 'string' || !data.changeReason.trim()) throw new Error('변경 사유가 필요합니다.');
  if (data.calculationRatePercent !== undefined &&
      (!Number.isFinite(data.calculationRatePercent) || data.calculationRatePercent < 0 || data.calculationRatePercent > 100)) {
    throw new Error('계상률은 0 이상 100 이하의 숫자여야 합니다.');
  }
  return data;
}

/**
 * 전제: 사용자가 외부 Chrome에서 로그인·위임계정 전환, 과제 선택, 대상 연구원
 * 행 선택 및 변경구분 판단을 끝낸 상태다. 이 함수는 저장 직전에 반드시 멈춘다.
 */
async function fill(page, data) {
  if (!page || typeof page.locator !== 'function') throw new Error('외부 Chrome에 연결된 Playwright page가 필요합니다.');
  const reviewed = validatedData(data);

  const reason = page.locator(SELECTORS.changeReason);
  await reason.waitFor({ state: 'visible', timeout: 10_000 });
  await reason.fill(reviewed.changeReason);
  await reason.blur();

  if (reviewed.calculationRatePercent !== undefined) {
    const rate = page.locator(SELECTORS.calculationRate);
    await rate.waitFor({ state: 'visible', timeout: 10_000 });
    await rate.fill(String(reviewed.calculationRatePercent));
    await rate.blur();
  }

  return {
    status: 'ready_for_user_review',
    filledFields: ['신청내용', ...(reviewed.calculationRatePercent === undefined ? [] : ['계상률/월 지급액 비율'])],
    remainingUserSteps: [
      '과제와 대상 참여연구원 행, 변경구분 및 지급조건 상세 필드를 검토합니다.',
      '저장 및 저장 확인 팝업 처리는 사용자가 직접 수행합니다.',
    ],
  };
}

module.exports = { fill, FORBIDDEN_FINAL_ACTIONS, SELECTORS };
