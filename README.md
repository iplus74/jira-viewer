# Jira Viewer

Jira 이슈 목록을 열람하고 댓글 작성, 상태 변경, AI 기반 업무 요약, 개발 메모 관리를 처리할 수 있는 Electron 데스크톱 앱입니다.

## 기능
- 이슈 검색: 종류(이슈/맨션된 이슈), 상태, 이메일, 키워드(제목), 최대 개수 조건으로 Jira 이슈를 검색합니다(`src/main/jiraClient.js`).
  - 이슈: 담당자 == 이메일 조건
  - 맨션된 이슈: 담당자 != 이메일 이며 댓글에서 해당 사용자가 맨션되었으나 이후 본인의 답글이 없는 이슈
- 이슈 상세 보기: 설명/댓글(대댓글 포함) 표시, 상태 변경, 새로 고침, 브라우저(Chrome 우선)로 열기.
  - 설명/댓글의 이미지·첨부파일은 로컬로 다운로드해 썸네일/파일 칩으로 표시하며, 다운로드 폴더 미지정 시 `userData/attachment-cache`를 사용합니다.
- 댓글/대댓글 작성: 사용자 맨션(자동완성)과 이미지/파일 첨부를 지원합니다. 첨부파일은 업로드 후 댓글 본문에 링크로 삽입됩니다.
- AI 요약: 이슈 설명+댓글 기반 업무 요약을 생성하고 캐시합니다. 모듈은 설정에서 선택합니다.
  - **GitHub Copilot SDK** (`@github/copilot-sdk`): 모델 목록을 콤마로 지정하면 앞에서부터 순서대로 시도하고 실패 시 다음 모델로 대체합니다. GitHub 토큰을 비워두면 로컬 `copilot login` 인증을 사용합니다. 이슈가 요약 이후 변경되면 자동으로 재생성합니다.
  - **Antigravity CLI** (`agy`): 지정한 SKILL(기본 `jira-ai-task`)을 호출해 요약 파일을 생성합니다.
- 개발 메모: SQLite 기반의 메모 등록/조회/수정/삭제 및 AI 요약.
  - 종류(개발/노트), 상태(진행중/테스트/반영), 날짜별 내용 블록 여러 개, 관련 링크(Links) 지원
  - 기간·종류·키워드(제목+내용) 검색, 선택한 메모들의 AI 요약(복사 가능)
  - 메뉴 단축키: `Alt+M` 메모 추가, `Alt+L` 메모 조회
- 설정은 로컬 SQLite DB에 저장되며, Jira API 토큰과 GitHub 토큰은 OS 보안 저장소(`safeStorage`)로 암호화됩니다.

## 설정 항목
- Jira 도메인 URL, 계정 이메일, API 토큰
- 첨부파일 다운로드 폴더
- AI 요약 모듈(Copilot / Antigravity)
  - Copilot: GitHub 토큰(선택), 작업 모델 목록
  - Antigravity: SKILL 이름, 작업 폴더(기본 `~/jira-tasks`)

## 실행
```bash
npm install
npm start
```

CSS(Tailwind) 수정 시:
```bash
npm run build:css    # 1회 빌드
npm run watch:css    # 변경 감지 빌드
```

## 빌드 (electron-builder)
```bash
npm run dist:mac     # macOS .dmg (arm64)
npm run dist:win     # Windows .exe (NSIS)
npm run dist:linux   # Linux .AppImage
```
결과물은 `release/` 폴더에 생성됩니다.

## 폴더 구조
- `src/main/main.js` - Electron 메인 프로세스, 애플리케이션 메뉴, IPC 핸들러
- `src/main/jiraClient.js` - Jira REST API 연동 (검색/상세/댓글/첨부/상태변경/사용자 검색)
- `src/main/aiSummary.js` - AI 요약 생성/캐싱 (Copilot SDK, Antigravity CLI), 개발 메모 요약
- `src/main/memoDb.js` - SQLite(sql.js) 기반 개발 메모 및 앱 설정 저장
- `src/preload/preload.js` - contextBridge를 통한 안전한 IPC 노출
- `src/shared/attachmentMarker.js` - 첨부파일 마커 파싱 유틸
- `src/renderer/` - 검색/목록/상세/AI 요약/개발 메모 UI (HTML + Tailwind CSS + Vanilla JS)

## 데이터 저장 위치 (`app.getPath('userData')`)
- `dev_notes.sqlite` - 개발 메모(`dev_notes`) 및 앱 설정(`app_settings`)
- `issue-summaries/{이슈키}.summary.json` - Copilot AI 요약 캐시
- `attachment-cache/` - 다운로드 폴더 미지정 시 첨부파일 캐시

Antigravity 요약은 작업 폴더 하위의 `issues/{오늘날짜}/view_{이슈키}.md`, `tasks/{오늘날짜}/task_{이슈키}.md`를 사용합니다.