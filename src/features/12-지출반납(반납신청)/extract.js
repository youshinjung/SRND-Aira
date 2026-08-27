'use strict';

const FEATURE_ID = '12-지출반납-일반반납신청';

function objectInput(input) {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { throw new Error('입력 JSON을 해석할 수 없습니다.'); }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('일반 반납 신청 입력은 객체 또는 JSON 문자열이어야 합니다.');
  return input;
}

function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}은(는) 비어 있을 수 없습니다.`);
  return value.trim();
}

/** 실제 입력값은 호출 중 메모리에만 사용하며 저장하지 않는다. */
async function extract(input) {
  const source = objectInput(input);
  if ((source.refundType ?? '일반') !== '일반') throw new Error('이 모듈은 일반 반납 신청만 지원합니다.');
  return {
    featureId: FEATURE_ID,
    refundType: '일반',
    projectSearchText: text(source.projectSearchText, '과제 조회어'),
    title: text(source.title, '제목'),
    reason: text(source.reason, '반납 사유'),
    userReviewRequired: true,
    userSteps: [
      '과제, 원지출신청, 증빙 및 실제 입금 건을 직접 선택합니다.',
      '반납금액은 음수인지 확인하고 처리예정액·실입금액·입금목록 금액의 일치를 검토합니다.',
      '저장, 신청, 청구는 사용자가 직접 처리합니다.',
    ],
  };
}

module.exports = { extract, FEATURE_ID };
