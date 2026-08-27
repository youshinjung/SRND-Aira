'use strict';

function compact(value) {
  return String(value || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function parseDate(value, label) {
  const match = String(value).match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
  if (!match) throw new Error(`PDF의 '${label}' 날짜 형식이 올바르지 않습니다.`);
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function parseTime(value, label) {
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`PDF의 '${label}' 시간이 올바르지 않습니다.`);
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

const PAYMENT_TYPES = Object.freeze(['강사료', '원고료', '통역료', '번역료', '회의수당', '속기료', '자문료']);
const PDF_PAYMENT_TYPE_ALIASES = Object.freeze({ '강연/연사료': '강사료', '강연료': '강사료', '연사료': '강사료' });

// '구분' 값은 PDF 첫 부분의 사용내역서 기본정보 영역에서 읽는다. PDF의 표 구조가
// 텍스트로 풀릴 때 줄바꿈 위치가 달라질 수 있으므로, 고정 좌표나 셀 주소 대신 라벨의
// 같은 줄 또는 바로 다음 비어 있지 않은 줄을 후보로 사용한다.
const PAYMENT_TYPE_RULES = Object.freeze({
  강사료: { unit: '시간', required: ['rateCategory'] },
  원고료: { unit: '장', required: [] },
  통역료: { unit: '시간', required: ['interpretationType', 'languageCategory'] },
  번역료: { unit: '장', required: ['translationLanguageCategory'] },
  회의수당: { unit: '회', required: ['rateCategory'] },
  속기료: { unit: '시간', required: ['shorthandType'] },
  자문료: { unit: '시간', required: ['rateCategory'] },
});

function nonEmptyLines(text) {
  return text.split('\n').map(compact).filter(Boolean);
}

function valueNearLabel(text, labelPattern, label, stopPattern) {
  const lines = nonEmptyLines(text);
  const labelSource = `(?:${labelPattern.source})`;
  const labelOnly = new RegExp(`^${labelSource}\\s*[:：]?$`, labelPattern.flags.replace('g', ''));
  const sameLine = new RegExp(`^${labelSource}\\s*[:：]?\\s*(.+)$`, labelPattern.flags.replace('g', ''));
  const withinLine = new RegExp(`${labelSource}\\s*[:：]?\\s*([^\\n]+)`, labelPattern.flags.replace('g', ''));
  for (let index = 0; index < lines.length; index += 1) {
    const direct = lines[index].match(sameLine);
    if (direct && compact(direct[1])) return compact(direct[1]);
    const inline = lines[index].match(withinLine);
    if (inline && compact(inline[1])) return compact(inline[1]);
    if (!labelOnly.test(lines[index])) continue;
    const next = lines[index + 1] || '';
    if (next && !(stopPattern && stopPattern.test(next))) return next;
  }
  // 일부 PDF 추출기는 표의 짧은 라벨을 글자 단위 줄로 나눈다(예: '장' 다음 줄 '소').
  // 이 경우 라벨 두 줄 뒤의 첫 값을 사용하되, 고정 좌표는 사용하지 않는다.
  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!labelOnly.test(compact(`${lines[index]}${lines[index + 1]}`))) continue;
    const next = lines[index + 2];
    if (next && !(stopPattern && stopPattern.test(next))) return next;
  }
  throw new Error(`PDF의 '${label}' 항목 주변에서 값을 찾지 못했습니다. 자동입력을 중단합니다.`);
}

function optionalNearLabel(text, labelPattern, label, stopPattern) {
  try {
    return valueNearLabel(text, labelPattern, label, stopPattern);
  } catch {
    return '';
  }
}

function paymentTypeNearLabel(text) {
  const lines = nonEmptyLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const direct = line.match(/^(?:지급\s*)?구\s*분\s*[:：]?\s*(강사료|원고료|통역료|번역료|회의수당|속기료|자문료|강연\s*\/\s*연사료|강연료|연사료)(?:\s|$)/);
    if (direct) return PDF_PAYMENT_TYPE_ALIASES[compact(direct[1])] || compact(direct[1]);
    if (/^(?:지급\s*)?구\s*분\s*[:：]?$/.test(line)) {
      const next = compact(lines[index + 1]).replace(/\s+/g, '');
      if (PAYMENT_TYPES.includes(next)) return next;
      if (PDF_PAYMENT_TYPE_ALIASES[next]) return PDF_PAYMENT_TYPE_ALIASES[next];
    }
  }
  const paymentSection = text.search(/지\s*급\s*금\s*액\s*(?:산\s*출\s*내\s*역)?/);
  if (paymentSection >= 0) {
    const row = text.slice(paymentSection, paymentSection + 1200)
      .match(/강사료|원고료|통역료|번역료|회의수당|속기료|자문료|강연\s*\/\s*연사료|강연료|연사료/);
    if (row) {
      const value = compact(row[0]);
      return PDF_PAYMENT_TYPE_ALIASES[value] || value;
    }
  }
  // 기존 "전문가 활용 내역서"는 하단 '지급금액 산출내역' 표의 행으로 구분을 적는다.
  // 양식의 체크박스 헤더보다 아래쪽에 있는 마지막 구분값을 사용한다.
  const occurrences = [...text.matchAll(/강사료|원고료|통역료|번역료|회의수당|속기료|자문료|강연\s*\/\s*연사료|강연료|연사료/g)];
  if (occurrences.length) {
    const value = compact(occurrences[occurrences.length - 1][0]);
    return PDF_PAYMENT_TYPE_ALIASES[value] || value;
  }
  throw new Error("PDF의 상단 기본정보 영역에서 '구분'을 찾지 못했습니다. 자동입력을 중단합니다.");
}

