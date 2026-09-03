'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

const jiraClient = require('./jiraClient');
const aiSummary = require('./aiSummary');

let mainWindow = null;
const appIconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');

// 처리되지 않은 Promise 거부로 앱 전체가 죽지 않도록 보호 (예: 아이콘 로딩 실패 등)
process.on('unhandledRejection', (err) => {
  console.error('처리되지 않은 Promise 오류:', err);
});


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

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    // 아이콘 로딩 실패(패키징 누락 등)가 앱 실행 자체를 막지 않도록 방어
    try {
      app.dock.setIcon(appIconPath);
    } catch (err) {
      console.error('Dock 아이콘 설정 실패:', err);
    }
  }
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
    const baseDir = (payload.agyWorkDir && payload.agyWorkDir.trim()) || '/Users/yangsukim/data/work/house_sara/jira-tasks';
    const todayStr = aiSummary.getTodayString();
    const filesDir = path.join(baseDir, 'issues', todayStr, 'files');
    const issueDetail = await jiraClient.getIssueDetail(payload.issueKey, config, filesDir);
    return aiSummary.getOrCreateAntigravitySummary(issueDetail, forceRefresh, payload.agyWorkDir, payload.agySkill);
  }
  const issueDetail = await jiraClient.getIssueDetail(payload.issueKey, config, payload.downloadDir);
  return aiSummary.getOrCreateSummary(issueDetail, forceRefresh, payload.githubToken, payload.aiModels);
});
