'use strict';

function compact(value) {
  return String(value || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function required(text, pattern, label) {
  const match = text.match(pattern);
  const value = match && compact(match[1]);
  if (!value) throw new Error(`PDF에서 '${label}' 정보를 찾지 못했습니다. 자동입력을 중단합니다.`);
  return value;
}

function toPositiveNumber(value, label) {
  const number = Number(String(value).replace(/,/g, ''));
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`PDF의 '${label}' 값이 올바르지 않습니다. 자동입력을 중단합니다.`);
  }
  return number;
}

function attendeeNames(text, start, end) {
  const startIndex = text.search(start);
  if (startIndex < 0) return [];
  const section = text.slice(startIndex);
  const endIndex = section.search(end);
  const names = (endIndex < 0 ? section : section.slice(0, endIndex)).match(/[가-힣]{2,5}/g) || [];
  const nonNameWords = [
    '\uB0B4\uBD80', '\uC678\uBD80', '\uCC38\uC11D', '\uC5F0\uAD6C', '\uACFC\uC81C',
    '\uC11C\uC6B8', '\uC18C\uC18D', '\uBBF8\uCC38\uC5EC', '\uD68C\uC758', '\uC131\uBA85',
    '\uAD6C\uBD84', '\uB300\uD559', '\uD559\uACFC', '\uD559\uBD80', '\uBD80\uC11C',
  ];
  return [...new Set(names)].filter(name => !nonNameWords.some(word => name.includes(word)));
}

function parseDate(value) {
  const match = value.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!match) throw new Error("PDF에서 '회의일시' 형식을 확인하지 못했습니다. 자동입력을 중단합니다.");
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function parseTime(value, label) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`PDF의 '${label}' 값이 올바른 시간이 아닙니다.`);
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/**
 * PDF에서 이미 추출한 텍스트를 회의비 입력 데이터로 변환합니다.
 * PDF 파일과 실제 추출 결과는 호출자가 메모리에서만 관리합니다.
 */
async function extract(input) {
  const text = typeof input === 'string' ? input : input && input.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('extract()에는 PDF에서 추출한 텍스트를 전달해야 합니다.');
  }

  const normalized = text.replace(/\r/g, '');
  const time = normalized.match(/회의시간\s*(\d{1,2}:\d{2})\s*[~\-]\s*(\d{1,2}:\d{2})/);
  if (!time) throw new Error("PDF에서 '회의시간'을 찾지 못했습니다. 자동입력을 중단합니다.");
  const expense = normalized.match(/식음료대\s*금액\s*([\d,]+)\s*원\s*인원\s*(\d+)\s*명/);
  if (!expense) throw new Error("PDF에서 '식음료대 금액'과 '인원'을 찾지 못했습니다. 자동입력을 중단합니다.");

  const amount = toPositiveNumber(expense[1], '식음료대 금액');
  const attendeeCount = toPositiveNumber(expense[2], '참석 인원');
  const projectAttendees = attendeeNames(
    normalized,
    /내부참석자\s*\(\s*과제참여\s*연구원\s*\)/,
    /내부참석자\s*\(\s*서울대\s*소속\s*연구과제\s*미참여자\s*\)/,
  );
  const nonProjectAttendees = attendeeNames(
    normalized,
    /내부참석자\s*\(\s*서울대\s*소속\s*연구과제\s*미참여자\s*\)/,
    /외부참석자/,
  );

  return {
    feature: '02-회의비',
    meeting: {
      date: parseDate(required(normalized, /회의일시\s*([^\n]+)/, '회의일시')),
      startTime: parseTime(time[1], '시작시간'),
      endTime: parseTime(time[2], '종료시간'),
      location: required(normalized, /회의장소\s*([^\n]+)/, '회의장소'),
      purpose: required(normalized, /회의목적\s*:\s*([\s\S]*?)\s*회의결과\s*:/, '회의목적'),
      content: required(normalized, /회의결과\s*:\s*([\s\S]*?)\s*회의장소\s*/, '회의결과'),
    },
    attendees: {
      projectParticipants: projectAttendees,
      internalNonProjectParticipants: nonProjectAttendees,
      declaredCount: attendeeCount,
    },
    payment: {
      foodAndBeverageAmount: amount,
      attendeeCount,
      perPersonAmount: Math.floor(amount / attendeeCount),
    },
    attachmentPath: input && typeof input === 'object' ? compact(input.attachmentPath) : '',
  };
}

module.exports = { extract };
