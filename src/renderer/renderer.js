'use strict';

const STORAGE_KEYS = {
  jiraUrl: 'jv.jiraUrl',
  email: 'jv.email',
  token: 'jv.token',
  downloadDir: 'jv.downloadDir',
  aiModule: 'jv.aiModule',
  githubToken: 'jv.githubToken',
  aiModels: 'jv.aiModels',
  agySkill: 'jv.agySkill',
  agyWorkDir: 'jv.agyWorkDir',
  lastSearch: 'jv.lastSearch'
};

const state = {
  currentIssues: [],
  currentIssueKey: null,
  currentIssueDetail: null
};

// 인메모리 설정 캐시
let appConfig = {
  jiraUrl: '',
  email: '',
  token: '',
  downloadDir: '',
  aiModule: 'copilot',
  githubToken: '',
  aiModels: '',
  agySkill: 'jira-ai-task',
  agyWorkDir: '',
  lastSearch: '{}'
};

// 모듈 변경 시 이전 입력값 보존용
let currentSelectedAiModule = 'copilot';

// ---- 설정(SQLite DB + 인메모리 캐시) ----
async function loadConfigFromDb() {
  try {
    let dbSettings = {};
    if (window.settingsApi?.getAll) {
      dbSettings = await window.settingsApi.getAll() || {};
    }

    const hasDbSettings = Object.keys(dbSettings).length > 0;

    if (hasDbSettings) {
      appConfig = {
        jiraUrl: dbSettings.jiraUrl ?? '',
        email: dbSettings.email ?? '',
        token: dbSettings.token ?? '',
        downloadDir: dbSettings.downloadDir ?? '',
        aiModule: dbSettings.aiModule || 'copilot',
        githubToken: dbSettings.githubToken ?? '',
        aiModels: dbSettings.aiModels ?? '',
        agySkill: dbSettings.agySkill || 'jira-ai-task',
        agyWorkDir: dbSettings.agyWorkDir ?? '',
        lastSearch: dbSettings.lastSearch ?? '{}'
      };
    } else {
      // DB에 설정이 없으면 기존 localStorage 값으로 마이그레이션
      appConfig = {
        jiraUrl: localStorage.getItem(STORAGE_KEYS.jiraUrl) || '',
        email: localStorage.getItem(STORAGE_KEYS.email) || '',
        token: localStorage.getItem(STORAGE_KEYS.token) || '',
        downloadDir: localStorage.getItem(STORAGE_KEYS.downloadDir) || '',
        aiModule: localStorage.getItem(STORAGE_KEYS.aiModule) || 'copilot',
        githubToken: localStorage.getItem(STORAGE_KEYS.githubToken) || '',
        aiModels: localStorage.getItem(STORAGE_KEYS.aiModels) || '',
        agySkill: localStorage.getItem(STORAGE_KEYS.agySkill) || 'jira-ai-task',
        agyWorkDir: localStorage.getItem(STORAGE_KEYS.agyWorkDir) || '',
        lastSearch: localStorage.getItem(STORAGE_KEYS.lastSearch) || '{}'
      };

      if (appConfig.jiraUrl || appConfig.email || appConfig.token || appConfig.downloadDir || appConfig.githubToken || appConfig.agyWorkDir) {
        if (window.settingsApi?.save) {
          await window.settingsApi.save(appConfig);
        }
      }
    }

    if (!appConfig.agyWorkDir && window.jiraApi?.getDefaultAgyWorkDir) {
      const defaultDir = await window.jiraApi.getDefaultAgyWorkDir();
      if (defaultDir) {
        appConfig.agyWorkDir = defaultDir;
      }
    }
  } catch (err) {
    console.error('SQLite DB 설정 로드 실패:', err);
  }

  currentSelectedAiModule = appConfig.aiModule || 'copilot';
  return appConfig;
}

function loadConfig() {
  return { ...appConfig };
}

async function saveConfig(newValues) {
  appConfig = {
    ...appConfig,
    ...newValues
  };

  // SQLite DB 저장
  if (window.settingsApi?.save) {
    try {
      await window.settingsApi.save(appConfig);
    } catch (err) {
      console.error('SQLite DB 설정 저장 실패:', err);
    }
  }

  // localStorage 동기화 (호환성 보장)
  localStorage.setItem(STORAGE_KEYS.jiraUrl, appConfig.jiraUrl || '');
  localStorage.setItem(STORAGE_KEYS.email, appConfig.email || '');
  localStorage.setItem(STORAGE_KEYS.token, appConfig.token || '');
  localStorage.setItem(STORAGE_KEYS.downloadDir, appConfig.downloadDir || '');
  localStorage.setItem(STORAGE_KEYS.aiModule, appConfig.aiModule || 'copilot');
  localStorage.setItem(STORAGE_KEYS.githubToken, appConfig.githubToken || '');
  localStorage.setItem(STORAGE_KEYS.aiModels, appConfig.aiModels || '');
  localStorage.setItem(STORAGE_KEYS.agySkill, appConfig.agySkill || 'jira-ai-task');
  localStorage.setItem(STORAGE_KEYS.agyWorkDir, appConfig.agyWorkDir || '');
  localStorage.setItem(STORAGE_KEYS.lastSearch, appConfig.lastSearch || '{}');
}

