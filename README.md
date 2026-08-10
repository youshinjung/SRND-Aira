# SRND-Aira

SRnD 연구비 업무 자동화를 기능별로 새로 구현하기 위한 최소 작업 저장소입니다.

이 저장소에는 기존 대시보드나 완성된 자동화 기능이 들어 있지 않습니다. 코딩 에이전트가 동일한 규칙으로 새 기능을 조사하고 구현할 수 있도록 작업 절차, 안전 규칙, 공통 템플릿과 미구현 기능 목록만 제공합니다.

## 가장 먼저 읽을 문서

1. `AGENTS.md` — 코딩 에이전트 필수 지침
2. `docs/FEATURES.md` — 구현 대상 17개 기능 정본
3. `docs/WORKFLOW.md` — 조사·기록·테스트·완성 순서
4. `docs/SECURITY.md` — 개인정보 및 최종 처리 안전 규칙

## 구조

```text
SRND-Aira/
├─ AGENTS.md
├─ README.md
├─ docs/
│  ├─ FEATURES.md
│  ├─ WORKFLOW.md
│  └─ SECURITY.md
├─ templates/feature/
│  ├─ extract.js
│  ├─ fill.js
│  ├─ record.md
│  └─ sample.json
└─ src/features/
   └─ 01-... ~ 17-.../STATUS.md
```

새 기능을 시작할 때 `templates/feature/`의 네 파일을 해당 기능 폴더로 복사합니다. 템플릿 원본은 수정하지 않습니다.

## 현재 상태

모든 기능은 `미구현` 상태입니다. 기존 프로젝트의 완성 코드나 실제 데이터는 이관하지 않았습니다.
