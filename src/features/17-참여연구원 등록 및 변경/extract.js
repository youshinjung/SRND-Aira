'use strict';

const FEATURE_ID = '17-참여연구원-변경신청';

function asObject(input) {
  if (typeof input === 'string') {
    try { return JSON.parse(input); }
    catch { throw new Error('입력 JSON을 해석할 수 없습니다.'); }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('변경신청 입력은 객체 또는 JSON 문자열이어야 합니다.');
  }
  return input;
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}은(는) 비어 있을 수 없습니다.`);
  return value.trim();
}

function optionalRate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('계상률은 0 이상 100 이하의 숫자여야 합니다.');
  }
  return value;
}

/** 실제 입력값은 호출 중 메모리에만 머물며 파일로 저장하지 않는다. */
async function extract(input) {
  const source = asObject(input);
  const requestType = source.requestType ?? '변경신청';
  if (requestType !== '변경신청') {
    throw new Error('이 모듈은 참여연구원 변경신청만 지원합니다. 등록신청은 지원하지 않습니다.');
  }
  return {
    featureId: FEATURE_ID,
    requestType,
    projectSearchText: requiredText(source.projectSearchText, '과제 조회어'),
    changeReason: requiredText(source.changeReason, '변경 사유'),
    calculationRatePercent: optionalRate(source.calculationRatePercent),
    userReviewRequired: true,
    userSteps: [
      'SRnD 로그인과 위임계정 전환을 완료합니다.',
      '변경신청 화면에서 과제 조회 결과와 대상 참여연구원 행을 직접 선택합니다.',
      '변경구분 및 지급조건 상세 필드가 업무 판단과 일치하는지 확인합니다.',
      '자동 입력 후 저장 및 저장 확인 팝업은 사용자가 직접 처리합니다.',
    ],
  };
}

module.exports = { extract, FEATURE_ID };