// 콤마로 구분된 모델 목록 문자열을 공백 제거된 배열로 변환
function parseAiModels(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function loadLastSearch() {
  try {
    const raw = appConfig.lastSearch || localStorage.getItem(STORAGE_KEYS.lastSearch) || '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLastSearch(search) {
  const jsonStr = JSON.stringify(search || {});
  appConfig.lastSearch = jsonStr;
  localStorage.setItem(STORAGE_KEYS.lastSearch, jsonStr);
  if (window.settingsApi?.save) {
    window.settingsApi.save({ lastSearch: jsonStr }).catch(console.error);
  }
}

// ---- DOM refs ----
const els = {
  settingsToggle: document.getElementById('settings-toggle'),
  settingsPanel: document.getElementById('settings-panel'),
  cfgJiraUrl: document.getElementById('cfg-jiraUrl'),
  cfgEmail: document.getElementById('cfg-email'),
  cfgToken: document.getElementById('cfg-token'),
  cfgDownloadDir: document.getElementById('cfg-downloadDir'),
  cfgChooseFolder: document.getElementById('cfg-choose-folder'),
  cfgAiModule: document.getElementById('cfg-aiModule'),
  copilotSettingsGroup: document.getElementById('copilot-settings-group'),
  antigravitySettingsGroup: document.getElementById('antigravity-settings-group'),
  cfgGithubToken: document.getElementById('cfg-githubToken'),
  cfgAiModels: document.getElementById('cfg-aiModels'),
  cfgAgySkill: document.getElementById('cfg-agySkill'),
  cfgAgyWorkDir: document.getElementById('cfg-agyWorkDir'),
  cfgChooseAgyFolder: document.getElementById('cfg-choose-agy-folder'),
  cfgSave: document.getElementById('cfg-save'),
  cfgCancel: document.getElementById('cfg-cancel'),

  searchScreen: document.getElementById('search-screen'),
  searchType: document.getElementById('search-type'),
  searchStatus: document.getElementById('search-status'),
  searchEmail: document.getElementById('search-email'),
  searchKeyword: document.getElementById('search-keyword'),
  searchMaxNum: document.getElementById('search-maxnum'),
  searchBtn: document.getElementById('search-btn'),
  searchStatusMsg: document.getElementById('search-status-msg'),
  issueList: document.getElementById('issue-list'),

  detailScreen: document.getElementById('detail-screen'),
  backBtn: document.getElementById('back-btn'),
  statusSelect: document.getElementById('status-select'),
  statusApplyBtn: document.getElementById('status-apply-btn'),
  aiSummaryBtn: document.getElementById('ai-summary-btn'),
  refreshDetailBtn: document.getElementById('refresh-detail-btn'),
  openBrowserBtn: document.getElementById('open-browser-btn'),
  issueDetail: document.getElementById('issue-detail'),

  aiModal: document.getElementById('ai-summary-modal'),
  aiModalClose: document.getElementById('ai-modal-close'),
  aiSummaryMeta: document.getElementById('ai-summary-meta'),
  aiSummaryText: document.getElementById('ai-summary-text'),
  aiRefreshBtn: document.getElementById('ai-refresh-btn'),

  // 개발 메모 퀵버튼
  quickMemoCreateBtn: document.getElementById('quick-memo-create-btn'),
  quickMemoListBtn: document.getElementById('quick-memo-list-btn'),

  // 개발 메모 추가 모달
  memoCreateModal: document.getElementById('memo-create-modal'),
  memoCreateTitle: document.getElementById('memo-create-title'),
  memoCreateType: document.getElementById('memo-create-type'),
  memoCreateStatus: document.getElementById('memo-create-status'),
  memoCreateContentsContainer: document.getElementById('memo-create-contents-container'),
  memoCreateAddContentBtn: document.getElementById('memo-create-add-content-btn'),
  memoCreateLinksContainer: document.getElementById('memo-create-links-container'),
  memoCreateAddLinkBtn: document.getElementById('memo-create-add-link-btn'),
  memoCreateError: document.getElementById('memo-create-error'),
  memoCreateSaveBtn: document.getElementById('memo-create-save-btn'),
  memoCreateCancelBtn: document.getElementById('memo-create-cancel-btn'),
  memoCreateCloseX: document.getElementById('memo-create-close-x'),

  // 개발 메모 목록 모달
  memoListModal: document.getElementById('memo-list-modal'),
  memoTotalCount: document.getElementById('memo-total-count'),
  memoFilterStart: document.getElementById('memo-filter-start'),
  memoFilterEnd: document.getElementById('memo-filter-end'),
  memoFilterType: document.getElementById('memo-filter-type'),
  memoFilterKeyword: document.getElementById('memo-filter-keyword'),
  memoSearchBtn: document.getElementById('memo-search-btn'),
  memoFilterResetBtn: document.getElementById('memo-filter-reset-btn'),
  memoSelectAll: document.getElementById('memo-select-all'),
  memoTableBody: document.getElementById('memo-table-body'),
  memoEmptyMsg: document.getElementById('memo-empty-msg'),
  memoSelectedCount: document.getElementById('memo-selected-count'),
  memoOpenCreateFromListBtn: document.getElementById('memo-open-create-from-list-btn'),
  memoAiSummaryBtn: document.getElementById('memo-ai-summary-btn'),
  memoListCloseBtn: document.getElementById('memo-list-close-btn'),
  memoListCloseX: document.getElementById('memo-list-close-x'),

  // 개발 메모 상세 모달
  memoDetailModal: document.getElementById('memo-detail-modal'),
  memoDetailHeaderTitle: document.getElementById('memo-detail-header-title'),
  memoDetailId: document.getElementById('memo-detail-id'),
  memoDetailTitle: document.getElementById('memo-detail-title'),
  memoDetailType: document.getElementById('memo-detail-type'),
  memoDetailStatus: document.getElementById('memo-detail-status'),
  memoDetailContentsContainer: document.getElementById('memo-detail-contents-container'),
  memoDetailAddContentBtn: document.getElementById('memo-detail-add-content-btn'),
  memoDetailLinksContainer: document.getElementById('memo-detail-links-container'),
  memoDetailAddLinkBtn: document.getElementById('memo-detail-add-link-btn'),
  memoDetailMeta: document.getElementById('memo-detail-meta'),
  memoDetailError: document.getElementById('memo-detail-error'),
  memoDetailDeleteBtn: document.getElementById('memo-detail-delete-btn'),
  memoDetailSaveBtn: document.getElementById('memo-detail-save-btn'),
  memoDetailBackBtn: document.getElementById('memo-detail-back-btn'),
  memoDetailCloseX: document.getElementById('memo-detail-close-x'),

  // 개발 메모 AI 요약 모달
  memoAiModal: document.getElementById('memo-ai-modal'),
  memoAiMeta: document.getElementById('memo-ai-meta'),
  memoAiLoading: document.getElementById('memo-ai-loading'),
  memoAiText: document.getElementById('memo-ai-text'),
  memoAiCopyBtn: document.getElementById('memo-ai-copy-btn'),
  memoAiCloseBtn: document.getElementById('memo-ai-close-btn'),
  memoAiCloseX: document.getElementById('memo-ai-close-x')
};

function toggleAiModuleSettings(module) {
  const isCopilot = module !== 'antigravity';
  if (els.copilotSettingsGroup) els.copilotSettingsGroup.classList.toggle('hidden', !isCopilot);
  if (els.antigravitySettingsGroup) els.antigravitySettingsGroup.classList.toggle('hidden', isCopilot);
}

function handleAiModuleChange(newModule) {
  // 1. 현재 화면에 표시되었던 모듈의 입력값을 appConfig에 보존
  if (currentSelectedAiModule === 'copilot') {
    appConfig.githubToken = els.cfgGithubToken.value.trim();
    appConfig.aiModels = els.cfgAiModels.value.trim();
  } else if (currentSelectedAiModule === 'antigravity') {
    appConfig.agySkill = (els.cfgAgySkill?.value.trim()) || 'jira-ai-task';
    appConfig.agyWorkDir = els.cfgAgyWorkDir?.value.trim() || '';
  }

  // 2. 새로 선택된 모듈의 이전 저장값/기본값을 폼에 복원
  if (newModule === 'copilot') {
    els.cfgGithubToken.value = appConfig.githubToken || '';
    els.cfgAiModels.value = appConfig.aiModels || '';
  } else if (newModule === 'antigravity') {
    if (els.cfgAgySkill) els.cfgAgySkill.value = appConfig.agySkill || 'jira-ai-task';
    if (els.cfgAgyWorkDir) els.cfgAgyWorkDir.value = appConfig.agyWorkDir || '';
  }

  currentSelectedAiModule = newModule;
  toggleAiModuleSettings(newModule);
}

// ---- 초기화 ----
async function initSettingsForm() {
  const cfg = loadConfig();
  els.cfgJiraUrl.value = cfg.jiraUrl || '';
  els.cfgEmail.value = cfg.email || '';
  els.cfgToken.value = cfg.token || '';
  els.cfgDownloadDir.value = cfg.downloadDir || '';
  if (els.cfgAiModule) {
    els.cfgAiModule.value = cfg.aiModule || 'copilot';
    currentSelectedAiModule = cfg.aiModule || 'copilot';
  }
  els.cfgGithubToken.value = cfg.githubToken || '';
  els.cfgAiModels.value = cfg.aiModels || '';
  if (els.cfgAgySkill) els.cfgAgySkill.value = cfg.agySkill || 'jira-ai-task';
  if (els.cfgAgyWorkDir) {
    if (cfg.agyWorkDir) {
      els.cfgAgyWorkDir.value = cfg.agyWorkDir;
    } else if (window.jiraApi?.getDefaultAgyWorkDir) {
      els.cfgAgyWorkDir.value = await window.jiraApi.getDefaultAgyWorkDir();
    } else {
      els.cfgAgyWorkDir.value = '';
    }
  }
  toggleAiModuleSettings(cfg.aiModule || 'copilot');
}

function initSearchForm() {
  const last = loadLastSearch();
  if (last.searchType) els.searchType.value = last.searchType;
  if (last.statusKey) els.searchStatus.value = last.statusKey;
  if (last.targetEmail !== undefined) els.searchEmail.value = last.targetEmail;
  else els.searchEmail.value = loadConfig().email;
  if (last.targetKeyword) els.searchKeyword.value = last.targetKeyword;
  if (last.maxNum) els.searchMaxNum.value = last.maxNum;
}

els.settingsToggle.addEventListener('click', async () => {
  const willShow = els.settingsPanel.classList.contains('hidden');
  if (willShow) {
    await initSettingsForm();
  }
  els.settingsPanel.classList.toggle('hidden');
});

els.cfgCancel.addEventListener('click', async () => {
  await initSettingsForm();
  els.settingsPanel.classList.add('hidden');
});

if (els.cfgAiModule) {
  els.cfgAiModule.addEventListener('change', () => {
    handleAiModuleChange(els.cfgAiModule.value);
  });
}

els.cfgChooseFolder.addEventListener('click', async () => {
  const selected = await window.jiraApi.chooseDownloadFolder();
  if (selected) {
    els.cfgDownloadDir.value = selected;
  }
});

if (els.cfgChooseAgyFolder) {
  els.cfgChooseAgyFolder.addEventListener('click', async () => {
    const selected = await window.jiraApi.chooseDownloadFolder();
    if (selected) {
      els.cfgAgyWorkDir.value = selected;
    }
  });
}

els.cfgSave.addEventListener('click', async () => {
  const selectedModule = els.cfgAiModule ? els.cfgAiModule.value : 'copilot';

  // 현재 화면에 입력된 값과 기존 모듈 설정값들을 함께 보존
  let githubToken = appConfig.githubToken || '';
  let aiModels = appConfig.aiModels || '';
  let agySkill = appConfig.agySkill || 'jira-ai-task';
  let agyWorkDir = appConfig.agyWorkDir || '';

  if (selectedModule === 'copilot') {
    githubToken = els.cfgGithubToken.value.trim();
    aiModels = els.cfgAiModels.value.trim();
  } else if (selectedModule === 'antigravity') {
    agySkill = els.cfgAgySkill ? (els.cfgAgySkill.value.trim() || 'jira-ai-task') : 'jira-ai-task';
    agyWorkDir = els.cfgAgyWorkDir ? els.cfgAgyWorkDir.value.trim() : '';
  }

  await saveConfig({
    jiraUrl: els.cfgJiraUrl.value.trim(),
    email: els.cfgEmail.value.trim(),
    token: els.cfgToken.value,
    downloadDir: els.cfgDownloadDir.value.trim(),
    aiModule: selectedModule,
    githubToken,
    aiModels,
    agySkill,
    agyWorkDir
  });

  currentSelectedAiModule = selectedModule;
  els.settingsPanel.classList.add('hidden');
});

function getJiraConfigPayload() {
  const cfg = loadConfig();
  return { jiraUrl: cfg.jiraUrl, email: cfg.email, token: cfg.token, downloadDir: cfg.downloadDir };
}

function showScreen(name) {
  els.searchScreen.classList.toggle('hidden', name !== 'search');
  els.detailScreen.classList.toggle('hidden', name !== 'detail');
}

// ---- 검색 ----
els.searchBtn.addEventListener('click', async () => {
  const searchType = els.searchType.value;
  const statusKey = els.searchStatus.value;
  const targetEmail = els.searchEmail.value.trim();
  const targetKeyword = els.searchKeyword.value.trim();
  const maxNum = parseInt(els.searchMaxNum.value, 10) || 20;

  if (searchType === 'assigned') {
    if (!targetEmail && !targetKeyword) {
      els.searchStatusMsg.textContent = '이메일 또는 키워드를 입력해 주세요.';
      return;
    }
  } else if (searchType === 'mention') {
    if (!targetEmail) {
      els.searchStatusMsg.textContent = '이메일을 입력해 주세요.';
      return;
    }
  }

  saveLastSearch({ searchType, statusKey, targetEmail, targetKeyword, maxNum });

  els.searchStatusMsg.textContent = '검색 중...';
  els.issueList.innerHTML = '';

  try {
    const payload = { ...getJiraConfigPayload(), searchType, targetEmail, targetKeyword, statusKey, maxNum };
    const result = await window.jiraApi.search(payload);
    state.currentIssues = result.issues || [];
    renderIssueList(state.currentIssues);
    els.searchStatusMsg.textContent = `총 ${state.currentIssues.length}개 이슈 조회됨 (상태: ${result.statusDesc})`;
  } catch (err) {
    els.searchStatusMsg.textContent = `오류: ${err.message}`;
  }
});

function renderIssueList(issues) {
  els.issueList.innerHTML = '';
  if (issues.length === 0) {
    els.issueList.innerHTML = '<div class="my-2.5 text-[13px] text-[#6b778c]">조건에 맞는 이슈가 없습니다.</div>';
    return;
  }
  issues.forEach((issue) => {
    const card = document.createElement('div');
    card.className = 'bg-white border border-[#dfe1e6] rounded-md px-3.5 py-3 cursor-pointer transition-shadow duration-150 ease-in-out hover:shadow-[0_1px_6px_rgba(9,30,66,0.2)]';
    card.innerHTML = `
      <div class="font-semibold text-[#0052cc] mb-1">[${issue.key}] ${escapeHtml(issue.summary)}</div>
      <div class="text-[13px] text-[#6b778c]">담당자: ${escapeHtml(issue.assignee)} · 상태: ${escapeHtml(issue.status)}</div>
    `;
    card.addEventListener('click', () => openIssueDetail(issue.key));
    els.issueList.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 1초 후 자동으로 사라지는 토스트 팝업 표시
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#172b4d] text-white text-sm px-4 py-2 rounded-md shadow-lg z-[10000]';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function sanitizeHttpUrl(urlValue) {
  if (!urlValue) return '';
  try {
    const parsed = new URL(String(urlValue));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

// 댓글/설명 내 링크용: http/https 외에 mailto도 허용
function sanitizeExternalLinkUrl(urlValue) {
  if (!urlValue) return '';
  try {
    const parsed = new URL(String(urlValue));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
}

// 로컬 절대경로를 file:// URL로 변환 (Windows 경로/특수문자 대응)
function toFileUrl(filePath) {
  let normalized = String(filePath).replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  return encodeURI(`file://${normalized}`);
}

// 마크다운 형태의 링크([label](url))와 일반 텍스트에 포함된 http/https URL을 클릭 가능한 <a> 태그로 변환
// (http/https/mailto만 허용, 나머지 텍스트는 escapeHtml 처리)
// label에는 짝이 맞는 대괄호 한 겹([KAN-811] 처럼)까지만 허용해, 무관한 [텍스트]가 뒤쪽 링크의 label에 잘못 흡수되는 것을 방지
function linkifyText(text) {
  const LINK_REGEX = /\[((?:[^[\]]|\[[^[\]]*\])*)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
  const input = text || '';
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = LINK_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(input.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      // 마크다운 스타일 링크: [label](url)
      const safeUrl = sanitizeExternalLinkUrl(match[2]);
      if (safeUrl) {
        result += `<a href="#" data-role="ext-link" data-url="${escapeHtml(safeUrl)}" class="text-[#0052cc] underline">${escapeHtml(match[1] || match[2])}</a>`;
      } else {
        result += escapeHtml(match[0]);
      }
    } else if (match[3] !== undefined) {
      // 일반 텍스트에 그대로 노출된 URL. 끝에 붙은 문장부호는 링크에서 제외
      let rawUrl = match[3];
      let trailing = '';
      const trailingMatch = rawUrl.match(/[),.!?;:]+$/);
      if (trailingMatch) {
        trailing = trailingMatch[0];
        rawUrl = rawUrl.slice(0, -trailing.length);
      }
      const safeUrl = sanitizeExternalLinkUrl(rawUrl);
      if (safeUrl) {
        result += `<a href="#" data-role="ext-link" data-url="${escapeHtml(safeUrl)}" class="text-[#0052cc] underline">${escapeHtml(rawUrl)}</a>${escapeHtml(trailing)}`;
      } else {
        result += escapeHtml(match[0]);
      }
    }
    lastIndex = LINK_REGEX.lastIndex;
  }
  if (lastIndex < input.length) {
    result += escapeHtml(input.slice(lastIndex));
  }
  return result;
}

// 첨부파일 마커가 포함된 텍스트를 안전한 HTML로 변환 (마커가 아닌 부분은 링크/escapeHtml 처리)
function renderTextWithAttachments(text) {
  const segments = window.attachmentUtil.splitAttachmentMarkers(text || '');
  return segments
    .map((seg) => {
      if (seg.type !== 'attachment') {
        return linkifyText(seg.value);
      }
      const fileUrl = toFileUrl(seg.path);
      const safeFilename = escapeHtml(seg.filename);
      if (seg.kind === 'image') {
        return `<div class="my-2.5"><img src="${fileUrl}" alt="${safeFilename}" class="max-w-full border border-[#dfe1e6] rounded block" /><div class="text-xs text-[#6b778c] mt-1">${safeFilename}</div></div>`;
      }
      return `<button type="button" data-role="attachment-file-link" data-path="${escapeHtml(seg.path)}" class="inline-flex items-center gap-1.5 my-1.5 px-2.5 py-1.5 bg-[#f4f5f7] border border-[#dfe1e6] rounded text-[13px] text-[#0052cc] hover:bg-[#ebecf0] cursor-pointer">📎 ${safeFilename}</button>`;
    })
    .join('');
}

// ---- 이슈 상세 ----
async function openIssueDetail(issueKey) {
  state.currentIssueKey = issueKey;
  state.currentIssueDetail = null;
  showScreen('detail');
  els.issueDetail.innerHTML = '<div class="my-2.5 text-[13px] text-[#6b778c]">불러오는 중...</div>';

  try {
    const payload = { ...getJiraConfigPayload(), issueKey };
    const [detail, transitions] = await Promise.all([
      window.jiraApi.getIssue(payload),
      window.jiraApi.getTransitions(payload)
    ]);
    state.currentIssueDetail = detail;
    renderIssueDetail(detail);
    renderStatusOptions(transitions, detail.status);
  } catch (err) {
    els.issueDetail.innerHTML = `<div class="my-2.5 text-[13px] text-[#6b778c]">오류: ${escapeHtml(err.message)}</div>`;
  }
}

function renderStatusOptions(transitions, currentStatus) {
  els.statusSelect.innerHTML = '';
  const currentOpt = document.createElement('option');
  currentOpt.value = currentStatus;
  currentOpt.textContent = `${currentStatus} (현재)`;
  currentOpt.selected = true;
  els.statusSelect.appendChild(currentOpt);

  transitions.forEach((t) => {
    const opt = document.createElement('option');
    const name = t.to?.name || t.name;
    opt.value = name;
    opt.textContent = name;
    els.statusSelect.appendChild(opt);
  });
}

// ---- 맨션 (Mention) 관리 상태 및 UI ----
const mentionsState = new Map();
let mentionDropdownEl = null;
let currentActiveMentionInput = null;
let currentMentionQueryStart = -1;
let currentMentionQueryEnd = -1;
let mentionDebounceTimer = null;

// ---- 댓글 작성 시 첨부 이미지/파일 관리 상태 (inputId -> 절대 경로 배열) ----
const commentAttachmentsState = new Map();
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']);

function getFileBaseName(filePath) {
  return String(filePath).split(/[\\/]/).pop();
}

function isImageFile(filePath) {
  const match = String(filePath).toLowerCase().match(/\.[^.]+$/);
  return !!match && IMAGE_EXTENSIONS.has(match[0]);
}

// 이미지는 작성 중에도 썸네일로, 그 외 파일은 파일명 칩으로 미리보기
function renderAttachmentChips(inputId) {
  const container = document.getElementById(`attachments-list-${inputId}`);
  if (!container) return;
  const files = commentAttachmentsState.get(inputId) || [];
  container.innerHTML = files
    .map((filePath) => {
      const safePath = escapeHtml(filePath);
      const safeName = escapeHtml(getFileBaseName(filePath));
      if (isImageFile(filePath)) {
        return `
        <span class="relative inline-block">
          <img src="${toFileUrl(filePath)}" alt="${safeName}" class="h-16 w-16 object-cover border border-[#dfe1e6] rounded" />
          <button type="button" class="btn-remove-attachment absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-[#42526e] text-white rounded-full text-[10px] leading-none cursor-pointer border-0" data-input-id="${inputId}" data-path="${safePath}">✕</button>
        </span>`;
      }
      return `
      <span class="inline-flex items-center gap-1 px-2 py-1 bg-white border border-[#dfe1e6] rounded text-xs text-[#42526e]">
        📎 ${safeName}
        <button type="button" class="btn-remove-attachment cursor-pointer bg-transparent border-0 text-[#6b778c] hover:text-[#de350b] leading-none p-0" data-input-id="${inputId}" data-path="${safePath}">✕</button>
      </span>`;
    })
    .join('');
}
let mentionSearchSeq = 0;

function getOrCreateMentionDropdown() {
  if (!mentionDropdownEl) {
    mentionDropdownEl = document.createElement('div');
    mentionDropdownEl.id = 'mention-dropdown-popup';
    mentionDropdownEl.className =
      'fixed z-[9999] hidden bg-white border border-[#dfe1e6] rounded shadow-lg max-h-48 overflow-y-auto w-64 text-xs';

    // 드롭다운 클릭 시 textarea blur로 인한 커서 위치 유실 방지
    mentionDropdownEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    document.body.appendChild(mentionDropdownEl);
  }
  return mentionDropdownEl;
}

function hideMentionDropdown() {
  if (mentionDropdownEl) {
    mentionDropdownEl.classList.add('hidden');
    mentionDropdownEl.innerHTML = '';
  }
  currentActiveMentionInput = null;
  currentMentionQueryStart = -1;
  currentMentionQueryEnd = -1;
}

function showMentionDropdown(inputEl, users) {
  const dropdown = getOrCreateMentionDropdown();
  const rect = inputEl.getBoundingClientRect();

  dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  dropdown.innerHTML = users
    .map(
      (u) => `
    <div class="mention-item flex items-center gap-2 p-2 hover:bg-[#f4f5f7] cursor-pointer transition-colors border-b border-[#f4f5f7] last:border-b-0"
         data-account-id="${escapeHtml(u.accountId)}"
         data-display-name="${escapeHtml(u.displayName)}">
      ${u.avatarUrl ? `<img src="${escapeHtml(u.avatarUrl)}" class="w-5 h-5 rounded-full shrink-0"/>` : ''}
      <div class="truncate">
        <div class="font-medium text-[#172b4d]">${escapeHtml(u.displayName)}</div>
        ${u.emailAddress ? `<div class="text-[11px] text-[#6b778c] truncate">${escapeHtml(u.emailAddress)}</div>` : ''}
      </div>
    </div>`
    )
    .join('');

  dropdown.classList.remove('hidden');
}

function applyMentionSelection(item) {
  if (!item) return;
  const input = currentActiveMentionInput || document.activeElement;
  if (!input || (input.id !== 'new-comment-input' && !input.classList?.contains('reply-textarea'))) {
    return;
  }

  const accountId = item.dataset.accountId;
  const displayName = item.dataset.displayName;
  const mentionText = `@${displayName}`;

  const inputId = input.id;
  const text = input.value;

  let start = currentMentionQueryStart;
  let end = currentMentionQueryEnd;

  if (start < 0 || end < 0 || start > text.length || end < start) {
    const cursorPos = input.selectionStart ?? text.length;
    const textBefore = text.slice(0, cursorPos);
    const m = textBefore.match(/@([^\s@]*)$/);
    if (m) {
      start = cursorPos - m[0].length;
      end = cursorPos;
    } else {
      start = cursorPos;
      end = cursorPos;
    }
  }

  const before = text.slice(0, start);
  const after = text.slice(end);

  input.value = `${before}${mentionText} ${after}`;
  const newCursorPos = before.length + mentionText.length + 1;
  input.focus();
  input.setSelectionRange(newCursorPos, newCursorPos);

  if (!mentionsState.has(inputId)) {
    mentionsState.set(inputId, new Map());
  }
  mentionsState.get(inputId).set(accountId, { accountId, displayName, text: mentionText });

  hideMentionDropdown();
}

// 맨션 @ 키워드 입력 감지
document.addEventListener('input', (e) => {
  const target = e.target;
  if (!target || (target.id !== 'new-comment-input' && !target.classList.contains('reply-textarea'))) {
    hideMentionDropdown();
    return;
  }

  const text = target.value;
  const cursorIndex = target.selectionStart;
  const textBeforeCursor = text.slice(0, cursorIndex);
  const match = textBeforeCursor.match(/@([^\s@]*)$/);

  if (!match) {
    hideMentionDropdown();
    return;
  }

  const query = match[1];
  currentMentionQueryStart = cursorIndex - match[0].length;
  currentMentionQueryEnd = cursorIndex;
  currentActiveMentionInput = target;

  const seq = ++mentionSearchSeq;
  clearTimeout(mentionDebounceTimer);
  mentionDebounceTimer = setTimeout(async () => {
    try {
      const users = await window.jiraApi.searchUsers({
        ...getJiraConfigPayload(),
        query,
        issueKey: state.currentIssueKey
      });

      if (seq !== mentionSearchSeq) return;

      if (!users || users.length === 0) {
        hideMentionDropdown();
        return;
      }
      showMentionDropdown(target, users);
    } catch {
      if (seq === mentionSearchSeq) {
        hideMentionDropdown();
      }
    }
  }, 150);
});

// 맨션 사용자 드롭다운 클릭 이벤트
document.addEventListener('click', (e) => {
  const item = e.target.closest('.mention-item');
  if (item) {
    applyMentionSelection(item);
    return;
  }

  if (mentionDropdownEl && !mentionDropdownEl.contains(e.target) && e.target !== currentActiveMentionInput) {
    hideMentionDropdown();
  }
});

function renderIssueDetail(detail) {
  const safeWebUrl = sanitizeHttpUrl(detail.webUrl);
  let commentsHtml = '';
  if (!detail.comments || detail.comments.length === 0) {
    commentsHtml = '<div class="my-2.5 text-[13px] text-[#6b778c]">등록된 댓글이 없습니다.</div>';
  } else {
    commentsHtml = detail.comments
      .map((c) => {
        const repliesHtml = (c.replies || [])
          .map(
            (r) => `
          <div class="ml-5 mt-2 mb-3 border-l-[3px] border-[#c1c7d0] pl-3">
            <div class="text-xs text-[#6b778c] mb-1">#${r.index} ${escapeHtml(r.author)} · ${new Date(r.created).toLocaleString('ko-KR')} [답글]</div>
            <div class="whitespace-pre-wrap leading-normal">${renderTextWithAttachments(r.text)}</div>
          </div>`
          )
          .join('');
        return `
        <div class="border-l-[3px] border-[#dfe1e6] pl-3 mb-5">
          <div class="flex items-center justify-between text-xs text-[#6b778c] mb-1">
            <span>#${c.index} ${escapeHtml(c.author)} · ${new Date(c.created).toLocaleString('ko-KR')}</span>
            <button class="btn-toggle-reply text-[#0052cc] hover:underline cursor-pointer bg-transparent border-0 text-xs p-0 font-medium" data-comment-id="${c.id}">답글 달기</button>
          </div>
          <div class="whitespace-pre-wrap leading-normal">${renderTextWithAttachments(c.text)}</div>
          
          <div id="reply-form-${c.id}" class="hidden mt-2 mb-3 p-2.5 bg-[#fafbfc] border border-[#dfe1e6] rounded">
            <textarea id="reply-input-${c.id}" rows="2" class="reply-textarea w-full p-2 border border-[#dfe1e6] rounded text-xs focus:outline-none focus:border-[#0052cc] resize-y" placeholder="답글을 입력하세요... (@로 사용자 검색)"></textarea>
            <div id="attachments-list-reply-input-${c.id}" class="flex flex-wrap gap-1.5 mt-1.5"></div>
            <div class="flex justify-between items-center gap-2 mt-1.5">
              <button class="btn-attach-files px-2.5 py-1 bg-[#ebecf0] hover:bg-[#dfe1e6] text-[#42526e] text-xs font-medium rounded cursor-pointer border-0" data-input-id="reply-input-${c.id}">📎 파일 첨부</button>
              <div class="flex gap-2">
                <button class="btn-cancel-reply px-2.5 py-1 bg-[#ebecf0] hover:bg-[#dfe1e6] text-[#172b4d] text-xs font-medium rounded cursor-pointer border-0" data-comment-id="${c.id}">취소</button>
                <button class="btn-submit-reply px-2.5 py-1 bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold rounded cursor-pointer border-0" data-comment-id="${c.id}">답글 등록</button>
              </div>
            </div>
          </div>

          ${repliesHtml}
        </div>`;
      })
      .join('');
  }

  const newCommentFormHtml = `
    <div class="mt-4 mb-6 p-3 bg-[#f4f5f7] rounded border border-[#dfe1e6]">
      <div class="text-sm font-bold mb-1.5 text-[#172b4d]">새 댓글 작성</div>
      <textarea id="new-comment-input" rows="3" class="w-full p-2 border border-[#dfe1e6] rounded text-sm focus:outline-none focus:border-[#0052cc] resize-y" placeholder="댓글을 입력하세요... (@로 사용자 검색)"></textarea>
      <div id="attachments-list-new-comment-input" class="flex flex-wrap gap-1.5 mt-2"></div>
      <div class="flex justify-between items-center mt-2">
        <button id="btn-attach-comment-files" class="btn-attach-files px-2.5 py-1.5 bg-[#ebecf0] hover:bg-[#dfe1e6] text-[#42526e] text-xs font-medium rounded cursor-pointer border-0" data-input-id="new-comment-input">📎 파일 첨부</button>
        <button id="btn-submit-comment" class="px-3 py-1.5 bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold rounded cursor-pointer transition-colors border-0">댓글 작성</button>
      </div>
    </div>
  `;

  els.issueDetail.innerHTML = `
    <h2 class="mt-0 shrink-0">[${detail.key}] ${escapeHtml(detail.summary)}</h2>
    <div class="shrink-0 my-2.5 text-[13px] text-[#6b778c]">담당자: ${escapeHtml(detail.assignee)} · 상태: ${escapeHtml(detail.status)} · <a href="#" id="detail-webUrl">${escapeHtml(safeWebUrl || '유효하지 않은 URL')}</a></div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="whitespace-pre-wrap leading-[1.6] border-t border-b border-[#dfe1e6] py-3 my-3">${renderTextWithAttachments(detail.description)}</div>
      <div class="flex items-center justify-between mt-4 mb-2">
        <h3 class="my-0">댓글 (총 ${detail.comments ? detail.comments.length : 0}개)</h3>
      </div>
      ${newCommentFormHtml}
      ${commentsHtml}
    </div>
  `;

  const link = document.getElementById('detail-webUrl');
  if (link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!safeWebUrl) return;
      window.jiraApi.openInBrowser(safeWebUrl).catch((err) => showToast(`링크를 열 수 없습니다: ${err.message}`));
    });
  }
}

els.backBtn.addEventListener('click', () => {
  state.currentIssueKey = null;
  state.currentIssueDetail = null;
  showScreen('search');
});

// 본문/댓글/첨부파일 및 댓글 작성/답글 이벤트 처리
els.issueDetail.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-role="attachment-file-link"]');
  if (btn && btn.dataset.path) {
    window.jiraApi.openPath(btn.dataset.path);
    return;
  }
  const link = e.target.closest('[data-role="ext-link"]');
  if (link && link.dataset.url) {
    e.preventDefault();
    window.jiraApi.openInBrowser(link.dataset.url).catch((err) => showToast(`링크를 열 수 없습니다: ${err.message}`));
    return;
  }

  // 댓글/답글 첨부파일 선택 버튼 클릭
  const attachBtn = e.target.closest('.btn-attach-files');
  if (attachBtn) {
    const inputId = attachBtn.dataset.inputId;
    try {
      const filePaths = await window.jiraApi.chooseCommentAttachments();
      if (filePaths && filePaths.length > 0) {
        const existing = commentAttachmentsState.get(inputId) || [];
        const merged = Array.from(new Set([...existing, ...filePaths]));
        commentAttachmentsState.set(inputId, merged);
        renderAttachmentChips(inputId);
      }
    } catch (err) {
      showToast(`파일 선택 실패: ${err.message}`);
    }
    return;
  }

  // 첨부파일 삭제(x) 버튼 클릭
  const removeAttachmentBtn = e.target.closest('.btn-remove-attachment');
  if (removeAttachmentBtn) {
    const inputId = removeAttachmentBtn.dataset.inputId;
    const filePath = removeAttachmentBtn.dataset.path;
    const existing = commentAttachmentsState.get(inputId) || [];
    commentAttachmentsState.set(inputId, existing.filter((p) => p !== filePath));
    renderAttachmentChips(inputId);
    return;
  }

  // 새 댓글 작성 버튼 클릭
  const submitCommentBtn = e.target.closest('#btn-submit-comment');
  if (submitCommentBtn) {
    const input = document.getElementById('new-comment-input');
    const text = input ? input.value.trim() : '';
    const filePaths = commentAttachmentsState.get('new-comment-input') || [];
    if (!text && filePaths.length === 0) {
      showToast('댓글 내용을 입력하거나 파일을 첨부해 주세요.');
      return;
    }
    submitCommentBtn.disabled = true;
    submitCommentBtn.textContent = '등록 중...';
    try {
      const mentions = mentionsState.has('new-comment-input')
        ? Array.from(mentionsState.get('new-comment-input').values())
        : [];

      const payload = {
        ...getJiraConfigPayload(),
        issueKey: state.currentIssueKey,
        commentText: text,
        mentions,
        filePaths
      };
      const detail = await window.jiraApi.addComment(payload);
      mentionsState.delete('new-comment-input');
      commentAttachmentsState.delete('new-comment-input');
      renderIssueDetail(detail);
      showToast('댓글이 등록되었습니다.');
    } catch (err) {
      showToast(`댓글 등록 실패: ${err.message}`);
      submitCommentBtn.disabled = false;
      submitCommentBtn.textContent = '댓글 작성';
    }
    return;
  }

  // 답글 달기 토글 버튼 클릭
  const toggleReplyBtn = e.target.closest('.btn-toggle-reply');
  if (toggleReplyBtn) {
    const commentId = toggleReplyBtn.dataset.commentId;
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) {
        const replyInput = document.getElementById(`reply-input-${commentId}`);
        if (replyInput) replyInput.focus();
      }
    }
    return;
  }

  // 답글 취소 버튼 클릭
  const cancelReplyBtn = e.target.closest('.btn-cancel-reply');
  if (cancelReplyBtn) {
    const commentId = cancelReplyBtn.dataset.commentId;
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
      form.classList.add('hidden');
      const replyInput = document.getElementById(`reply-input-${commentId}`);
      if (replyInput) replyInput.value = '';
      const inputId = `reply-input-${commentId}`;
      commentAttachmentsState.delete(inputId);
      renderAttachmentChips(inputId);
    }
    return;
  }

  // 답글 등록 버튼 클릭
  const submitReplyBtn = e.target.closest('.btn-submit-reply');
  if (submitReplyBtn) {
    const commentId = submitReplyBtn.dataset.commentId;
    const input = document.getElementById(`reply-input-${commentId}`);
    const text = input ? input.value.trim() : '';
    const inputId = `reply-input-${commentId}`;
    const filePaths = commentAttachmentsState.get(inputId) || [];
    if (!text && filePaths.length === 0) {
      showToast('답글 내용을 입력하거나 파일을 첨부해 주세요.');
      return;
    }
    submitReplyBtn.disabled = true;
    submitReplyBtn.textContent = '등록 중...';
    try {
      const mentions = mentionsState.has(inputId)
        ? Array.from(mentionsState.get(inputId).values())
        : [];

      const payload = {
        ...getJiraConfigPayload(),
        issueKey: state.currentIssueKey,
        commentText: text,
        parentId: commentId,
        mentions,
        filePaths
      };
      const detail = await window.jiraApi.addComment(payload);
      mentionsState.delete(inputId);
      commentAttachmentsState.delete(inputId);
      renderIssueDetail(detail);
      showToast('답글이 등록되었습니다.');
    } catch (err) {
      showToast(`답글 등록 실패: ${err.message}`);
      submitReplyBtn.disabled = false;
      submitReplyBtn.textContent = '답글 등록';
    }
    return;
  }
});

