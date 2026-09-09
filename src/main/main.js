'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

const jiraClient = require('./jiraClient');
const aiSummary = require('./aiSummary');
const memoDb = require('./memoDb');

let mainWindow = null;
const appIconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');

// 처리되지 않은 Promise 거부로 앱 전체가 죽지 않도록 보호 (예: 아이콘 로딩 실패 등)
process.on('unhandledRejection', (err) => {
  console.error('처리되지 않은 Promise 오류:', err);
});

function setupApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: `${app.name} 정보` },
        { type: 'separator' },
        { role: 'services', label: '서비스' },
        { type: 'separator' },
        { role: 'hide', label: `${app.name} 숨기기` },
        { role: 'hideOthers', label: '기타 숨기기' },
        { role: 'unhide', label: '모두 표시' },
        { type: 'separator' },
        { role: 'quit', label: `${app.name} 종료` }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: '개발 메모 추가',
          accelerator: 'Alt+M',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:open-memo-create');
            }
          }
        },
        {
          label: '개발 메모 조회',
          accelerator: 'Alt+L',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:open-memo-list');
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: '창 닫기' } : { role: 'quit', label: '종료' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: '새로고침' },
        { role: 'forceReload', label: '강제 새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'resetZoom', label: '실제 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: '최소화' },
        { role: 'zoom', label: '확대/축소' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front', label: '모두 앞으로 가져오기' }
        ] : [
          { role: 'close', label: '닫기' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    // 아이콘 로딩 실패(패키징 누락 등)가 앱 실행 자체를 막지 않도록 방어
    try {
      app.dock.setIcon(appIconPath);
    } catch (err) {
      console.error('Dock 아이콘 설정 실패:', err);
    }
  }

  // SQLite DB 초기화
  try {
    await memoDb.getDb();
  } catch (err) {
    console.error('SQLite 초기화 오류:', err);
  }

  setupApplicationMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function buildJiraConfig(payload) {
  const { jiraUrl, email, token } = payload || {};
  if (!jiraUrl || !email || !token) {
    throw new Error('Jira 도메인, 이메일, API 토큰이 모두 필요합니다.');
  }
  return { jiraUrl: jiraUrl.replace(/\/$/, ''), email, token };
}

function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeMailtoUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'mailto:' && parsed.pathname.length > 0;
  } catch {
    return false;
  }
}

// Chrome으로 강제 실행, 실패 시(미설치 등) 기본 브라우저로 대체
function openInChrome(url) {
  return new Promise((resolve) => {
    let command;
    let args;
    if (process.platform === 'darwin') {
      command = 'open';
      args = ['-a', 'Google Chrome', url];
    } else if (process.platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', 'chrome', url];
    } else {
      command = 'google-chrome';
      args = [url];
    }
    execFile(command, args, (error) => {
      if (error) {
        shell.openExternal(url).finally(resolve);
      } else {
        resolve();
      }
    });
  });
}

// 이슈 검색: 종류에 따라 담당자 검색 또는 맨션 검색 수행
ipcMain.handle('jira:search', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  const { searchType, targetEmail, targetKeyword, statusKey, maxNum } = payload;

  if (searchType === 'mention') {
    return jiraClient.searchMentionedIssues(config, {
      email: targetEmail,
      keyword: targetKeyword,
      statusKey,
      maxResults: maxNum
    });
  }
  return jiraClient.searchAssignedIssues(config, {
    email: targetEmail,
    keyword: targetKeyword,
    statusKey,
    maxResults: maxNum
  });
});

// 이슈 상세 조회
ipcMain.handle('jira:getIssue', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  return jiraClient.getIssueDetail(payload.issueKey, config, payload.downloadDir);
});

// 이슈 상태 변경 가능한 트랜지션 목록 조회
ipcMain.handle('jira:getTransitions', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  return jiraClient.getAvailableTransitions(payload.issueKey, config);
});

// 이슈 상태 변경
ipcMain.handle('jira:transitionIssue', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  await jiraClient.transitionIssueStatus(payload.issueKey, payload.targetStatusName, config);
  return jiraClient.getIssueDetail(payload.issueKey, config, payload.downloadDir);
});

// 사용자 검색 (맨션 자동완성용)
ipcMain.handle('jira:searchUsers', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  return jiraClient.searchUsers(payload.query, config, payload.issueKey);
});