function extractDateAndTimes(text) {
  const dateValue = optionalNearLabel(text, /(?:활용\s*)?일자|(?:활용\s*)?기간|일\s*시/, '활용일자/기간/일시');
  const dateMatches = dateValue.match(/\d{4}[.\-/\s]+\d{1,2}[.\-/\s]+\d{1,2}/g) || [];
  const activityDate = dateMatches.length ? parseDate(dateMatches[0], '활용일자') : '';

  const timeValue = optionalNearLabel(text, /(?:활용\s*)?시간|시\s*간/, '활용시간/시간');
  const times = timeValue.match(/\d{1,2}:\d{2}/g) || [];
  return {
    activityDate,
    startTime: times[0] ? parseTime(times[0], '시작') : '',
    endTime: times[1] ? parseTime(times[1], '종료') : '',
    timeValue,
  };
}

function extractUnitCount(text, timeValue) {
  const standardValue = optionalNearLabel(text, /시간\s*\/\s*회당\s*\/\s*장/, '시간/회당/장');
  const value = standardValue || timeValue || optionalNearLabel(text, /시간\s*\(\s*원고\s*페이지\s*수\s*\)/, '시간(원고 페이지 수)');
  const parenthesized = value.match(/\(\s*([\d,]+)\s*(?:시간|회|장)?\s*\)/);
  const amount = Number((parenthesized ? parenthesized[1] : (value.match(/[\d,]+/) || [''])[0]).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return amount;
}

function extractVariant(text, paymentType, overrides = {}) {
  const variant = {
    rateCategory: compact(overrides.rateCategory) || optionalNearLabel(text, /직급\s*\(\s*직위\s*\)/, '직급(직위)'),
    interpretationType: compact(overrides.interpretationType) || optionalNearLabel(text, /통역\s*구분/, '통역구분'),
    languageCategory: compact(overrides.languageCategory) || optionalNearLabel(text, /언어\s*구분/, '언어구분'),
    translationLanguageCategory: compact(overrides.translationLanguageCategory) || optionalNearLabel(text, /번역\s*언어\s*구분/, '번역언어구분'),
    shorthandType: compact(overrides.shorthandType) || optionalNearLabel(text, /속기\s*구분/, '속기구분'),
  };
  return variant;
}

/**
 * '전문가활용비 사용내역서' PDF에서 추출한 텍스트를 SRnD 입력 데이터로 변환한다.
 * 표의 고정 셀/좌표가 아니라 각 양식 영역의 라벨과 인접한 값을 기준으로 읽으며,
 * 개인정보·계좌정보는 의도적으로 반환하지 않는다.
 */
async function extract(input) {
  const text = typeof input === 'string' ? input : input && input.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('extract()에는 전문가활용비 사용내역서 PDF에서 추출한 텍스트를 전달해야 합니다.');
  }
  const normalized = text.replace(/\r/g, '');
  const paymentType = (() => {
    try { return paymentTypeNearLabel(normalized); } catch { return ''; }
  })();
  const { activityDate, startTime, endTime, timeValue } = extractDateAndTimes(normalized);
  const purpose = optionalNearLabel(
    normalized,
    /목\s*적\s*\(\s*활\s*용\s*내\s*용\s*\)|활\s*용\s*내\s*용|자\s*문\s*내\s*용|요\s*지|상\s*세\s*내\s*용/,
    '목적(활용내용)/요지',
    /^(?:지급\s*내역|개인정보|계좌\s*이체\s*정보|활용비)\b/,
  );
  const amountText = optionalNearLabel(normalized, /활용비|산출액/, '활용비/산출액');
  const amountMatch = amountText.match(/[\d,]+/);
  const extractedModality = optionalNearLabel(normalized, /대면\s*\/\s*비대면|진행\s*방식/, '대면/비대면');
  const modality = compact(input && input.overrides && input.overrides.modality) || extractedModality;

  return {
    feature: '03-전문가활용비',
    source: { kind: 'expert-use-pdf', layout: '전문가활용비 사용내역서' },
    expertUse: {
      paymentType,
      startDate: activityDate,
      endDate: activityDate,
      startTime,
      endTime,
      modality: /비대면/.test(modality) ? '비대면' : (/대면/.test(modality) ? '대면' : ''),
      unitCount: extractUnitCount(normalized, timeValue),
      unit: PAYMENT_TYPE_RULES[paymentType] ? PAYMENT_TYPE_RULES[paymentType].unit : '',
      title: optionalNearLabel(normalized, /제\s*목|과\s*제\s*명/, '제목/과제명', /^(?:목\s*적|활\s*용\s*내\s*용|장\s*소)\b/),
      location: optionalNearLabel(normalized, /장\s*소|활\s*용\s*장\s*소/, '장소', /^(?:제\s*목|목\s*적|활\s*용\s*내\s*용)\b/),
      purpose,
      activityAmount: amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0,
      variant: extractVariant(normalized, paymentType, input && input.overrides),
    },
    // 지급사항 표는 PDF 양식별 열 이름과 위치가 크게 달라질 수 있다. 상위 PDF
    // 레이아웃 판독기가 확인한 값만 전달받으며, 이름·소속·금액을 추측하지 않는다.
    recipients: input && Array.isArray(input.recipients) ? input.recipients : [],
    attachmentPath: input && typeof input === 'object' ? compact(input.attachmentPath) : '',
  };
}

module.exports = { extract, PAYMENT_TYPE_RULES, PAYMENT_TYPES };