els.openBrowserBtn.addEventListener('click', () => {
  if (state.currentIssueKey) {
    const cfg = loadConfig();
    window.jiraApi.openInBrowser(`${cfg.jiraUrl}/browse/${state.currentIssueKey}`);
  }
});

els.refreshDetailBtn.addEventListener('click', () => {
  if (state.currentIssueKey) {
    openIssueDetail(state.currentIssueKey);
  }
});

els.statusApplyBtn.addEventListener('click', async () => {
  if (!state.currentIssueKey) return;
  const targetStatusName = els.statusSelect.value;
  els.statusApplyBtn.disabled = true;
  try {
    const payload = { ...getJiraConfigPayload(), issueKey: state.currentIssueKey, targetStatusName };
    const detail = await window.jiraApi.transitionIssue(payload);
    renderIssueDetail(detail);
    const transitions = await window.jiraApi.getTransitions({ ...getJiraConfigPayload(), issueKey: state.currentIssueKey });
    renderStatusOptions(transitions, detail.status);
    showToast('적용되었습니다');
  } catch (err) {
    alert(`상태 변경 실패: ${err.message}`);
  } finally {
    els.statusApplyBtn.disabled = false;
  }
});

// ---- AI 요약 ----
async function loadSummary(forceRefresh) {
  if (!state.currentIssueKey) return;
  const cfg = loadConfig();
  const isAgy = cfg.aiModule === 'antigravity';

  els.aiModal.classList.remove('hidden');
  els.aiSummaryMeta.textContent = forceRefresh
    ? (isAgy ? 'Antigravity CLI로 요약을 다시 생성하는 중입니다...' : '요약을 다시 생성하는 중...')
    : (isAgy ? 'Antigravity 요약을 불러오는 중입니다...' : '요약을 불러오는 중...');
  els.aiSummaryText.textContent = '';

  try {
    const payload = {
      ...getJiraConfigPayload(),
      issueKey: state.currentIssueKey,
      forceRefresh,
      aiModule: cfg.aiModule,
      githubToken: cfg.githubToken,
      aiModels: parseAiModels(cfg.aiModels),
      agySkill: cfg.agySkill,
      agyWorkDir: cfg.agyWorkDir
    };
    const result = await window.jiraApi.getSummary(payload);
    if (window.jiraApi?.renderMarkdown) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const defaultAgyDir = window.jiraApi?.getDefaultAgyWorkDir ? await window.jiraApi.getDefaultAgyWorkDir() : '';
      const agyWorkDir = (cfg.agyWorkDir && cfg.agyWorkDir.trim()) || defaultAgyDir;
      let filesAbsUrl = `${agyWorkDir}/issues/${todayStr}/files/`.replace(/\\/g, '/');
      if (!filesAbsUrl.startsWith('/')) filesAbsUrl = `/${filesAbsUrl}`;
      const filePrefix = encodeURI(`file://${filesAbsUrl}`);

      const resolvedSummary = (result.summary || '')
        .replace(/\(\.\/files\//g, `(${filePrefix}`)
        .replace(/\(files\//g, `(${filePrefix}`);

      els.aiSummaryText.innerHTML = await window.jiraApi.renderMarkdown(resolvedSummary);
    } else {
      els.aiSummaryText.textContent = result.summary || '';
    }
    const generated = result.generatedAt ? new Date(result.generatedAt).toLocaleString('ko-KR') : '';
    const moduleLabel = result.module === 'antigravity' ? 'Antigravity CLI' : 'Copilot SDK';
    els.aiSummaryMeta.textContent = result.fromCache
      ? `[${moduleLabel}] 저장된 요약 (${generated ? `생성일시: ${generated}` : '캐시'})`
      : `[${moduleLabel}] 새로 생성됨 (${generated ? `생성일시: ${generated}` : '완료'})`;
  } catch (err) {
    els.aiSummaryMeta.textContent = '';
    els.aiSummaryText.textContent = `오류: ${err.message}`;
  }
}

els.aiSummaryBtn.addEventListener('click', () => loadSummary(false));
els.aiRefreshBtn.addEventListener('click', () => loadSummary(true));
els.aiModalClose.addEventListener('click', () => {
  els.aiModal.classList.add('hidden');
});

// AI 요약 모달 내 링크 및 첨부파일 클릭 이벤트 처리
els.aiSummaryText.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;

  const rawHref = link.getAttribute('href');
  if (!rawHref || rawHref === '#') return;

  e.preventDefault();

  if (rawHref.startsWith('file://')) {
    let filePath = decodeURIComponent(rawHref.replace(/^file:\/\//, ''));
    // Windows 경로일 경우 맨 앞의 슬래시 제거 처리 (예: /C:/... -> C:/...)
    if (/^\/[a-zA-Z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }
    window.jiraApi.openPath(filePath).catch((err) => showToast(`첨부파일을 열 수 없습니다: ${err.message}`));
  } else if (rawHref.startsWith('http://') || rawHref.startsWith('https://') || rawHref.startsWith('mailto:')) {
    window.jiraApi.openInBrowser(rawHref).catch((err) => showToast(`링크를 열 수 없습니다: ${err.message}`));
  }
});

// ==========================================
// 개발 업무 메모 기능 (Dev Notes)
// ==========================================

const memoState = {
  notes: [],
  selectedIds: new Set(),
  currentDetailId: null,
  lastAiSummaryMarkdown: ''
};

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTwoWeeksAgoDateString() {
  const now = new Date();
  now.setDate(now.getDate() - 14);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNowDateTimeLocalString(dateObj = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDisplayDateTime(str) {
  if (!str) return '';
  return str.replace('T', ' ');
}

// 다중 내용 동적 Row 생성 헬퍼
function createContentInputRow(initialEntry = {}, isDetail = false) {
  const row = document.createElement('div');
  row.className = 'memo-content-entry border border-[#dfe1e6] bg-[#fafbfc] rounded p-2.5 flex flex-col gap-2 relative shadow-xs';

  const entryId = initialEntry.id || `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  row.dataset.id = entryId;

  // 상단 바: 작성일시 input + 삭제 버튼
  const topBar = document.createElement('div');
  topBar.className = 'flex justify-between items-center';

  const dateGroup = document.createElement('div');
  dateGroup.className = 'flex items-center gap-1.5';

  const dateLabel = document.createElement('label');
  dateLabel.className = 'text-xs font-semibold text-[#42526e]';
  dateLabel.textContent = '작성일시:';

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'memo-entry-datetime px-2 py-1 border border-[#dfe1e6] rounded text-xs bg-white focus:border-[#0052cc] outline-none';

  let initialDateTime = initialEntry.writtenAt || getNowDateTimeLocalString();
  if (initialDateTime && !initialDateTime.includes('T') && initialDateTime.includes(' ')) {
    initialDateTime = initialDateTime.replace(' ', 'T');
  }
  dateInput.value = initialDateTime ? initialDateTime.slice(0, 16) : getNowDateTimeLocalString();

  dateGroup.appendChild(dateLabel);
  dateGroup.appendChild(dateInput);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'memo-entry-del-btn cursor-pointer border-0 bg-transparent text-gray-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 flex items-center gap-0.5';
  delBtn.textContent = '✕ 삭제';
  delBtn.title = '이 내용 항목 삭제';
  delBtn.addEventListener('click', () => {
    const parentContainer = row.parentElement;
    row.remove();
    if (parentContainer && parentContainer.querySelectorAll('.memo-content-entry').length === 0) {
      parentContainer.appendChild(createContentInputRow({}, isDetail));
    }
  });

  topBar.appendChild(dateGroup);
  topBar.appendChild(delBtn);

  // 하단: 내용 textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'memo-entry-text w-full px-2.5 py-1.5 border border-[#dfe1e6] rounded text-sm bg-white focus:border-[#0052cc] outline-none resize-y font-normal';
  textarea.rows = isDetail ? 4 : 3;
  textarea.placeholder = '업무 진행 내역, 구현 내용, 트러블슈팅 등을 입력하세요';
  textarea.value = initialEntry.text || initialEntry.content || '';

  row.appendChild(topBar);
  row.appendChild(textarea);

  return row;
}

function populateContentsContainer(container, contents = [], isDetail = false) {
  if (!container) return;
  container.innerHTML = '';
  const sortedContents = Array.isArray(contents) && contents.length > 0
    ? [...contents].sort((a, b) => (b.writtenAt || '').localeCompare(a.writtenAt || ''))
    : [{ writtenAt: getNowDateTimeLocalString(), text: '' }];

  sortedContents.forEach((entry) => {
    container.appendChild(createContentInputRow(entry, isDetail));
  });
}

function getContentsFromContainer(container) {
  if (!container) return [];
  const entries = container.querySelectorAll('.memo-content-entry');
  const list = [];
  entries.forEach((row, idx) => {
    const dtInput = row.querySelector('.memo-entry-datetime');
    const txtArea = row.querySelector('.memo-entry-text');
    const rawDt = dtInput ? dtInput.value.trim() : '';
    const formattedDt = rawDt ? rawDt.replace('T', ' ') : '';
    const text = txtArea ? txtArea.value.trim() : '';
    if (text || formattedDt) {
      list.push({
        id: row.dataset.id || `entry_${Date.now()}_${idx}`,
        writtenAt: formattedDt,
        text
      });
    }
  });

  // 작성일시 내림차순 정렬
  return list.sort((a, b) => (b.writtenAt || '').localeCompare(a.writtenAt || ''));
}

// 다중 링크 동적 Row 생성 헬퍼
function createLinkInputRow(initialValue = '', isDetail = false) {
  const row = document.createElement('div');
  row.className = 'memo-link-row flex items-center gap-1.5';

  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'memo-link-input flex-1 px-2.5 py-1.5 border border-[#dfe1e6] rounded text-sm focus:border-[#0052cc] outline-none';
  input.placeholder = 'https://...';
  input.value = initialValue || '';

  row.appendChild(input);

  if (isDetail) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'cursor-pointer border-0 bg-transparent text-[#0052cc] hover:underline text-xs px-2 py-1 rounded whitespace-nowrap';
    openBtn.textContent = '↗ 열기';
    openBtn.title = '브라우저로 열기';
    openBtn.addEventListener('click', () => {
      const url = input.value.trim();
      if (url) {
        window.jiraApi.openInBrowser(url).catch((err) => showToast(`링크를 열 수 없습니다: ${err.message}`));
      } else {
        showToast('열 링크 URL이 비어 있습니다.');
      }
    });
    row.appendChild(openBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'cursor-pointer border-0 bg-transparent text-gray-400 hover:text-red-600 text-sm px-1.5 py-1 rounded hover:bg-gray-100';
  delBtn.textContent = '✕';
  delBtn.title = '링크 항목 삭제';
  delBtn.addEventListener('click', () => {
    const parentContainer = row.parentElement;
    row.remove();
    if (parentContainer && parentContainer.querySelectorAll('.memo-link-row').length === 0) {
      parentContainer.appendChild(createLinkInputRow('', isDetail));
    }
  });
  row.appendChild(delBtn);

  return row;
}

function populateLinksContainer(container, links = [], isDetail = false) {
  if (!container) return;
  container.innerHTML = '';
  const linksArray = Array.isArray(links) && links.length > 0 ? links : [''];
  linksArray.forEach((url) => {
    container.appendChild(createLinkInputRow(url, isDetail));
  });
}

function getLinksFromContainer(container) {
  if (!container) return [];
  const inputs = container.querySelectorAll('.memo-link-input');
  const list = [];
  inputs.forEach((input) => {
    const val = input.value.trim();
    if (val) list.push(val);
  });
  return list;
}

function getCurrentJiraIssueUrl() {
  if (els.detailScreen && !els.detailScreen.classList.contains('hidden') && state.currentIssueKey) {
    if (state.currentIssueDetail?.webUrl) {
      return state.currentIssueDetail.webUrl;
    }
    const cfg = loadConfig();
    const baseJiraUrl = (cfg.jiraUrl || '').replace(/\/$/, '');
    if (baseJiraUrl) {
      return `${baseJiraUrl}/browse/${state.currentIssueKey}`;
    }
  }
  return '';
}

// 1. 메모 추가 모달
function openMemoCreateModal(initialData = {}) {
  if (!els.memoCreateModal) return;
  els.memoCreateTitle.value = initialData.title || '';
  if (els.memoCreateType) els.memoCreateType.value = initialData.type || '개발';
  if (els.memoCreateStatus) els.memoCreateStatus.value = initialData.status || '';
  populateContentsContainer(els.memoCreateContentsContainer, initialData.contents || []);

  let defaultLinks = initialData.links;
  if (!defaultLinks || defaultLinks.length === 0) {
    const currentUrl = getCurrentJiraIssueUrl();
    defaultLinks = currentUrl ? [currentUrl] : [''];
  }
  populateLinksContainer(els.memoCreateLinksContainer, defaultLinks);

  if (els.memoCreateError) {
    els.memoCreateError.textContent = '';
    els.memoCreateError.classList.add('hidden');
  }
  els.memoCreateModal.classList.remove('hidden');
  setTimeout(() => els.memoCreateTitle.focus(), 50);
}

function closeMemoCreateModal() {
  if (els.memoCreateModal) {
    els.memoCreateModal.classList.add('hidden');
  }
}

async function handleCreateMemo() {
  const title = els.memoCreateTitle.value.trim();
  const type = els.memoCreateType ? els.memoCreateType.value : '개발';
  const status = els.memoCreateStatus ? els.memoCreateStatus.value : '';
  const contents = getContentsFromContainer(els.memoCreateContentsContainer);
  const links = getLinksFromContainer(els.memoCreateLinksContainer);

  if (!title) {
    if (els.memoCreateError) {
      els.memoCreateError.textContent = '제목을 입력해 주세요.';
      els.memoCreateError.classList.remove('hidden');
    }
    els.memoCreateTitle.focus();
    return;
  }

  try {
    els.memoCreateSaveBtn.disabled = true;
    els.memoCreateSaveBtn.textContent = '저장 중...';

    await window.memoApi.createNote({ title, type, status, contents, links });
    showToast('개발 메모가 성공적으로 저장되었습니다.');
    closeMemoCreateModal();

    // 목록 모달이 열려있다면 새로고침
    if (els.memoListModal && !els.memoListModal.classList.contains('hidden')) {
      loadMemoList();
    }
  } catch (err) {
    console.error('메모 저장 실패:', err);
    if (els.memoCreateError) {
      els.memoCreateError.textContent = `저장 실패: ${err.message}`;
      els.memoCreateError.classList.remove('hidden');
    }
  } finally {
    els.memoCreateSaveBtn.disabled = false;
    els.memoCreateSaveBtn.textContent = '저장';
  }
}

// 2. 메모 목록 모달
function openMemoListModal() {
  if (!els.memoListModal) return;
  if (!els.memoFilterStart.value) {
    els.memoFilterStart.value = getTwoWeeksAgoDateString();
  }
  if (!els.memoFilterEnd.value) {
    els.memoFilterEnd.value = getTodayDateString();
  }
  els.memoListModal.classList.remove('hidden');
  loadMemoList();
}

function closeMemoListModal() {
  if (els.memoListModal) {
    els.memoListModal.classList.add('hidden');
  }
}

async function loadMemoList() {
  if (!window.memoApi) return;
  const startDate = els.memoFilterStart.value;
  const endDate = els.memoFilterEnd.value;
  const type = els.memoFilterType ? els.memoFilterType.value : '';
  const keyword = (els.memoFilterKeyword.value || '').trim();

  try {
    if (els.memoTableBody) {
      els.memoTableBody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-[#6b778c]">메모 목록을 불러오는 중...</td></tr>';
    }

    const notes = await window.memoApi.listNotes({ startDate, endDate, type, keyword });
    memoState.notes = notes || [];
    memoState.selectedIds.clear();

    renderMemoTable(memoState.notes);
    updateSelectedCount();
  } catch (err) {
    console.error('메모 목록 조회 실패:', err);
    if (els.memoTableBody) {
      els.memoTableBody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-500">조회 실패: ${err.message}</td></tr>`;
    }
  }
}

function renderMemoTable(notes) {
  if (!els.memoTableBody) return;
  els.memoTableBody.innerHTML = '';

  if (els.memoTotalCount) {
    els.memoTotalCount.textContent = `총 ${notes.length}건`;
  }

  if (els.memoSelectAll) {
    els.memoSelectAll.checked = false;
  }

  if (!notes || notes.length === 0) {
    if (els.memoEmptyMsg) els.memoEmptyMsg.classList.remove('hidden');
    return;
  }
  if (els.memoEmptyMsg) els.memoEmptyMsg.classList.add('hidden');

  notes.forEach((note) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-[#f4f5f7] transition-colors border-b border-[#dfe1e6]';

    // 체크박스 td
    const tdCheck = document.createElement('td');
    tdCheck.className = 'py-2.5 px-3';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'memo-item-chk cursor-pointer rounded';
    chk.dataset.id = note.id;
    chk.checked = memoState.selectedIds.has(note.id);
    chk.addEventListener('change', (e) => {
      if (e.target.checked) {
        memoState.selectedIds.add(note.id);
      } else {
        memoState.selectedIds.delete(note.id);
      }
      updateSelectedCount();
    });
    tdCheck.appendChild(chk);

    // 제목 td (클릭 시 상세 화면으로 이동)
    const tdTitle = document.createElement('td');
    tdTitle.className = 'py-2.5 px-3';
    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex items-center gap-1.5';

    const titleBtn = document.createElement('button');
    titleBtn.className = 'cursor-pointer border-0 bg-transparent text-left font-medium text-[#0052cc] hover:underline p-0 text-sm max-w-[360px] truncate block';
    titleBtn.textContent = note.title;
    titleBtn.title = note.title;
    titleBtn.addEventListener('click', () => {
      openMemoDetailModal(note.id);
    });
    titleContainer.appendChild(titleBtn);

    const contentsCount = Array.isArray(note.contents) ? note.contents.length : (note.content ? 1 : 0);
    if (contentsCount > 1) {
      const countBadge = document.createElement('span');
      countBadge.className = 'text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 shrink-0';
      countBadge.textContent = `${contentsCount}개 내용`;
      titleContainer.appendChild(countBadge);
    }
    tdTitle.appendChild(titleContainer);

    // 종류 td
    const tdType = document.createElement('td');
    tdType.className = 'py-2.5 px-3 text-center';
    if (note.type) {
      const typeBadge = document.createElement('span');
      const isDev = note.type === '개발';
      typeBadge.className = `text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${isDev ? 'bg-blue-50 text-[#0052cc] border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`;
      typeBadge.textContent = note.type;
      tdType.appendChild(typeBadge);
    } else {
      tdType.textContent = '-';
      tdType.className += ' text-gray-400 text-xs';
    }

    // 상태 td
    const tdStatus = document.createElement('td');
    tdStatus.className = 'py-2.5 px-3 text-center';
    if (note.status) {
      const statusColorMap = {
        진행중: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        테스트: 'bg-purple-50 text-purple-700 border-purple-200',
        반영: 'bg-green-50 text-green-700 border-green-200'
      };
      const statusBadge = document.createElement('span');
      statusBadge.className = `text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${statusColorMap[note.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`;
      statusBadge.textContent = note.status;
      tdStatus.appendChild(statusBadge);
    } else {
      tdStatus.textContent = '-';
      tdStatus.className += ' text-gray-400 text-xs';
    }

    // 작성일시 td
    const tdDate = document.createElement('td');
    tdDate.className = 'py-2.5 px-3 text-[#42526e] text-xs whitespace-nowrap';
    const displayDate = formatDisplayDateTime(note.writtenAt || note.date || note.createdAt || '');
    tdDate.textContent = displayDate;
    tdDate.title = `최초 작성: ${note.firstWrittenAt || displayDate}\n최근 작성: ${displayDate}`;

    // 링크 td
    const tdLink = document.createElement('td');
    tdLink.className = 'py-2.5 px-3 text-center text-xs';
    const links = Array.isArray(note.links) && note.links.length > 0 ? note.links : (note.link ? [note.link] : []);

    if (links.length === 1) {
      const a = document.createElement('a');
      a.href = links[0];
      a.className = 'text-[#0052cc] hover:underline text-xs inline-flex items-center gap-0.5';
      a.textContent = '🔗 열기';
      a.title = links[0];
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.jiraApi.openInBrowser(links[0]).catch(() => {});
      });
      tdLink.appendChild(a);
    } else if (links.length > 1) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'cursor-pointer border-0 bg-blue-50 text-[#0052cc] hover:bg-blue-100 text-xs px-2 py-0.5 rounded font-medium inline-flex items-center gap-1';
      a.textContent = `🔗 ${links.length}개`;
      a.title = links.join('\n');
      a.addEventListener('click', () => {
        openMemoDetailModal(note.id);
      });
      tdLink.appendChild(a);
    } else {
      tdLink.textContent = '-';
      tdLink.className += ' text-gray-400';
    }

    // 관리 (삭제) td
    const tdAction = document.createElement('td');
    tdAction.className = 'py-2.5 px-3 text-center';
    const delBtn = document.createElement('button');
    delBtn.className = 'cursor-pointer border-0 bg-transparent text-red-500 hover:text-red-700 text-xs px-1.5 py-0.5 rounded hover:bg-red-50';
    delBtn.textContent = '삭제';
    delBtn.title = '메모 삭제';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteMemo(note.id);
    });
    tdAction.appendChild(delBtn);

    tr.appendChild(tdCheck);
    tr.appendChild(tdTitle);
    tr.appendChild(tdType);
    tr.appendChild(tdStatus);
    tr.appendChild(tdDate);
    tr.appendChild(tdLink);
    tr.appendChild(tdAction);

    els.memoTableBody.appendChild(tr);
  });
}