// 댓글 및 대댓글 등록
ipcMain.handle('jira:addComment', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  await jiraClient.addComment(payload.issueKey, payload.commentText, payload.parentId, config, payload.mentions);
  return jiraClient.getIssueDetail(payload.issueKey, config, payload.downloadDir);
});

// 웹 브라우저로 이슈 열기 (Chrome 우선 실행, mailto는 기본 메일 앱으로 실행)
ipcMain.handle('jira:openInBrowser', async (_event, webUrl) => {
  if (isSafeMailtoUrl(webUrl)) {
    await shell.openExternal(webUrl);
    return true;
  }
  if (!isSafeHttpUrl(webUrl)) {
    throw new Error('유효하지 않은 URL입니다.');
  }
  await openInChrome(webUrl);
  return true;
});

// 첨부파일 다운로드 폴더 선택 다이얼로그
ipcMain.handle('settings:chooseDownloadFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

// Antigravity CLI 기본 작업 폴더 경로 반환
ipcMain.handle('settings:getDefaultAgyWorkDir', () => {
  return path.join(app.getPath('home'), 'jira-tasks');
});

// 다운로드된 첨부파일을 기본 프로그램으로 열기
ipcMain.handle('shell:openPath', async (_event, filePath) => {
  if (!filePath) return '';
  return shell.openPath(filePath);
});

let markedParser = null;
async function getMarkedParser() {
  if (!markedParser) {
    const mod = await import('marked');
    markedParser = mod.marked || mod;
    if (typeof markedParser.setOptions === 'function') {
      markedParser.setOptions({
        gfm: true,
        breaks: true
      });
    }
  }
  return markedParser;
}

// 마크다운 HTML 렌더링
ipcMain.handle('util:renderMarkdown', async (_event, markdownText) => {
  try {
    const parser = await getMarkedParser();
    return parser.parse(markdownText || '');
  } catch (err) {
    console.error('마크다운 렌더링 실패:', err);
    return markdownText || '';
  }
});

// AI 요약 조회/생성
ipcMain.handle('ai:getSummary', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  const forceRefresh = Boolean(payload.forceRefresh);
  if (payload.aiModule === 'antigravity') {
    const defaultDir = path.join(app.getPath('home'), 'jira-tasks');
    const baseDir = (payload.agyWorkDir && payload.agyWorkDir.trim()) || defaultDir;
    const todayStr = aiSummary.getTodayString();
    const filesDir = path.join(baseDir, 'issues', todayStr, 'files');
    const issueDetail = await jiraClient.getIssueDetail(payload.issueKey, config, filesDir);
    return aiSummary.getOrCreateAntigravitySummary(issueDetail, forceRefresh, baseDir, payload.agySkill);
  }
  const issueDetail = await jiraClient.getIssueDetail(payload.issueKey, config, payload.downloadDir);
  return aiSummary.getOrCreateSummary(issueDetail, forceRefresh, payload.githubToken, payload.aiModels);
});

// 개발 메모 등록
ipcMain.handle('memo:create', async (_event, noteData) => {
  return memoDb.createNote(noteData);
});

// 개발 메모 목록 조회
ipcMain.handle('memo:list', async (_event, searchParams) => {
  return memoDb.getNotes(searchParams);
});

// 개발 메모 단건 조회
ipcMain.handle('memo:get', async (_event, id) => {
  return memoDb.getNoteById(id);
});

// 개발 메모 수정
ipcMain.handle('memo:update', async (_event, { id, data }) => {
  return memoDb.updateNote(id, data);
});

// 개발 메모 삭제
ipcMain.handle('memo:delete', async (_event, id) => {
  return memoDb.deleteNote(id);
});

// 선택된 개발 메모 AI 요약
ipcMain.handle('memo:summarize', async (_event, payload) => {
  const { ids, notes, aiConfig } = payload || {};
  let targetNotes = [];
  if (Array.isArray(ids) && ids.length > 0) {
    targetNotes = await memoDb.getNotesByIds(ids);
  } else if (Array.isArray(notes) && notes.length > 0) {
    targetNotes = notes;
  } else {
    throw new Error('요약할 개발 메모가 선택되지 않았습니다.');
  }
  return aiSummary.summarizeDevNotes(targetNotes, aiConfig);
});

