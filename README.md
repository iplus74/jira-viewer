# Jira Viewer

Jira 이슈 목록을 열람하고 상태 업데이트, AI 기반 내용 요약을 처리할 수 있는 Electron 데스크톱 앱입니다.

## 기능
- 이슈 검색: 종류(이슈/맨션된 이슈), 상태, 이메일, 최대 개수 조건으로 Jira 이슈를 검색합니다.
  - `jira-finder/index.js`의 `downloadAllIssues()`/`downloadMentionList()` JQL 로직을 동일하게 재구현했습니다(`src/main/jiraClient.js`).
- 이슈 상세 보기: 설명/댓글(대댓글 포함) 표시, 상태 변경, 브라우저로 열기.
- AI 요약: `@github/copilot-sdk`로 이슈 설명+댓글 기반 업무 요약을 생성하고 로컬 파일로 캐시합니다. 이슈가 이후 변경되면 자동으로 재생성합니다.
- 설정(Jira 도메인/이메일/API 토큰, 최근 검색 조건)은 `localStorage`에 저장됩니다.

## 실행
```bash
npm install
npm start
```

## 빌드 (electron-builder)
```bash
npm run dist:mac     # macOS .dmg
npm run dist:win     # Windows .exe (NSIS)
npm run dist:linux   # Linux .AppImage
```

## 폴더 구조
- `src/main/main.js` - Electron 메인 프로세스, IPC 핸들러
- `src/main/jiraClient.js` - Jira REST API 연동 (검색/상세/상태변경)
- `src/main/aiSummary.js` - AI 요약 생성/캐싱 (copilot-sdk)
- `src/preload/preload.js` - contextBridge를 통한 안전한 IPC 노출
- `src/renderer/` - 검색/목록/상세/AI 요약 팝업 UI (Vanilla HTML/CSS/JS)

## 요약 파일 저장 위치
`app.getPath('userData')/issue-summaries/{이슈키}.summary.json`

## 보안 참고
Jira API 토큰은 `localStorage`에 저장되며 앱 사용자 계정 프로필 내에서만 접근 가능합니다. 공유 PC 사용 시 설정 값을 사용 후 삭제하는 것을 권장합니다.