function updateSelectedCount() {
  const count = memoState.selectedIds.size;
  if (els.memoSelectedCount) {
    els.memoSelectedCount.textContent = `${count}개 선택됨`;
  }
  if (els.memoSelectAll && memoState.notes.length > 0) {
    els.memoSelectAll.checked = memoState.selectedIds.size === memoState.notes.length;
  }
}

// 3. 메모 상세/수정 모달
async function openMemoDetailModal(noteId) {
  if (!els.memoDetailModal || !noteId) return;
  memoState.currentDetailId = noteId;

  try {
    const note = await window.memoApi.getNote(noteId);
    if (!note) {
      showToast('해당 메모를 찾을 수 없습니다.');
      return;
    }

    els.memoDetailId.value = note.id;
    els.memoDetailTitle.value = note.title || '';
    if (els.memoDetailType) els.memoDetailType.value = note.type || '개발';
    if (els.memoDetailStatus) els.memoDetailStatus.value = note.status || '';

    // 다중 내용 목록 채우기
    populateContentsContainer(els.memoDetailContentsContainer, note.contents, true);

    // 다중 링크 목록 채우기
    const links = Array.isArray(note.links) && note.links.length > 0 ? note.links : (note.link ? [note.link] : []);
    populateLinksContainer(els.memoDetailLinksContainer, links, true);

    if (els.memoDetailMeta) {
      const createdStr = note.createdAt ? new Date(note.createdAt).toLocaleString('ko-KR') : '';
      const updatedStr = note.updatedAt ? new Date(note.updatedAt).toLocaleString('ko-KR') : '';
      els.memoDetailMeta.textContent = `최초 등록: ${createdStr} | 최근 수정: ${updatedStr}`;
    }

    if (els.memoDetailError) {
      els.memoDetailError.textContent = '';
      els.memoDetailError.classList.add('hidden');
    }

    els.memoDetailModal.classList.remove('hidden');
  } catch (err) {
    console.error('메모 상세 조회 실패:', err);
    showToast(`메모 조회 실패: ${err.message}`);
  }
}

