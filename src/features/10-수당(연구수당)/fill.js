'use strict';

/**
 * 공통 자동입력 템플릿
 *
 * - 외부 Chrome을 사용합니다.
 * - 로그인과 위임계정 전환은 사용자가 직접 수행합니다.
 * - 저장·신청·청구·승인·삭제 등 최종 동작은 절대 자동화하지 않습니다.
 * - 실제 선택자는 화면 기록으로 확인한 뒤 구현합니다.
 */

const FORBIDDEN_FINAL_ACTIONS = Object.freeze([
  '저장',
  '신청',
  '신청취소', // 실제 화면(수당 지급신청 팝업)에서 확인됨 — record.md 참고
  '변경신청',
  '발급신청',
  '제출',
  '청구',
  '승인',
  '삭제',
]);

async function fill(page, data) {
  void page;
  void data;
  throw new Error('미구현 기능입니다. 실제 화면 기록 후 자동입력 로직을 작성하세요.');
}

module.exports = { fill, FORBIDDEN_FINAL_ACTIONS };
