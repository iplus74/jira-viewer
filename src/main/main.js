'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');

const jiraClient = require('./jiraClient');
const aiSummary = require('./aiSummary');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

// 이슈 검색: 종류에 따라 담당자 검색 또는 맨션 검색 수행
ipcMain.handle('jira:search', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  const { searchType, targetEmail, statusKey, maxNum } = payload;

  if (searchType === 'mention') {
    return jiraClient.searchMentionedIssues(config, {
      email: targetEmail,
      statusKey,
      maxResults: maxNum
    });
  }
  return jiraClient.searchAssignedIssues(config, {
    email: targetEmail,
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

// 웹 브라우저로 이슈 열기
ipcMain.handle('jira:openInBrowser', async (_event, webUrl) => {
  await shell.openExternal(webUrl);
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

// AI 요약 조회/생성
ipcMain.handle('ai:getSummary', async (_event, payload) => {
  const config = buildJiraConfig(payload);
  const forceRefresh = Boolean(payload.forceRefresh);
  const issueDetail = await jiraClient.getIssueDetail(payload.issueKey, config);
  return aiSummary.getOrCreateSummary(issueDetail, forceRefresh, payload.githubToken);
});