function closeMemoDetailModal() {
  if (els.memoDetailModal) {
    els.memoDetailModal.classList.add('hidden');
  }
}

async function handleUpdateMemo() {
  const id = parseInt(els.memoDetailId.value, 10);
  const title = els.memoDetailTitle.value.trim();
  const type = els.memoDetailType ? els.memoDetailType.value : '개발';
  const status = els.memoDetailStatus ? els.memoDetailStatus.value : '';
  const contents = getContentsFromContainer(els.memoDetailContentsContainer);
  const links = getLinksFromContainer(els.memoDetailLinksContainer);

  if (!title) {
    if (els.memoDetailError) {
      els.memoDetailError.textContent = '제목을 입력해 주세요.';
      els.memoDetailError.classList.remove('hidden');
    }
    els.memoDetailTitle.focus();
    return;
  }

  try {
    els.memoDetailSaveBtn.disabled = true;
    els.memoDetailSaveBtn.textContent = '저장 중...';

    await window.memoApi.updateNote(id, { title, type, status, contents, links });
    showToast('메모가 성공적으로 수정되었습니다.');
    closeMemoDetailModal();

    if (els.memoListModal && !els.memoListModal.classList.contains('hidden')) {
      loadMemoList();
    }
  } catch (err) {
    console.error('메모 수정 실패:', err);
    if (els.memoDetailError) {
      els.memoDetailError.textContent = `수정 실패: ${err.message}`;
      els.memoDetailError.classList.remove('hidden');
    }
  } finally {
    els.memoDetailSaveBtn.disabled = false;
    els.memoDetailSaveBtn.textContent = '저장';
  }
}

async function handleDeleteMemo(id) {
  if (!confirm('정말로 이 개발 메모를 삭제하시겠습니까?')) {
    return;
  }
  try {
    await window.memoApi.deleteNote(id);
    showToast('메모가 삭제되었습니다.');
    if (els.memoDetailModal && !els.memoDetailModal.classList.contains('hidden')) {
      closeMemoDetailModal();
    }
    loadMemoList();
  } catch (err) {
    console.error('메모 삭제 실패:', err);
    showToast(`메모 삭제 실패: ${err.message}`);
  }
}

// 4. 선택된 메모 대상 AI 요약
async function handleAiSummaryForNotes() {
  if (memoState.selectedIds.size === 0) {
    alert('AI 요약을 생성할 메모를 1개 이상 선택해 주세요.');
    return;
  }

  const selectedIdsArray = Array.from(memoState.selectedIds);
  const selectedNotes = memoState.notes.filter((n) => memoState.selectedIds.has(n.id));

  // AI 요약 모달 열기 및 로딩 표시
  if (!els.memoAiModal) return;
  els.memoAiModal.classList.remove('hidden');
  if (els.memoAiLoading) els.memoAiLoading.classList.remove('hidden');
  if (els.memoAiText) els.memoAiText.innerHTML = '';

  const cfg = loadConfig();
  const dates = selectedNotes.map((n) => n.writtenAt || n.date).filter(Boolean).sort();
  const minDate = dates[0] ? dates[0].slice(0, 10) : '';
  const maxDate = dates[dates.length - 1] ? dates[dates.length - 1].slice(0, 10) : '';
  const dateRangeStr = minDate === maxDate ? minDate : `${minDate} ~ ${maxDate}`;

  if (els.memoAiMeta) {
    els.memoAiMeta.innerHTML = `
      <span>선택된 메모: <strong>${selectedNotes.length}건</strong> (기간: ${dateRangeStr})</span>
      <span>모듈: <strong>${cfg.aiModule === 'antigravity' ? 'Antigravity CLI' : 'Copilot SDK'}</strong></span>
    `;
  }

  try {
    const aiConfig = {
      aiModule: cfg.aiModule,
      githubToken: cfg.githubToken,
      aiModels: parseAiModels(cfg.aiModels),
      agySkill: cfg.agySkill,
      agyWorkDir: cfg.agyWorkDir
    };

    const result = await window.memoApi.summarizeNotes({
      ids: selectedIdsArray,
      notes: selectedNotes,
      aiConfig
    });

    memoState.lastAiSummaryMarkdown = result.summary || '';
    const html = await window.jiraApi.renderMarkdown(memoState.lastAiSummaryMarkdown);
    if (els.memoAiText) {
      els.memoAiText.innerHTML = html;
    }
  } catch (err) {
    console.error('AI 요약 생성 실패:', err);
    if (els.memoAiText) {
      els.memoAiText.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded border border-red-200">
        <strong>요약 생성 실패:</strong> ${err.message}
      </div>`;
    }
  } finally {
    if (els.memoAiLoading) els.memoAiLoading.classList.add('hidden');
  }
}

function closeMemoAiModal() {
  if (els.memoAiModal) {
    els.memoAiModal.classList.add('hidden');
  }
}

// ---- 개발 메모 이벤트 리스너 바인딩 ----

// 헤더 퀵버튼
if (els.quickMemoCreateBtn) els.quickMemoCreateBtn.addEventListener('click', openMemoCreateModal);
if (els.quickMemoListBtn) els.quickMemoListBtn.addEventListener('click', openMemoListModal);

// 메모 추가 모달
if (els.memoCreateAddContentBtn && els.memoCreateContentsContainer) {
  els.memoCreateAddContentBtn.addEventListener('click', () => {
    const newRow = createContentInputRow({}, false);
    els.memoCreateContentsContainer.prepend(newRow);
    els.memoCreateContentsContainer.scrollTop = 0;
    const txtArea = newRow.querySelector('.memo-entry-text');
    if (txtArea) txtArea.focus();
  });
}
if (els.memoCreateAddLinkBtn && els.memoCreateLinksContainer) {
  els.memoCreateAddLinkBtn.addEventListener('click', () => {
    els.memoCreateLinksContainer.appendChild(createLinkInputRow('', false));
  });
}
if (els.memoCreateSaveBtn) els.memoCreateSaveBtn.addEventListener('click', handleCreateMemo);
if (els.memoCreateCancelBtn) els.memoCreateCancelBtn.addEventListener('click', closeMemoCreateModal);
if (els.memoCreateCloseX) els.memoCreateCloseX.addEventListener('click', closeMemoCreateModal);

// 메모 목록 모달
if (els.memoSearchBtn) els.memoSearchBtn.addEventListener('click', loadMemoList);
if (els.memoFilterKeyword) {
  els.memoFilterKeyword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadMemoList();
  });
}
if (els.memoFilterResetBtn) {
  els.memoFilterResetBtn.addEventListener('click', () => {
    els.memoFilterStart.value = getTwoWeeksAgoDateString();
    els.memoFilterEnd.value = getTodayDateString();
    if (els.memoFilterType) els.memoFilterType.value = '';
    els.memoFilterKeyword.value = '';
    loadMemoList();
  });
}
if (els.memoSelectAll) {
  els.memoSelectAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const checkboxes = els.memoTableBody.querySelectorAll('.memo-item-chk');
    checkboxes.forEach((chk) => {
      chk.checked = isChecked;
      const id = parseInt(chk.dataset.id, 10);
      if (isChecked) {
        memoState.selectedIds.add(id);
      } else {
        memoState.selectedIds.delete(id);
      }
    });
    updateSelectedCount();
  });
}
if (els.memoOpenCreateFromListBtn) {
  els.memoOpenCreateFromListBtn.addEventListener('click', () => {
    openMemoCreateModal();
  });
}
if (els.memoAiSummaryBtn) els.memoAiSummaryBtn.addEventListener('click', handleAiSummaryForNotes);
if (els.memoListCloseBtn) els.memoListCloseBtn.addEventListener('click', closeMemoListModal);
if (els.memoListCloseX) els.memoListCloseX.addEventListener('click', closeMemoListModal);

// 메모 상세 모달
if (els.memoDetailAddContentBtn && els.memoDetailContentsContainer) {
  els.memoDetailAddContentBtn.addEventListener('click', () => {
    const newRow = createContentInputRow({}, true);
    els.memoDetailContentsContainer.prepend(newRow);
    els.memoDetailContentsContainer.scrollTop = 0;
    const txtArea = newRow.querySelector('.memo-entry-text');
    if (txtArea) txtArea.focus();
  });
}
if (els.memoDetailAddLinkBtn && els.memoDetailLinksContainer) {
  els.memoDetailAddLinkBtn.addEventListener('click', () => {
    els.memoDetailLinksContainer.appendChild(createLinkInputRow('', true));
  });
}
if (els.memoDetailSaveBtn) els.memoDetailSaveBtn.addEventListener('click', handleUpdateMemo);
if (els.memoDetailDeleteBtn) {
  els.memoDetailDeleteBtn.addEventListener('click', () => {
    if (memoState.currentDetailId) handleDeleteMemo(memoState.currentDetailId);
  });
}
if (els.memoDetailBackBtn) els.memoDetailBackBtn.addEventListener('click', closeMemoDetailModal);
if (els.memoDetailCloseX) els.memoDetailCloseX.addEventListener('click', closeMemoDetailModal);

// AI 요약 결과 모달
if (els.memoAiCloseBtn) els.memoAiCloseBtn.addEventListener('click', closeMemoAiModal);
if (els.memoAiCloseX) els.memoAiCloseX.addEventListener('click', closeMemoAiModal);
if (els.memoAiCopyBtn) {
  els.memoAiCopyBtn.addEventListener('click', async () => {
    if (!memoState.lastAiSummaryMarkdown) return;
    try {
      await navigator.clipboard.writeText(memoState.lastAiSummaryMarkdown);
      showToast('요약 결과가 클립보드에 복사되었습니다.');
    } catch {
      showToast('클립보드 복사에 실패했습니다.');
    }
  });
}

// AI 요약 모달 내 링크 클릭 처리
if (els.memoAiText) {
  els.memoAiText.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const rawHref = link.getAttribute('href');
    if (!rawHref || rawHref === '#') return;
    e.preventDefault();
    if (rawHref.startsWith('http://') || rawHref.startsWith('https://') || rawHref.startsWith('mailto:')) {
      window.jiraApi.openInBrowser(rawHref).catch((err) => showToast(`링크를 열 수 없습니다: ${err.message}`));
    }
  });
}

// 메뉴 이벤트 연동
if (window.memoApi?.onOpenCreate) {
  window.memoApi.onOpenCreate(() => openMemoCreateModal());
}
if (window.memoApi?.onOpenList) {
  window.memoApi.onOpenList(() => openMemoListModal());
}

// 글로벌 단축키: Alt+M (추가), Alt+L (조회), Escape (닫기)
window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
    e.preventDefault();
    openMemoCreateModal();
  } else if (e.altKey && (e.key === 'l' || e.key === 'L' || e.code === 'KeyL')) {
    e.preventDefault();
    openMemoListModal();
  } else if (e.key === 'Escape') {
    if (els.memoAiModal && !els.memoAiModal.classList.contains('hidden')) {
      closeMemoAiModal();
    } else if (els.memoDetailModal && !els.memoDetailModal.classList.contains('hidden')) {
      closeMemoDetailModal();
    } else if (els.memoCreateModal && !els.memoCreateModal.classList.contains('hidden')) {
      closeMemoCreateModal();
    } else if (els.memoListModal && !els.memoListModal.classList.contains('hidden')) {
      closeMemoListModal();
    }
  }
});

// ---- 시작 ----
(async function initApp() {
  await loadConfigFromDb();
  await initSettingsForm();
  initSearchForm();
  showScreen('search');
})();


