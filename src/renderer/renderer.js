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
  currentIssueKey: null
};

// ---- 설정(로컬 스토리지) ----
function loadConfig() {
  return {
    jiraUrl: localStorage.getItem(STORAGE_KEYS.jiraUrl) || '',
    email: localStorage.getItem(STORAGE_KEYS.email) || '',
    token: localStorage.getItem(STORAGE_KEYS.token) || '',
    downloadDir: localStorage.getItem(STORAGE_KEYS.downloadDir) || '',
    aiModule: localStorage.getItem(STORAGE_KEYS.aiModule) || 'copilot',
    githubToken: localStorage.getItem(STORAGE_KEYS.githubToken) || '',
    aiModels: localStorage.getItem(STORAGE_KEYS.aiModels) || '',
    agySkill: localStorage.getItem(STORAGE_KEYS.agySkill) || 'jira-ai-task',
    agyWorkDir: localStorage.getItem(STORAGE_KEYS.agyWorkDir) || ''
  };
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEYS.jiraUrl, cfg.jiraUrl || '');
  localStorage.setItem(STORAGE_KEYS.email, cfg.email || '');
  localStorage.setItem(STORAGE_KEYS.token, cfg.token || '');
  localStorage.setItem(STORAGE_KEYS.downloadDir, cfg.downloadDir || '');
  localStorage.setItem(STORAGE_KEYS.aiModule, cfg.aiModule || 'copilot');
  localStorage.setItem(STORAGE_KEYS.githubToken, cfg.githubToken || '');
  localStorage.setItem(STORAGE_KEYS.aiModels, cfg.aiModels || '');
  localStorage.setItem(STORAGE_KEYS.agySkill, cfg.agySkill || 'jira-ai-task');
  localStorage.setItem(STORAGE_KEYS.agyWorkDir, cfg.agyWorkDir || '');
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
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.lastSearch) || '{}');
  } catch {
    return {};
  }
}

function saveLastSearch(search) {
  localStorage.setItem(STORAGE_KEYS.lastSearch, JSON.stringify(search));
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
  memoCreateDate: document.getElementById('memo-create-date'),
  memoCreateTitle: document.getElementById('memo-create-title'),
  memoCreateContent: document.getElementById('memo-create-content'),
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
  memoDetailDate: document.getElementById('memo-detail-date'),
  memoDetailTitle: document.getElementById('memo-detail-title'),
  memoDetailContent: document.getElementById('memo-detail-content'),
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

// ---- 초기화 ----
async function initSettingsForm() {
  const cfg = loadConfig();
  els.cfgJiraUrl.value = cfg.jiraUrl;
  els.cfgEmail.value = cfg.email;
  els.cfgToken.value = cfg.token;
  els.cfgDownloadDir.value = cfg.downloadDir;
  if (els.cfgAiModule) els.cfgAiModule.value = cfg.aiModule;
  els.cfgGithubToken.value = cfg.githubToken;
  els.cfgAiModels.value = cfg.aiModels;
  if (els.cfgAgySkill) els.cfgAgySkill.value = cfg.agySkill;
  if (els.cfgAgyWorkDir) {
    if (cfg.agyWorkDir) {
      els.cfgAgyWorkDir.value = cfg.agyWorkDir;
    } else if (window.jiraApi?.getDefaultAgyWorkDir) {
      els.cfgAgyWorkDir.value = await window.jiraApi.getDefaultAgyWorkDir();
    } else {
      els.cfgAgyWorkDir.value = '';
    }
  }
  toggleAiModuleSettings(cfg.aiModule);
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

els.settingsToggle.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.cfgCancel.addEventListener('click', () => {
  initSettingsForm();
  els.settingsPanel.classList.add('hidden');
});

if (els.cfgAiModule) {
  els.cfgAiModule.addEventListener('change', () => {
    toggleAiModuleSettings(els.cfgAiModule.value);
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

els.cfgSave.addEventListener('click', () => {
  saveConfig({
    jiraUrl: els.cfgJiraUrl.value.trim(),
    email: els.cfgEmail.value.trim(),
    token: els.cfgToken.value,
    downloadDir: els.cfgDownloadDir.value.trim(),
    aiModule: els.cfgAiModule ? els.cfgAiModule.value : 'copilot',
    githubToken: els.cfgGithubToken.value.trim(),
    aiModels: els.cfgAiModels.value.trim(),
    agySkill: els.cfgAgySkill ? els.cfgAgySkill.value.trim() : 'jira-ai-task',
    agyWorkDir: els.cfgAgyWorkDir ? els.cfgAgyWorkDir.value.trim() : ''
  });
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
    .replace(/>/g, '&gt;');
}

// 1초 후 자동으로 사라지는 토스트 팝업 표시
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#172b4d] text-white text-sm px-4 py-2 rounded-md shadow-lg z-50';
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

// 마크다운 형태의 링크([label](url))를 클릭 가능한 <a> 태그로 변환 (http/https/mailto만 허용, 나머지 텍스트는 escapeHtml 처리)
// label 안에 대괄호가 포함된 경우([KAN-811] 처럼)도 매칭되도록 지연(lazy) 매칭 사용
function linkifyText(text) {
  const LINK_REGEX = /\[([\s\S]*?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;
  const input = text || '';
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = LINK_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(input.slice(lastIndex, match.index));
    }
    const safeUrl = sanitizeExternalLinkUrl(match[2]);
    if (safeUrl) {
      result += `<a href="#" data-role="ext-link" data-url="${escapeHtml(safeUrl)}" class="text-[#0052cc] underline">${escapeHtml(match[1] || match[2])}</a>`;
    } else {
      result += escapeHtml(match[0]);
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
  showScreen('detail');
  els.issueDetail.innerHTML = '<div class="my-2.5 text-[13px] text-[#6b778c]">불러오는 중...</div>';

  try {
    const payload = { ...getJiraConfigPayload(), issueKey };
    const [detail, transitions] = await Promise.all([
      window.jiraApi.getIssue(payload),
      window.jiraApi.getTransitions(payload)
    ]);
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
let mentionDebounceTimer = null;

function getOrCreateMentionDropdown() {
  if (!mentionDropdownEl) {
    mentionDropdownEl = document.createElement('div');
    mentionDropdownEl.id = 'mention-dropdown-popup';
    mentionDropdownEl.className =
      'fixed z-[9999] hidden bg-white border border-[#dfe1e6] rounded shadow-lg max-h-48 overflow-y-auto w-64 text-xs';
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
  currentActiveMentionInput = target;

  clearTimeout(mentionDebounceTimer);
  mentionDebounceTimer = setTimeout(async () => {
    try {
      const users = await window.jiraApi.searchUsers({
        ...getJiraConfigPayload(),
        query,
        issueKey: state.currentIssueKey
      });
      if (!users || users.length === 0) {
        hideMentionDropdown();
        return;
      }
      showMentionDropdown(target, users);
    } catch {
      hideMentionDropdown();
    }
  }, 200);
});

// 맨션 사용자 드롭다운 클릭 이벤트
document.addEventListener('click', (e) => {
  const item = e.target.closest('.mention-item');
  if (item && currentActiveMentionInput) {
    const accountId = item.dataset.accountId;
    const displayName = item.dataset.displayName;
    const mentionText = `@${displayName}`;

    const input = currentActiveMentionInput;
    const inputId = input.id;
    const text = input.value;
    const cursorIndex = input.selectionStart;

    const before = text.slice(0, currentMentionQueryStart);
    const after = text.slice(cursorIndex);

    input.value = `${before}${mentionText} ${after}`;
    const newCursorPos = before.length + mentionText.length + 1;
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();

    if (!mentionsState.has(inputId)) {
      mentionsState.set(inputId, new Map());
    }
    mentionsState.get(inputId).set(accountId, { accountId, displayName, text: mentionText });

    hideMentionDropdown();
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
            <div class="flex justify-end gap-2 mt-1.5">
              <button class="btn-cancel-reply px-2.5 py-1 bg-[#ebecf0] hover:bg-[#dfe1e6] text-[#172b4d] text-xs font-medium rounded cursor-pointer border-0" data-comment-id="${c.id}">취소</button>
              <button class="btn-submit-reply px-2.5 py-1 bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold rounded cursor-pointer border-0" data-comment-id="${c.id}">답글 등록</button>
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
      <div class="flex justify-end mt-2">
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

  // 새 댓글 작성 버튼 클릭
  const submitCommentBtn = e.target.closest('#btn-submit-comment');
  if (submitCommentBtn) {
    const input = document.getElementById('new-comment-input');
    const text = input ? input.value.trim() : '';
    if (!text) {
      showToast('댓글 내용을 입력해 주세요.');
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
        mentions
      };
      const detail = await window.jiraApi.addComment(payload);
      mentionsState.delete('new-comment-input');
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
    }
    return;
  }

  // 답글 등록 버튼 클릭
  const submitReplyBtn = e.target.closest('.btn-submit-reply');
  if (submitReplyBtn) {
    const commentId = submitReplyBtn.dataset.commentId;
    const input = document.getElementById(`reply-input-${commentId}`);
    const text = input ? input.value.trim() : '';
    if (!text) {
      showToast('답글 내용을 입력해 주세요.');
      return;
    }
    submitReplyBtn.disabled = true;
    submitReplyBtn.textContent = '등록 중...';
    try {
      const inputId = `reply-input-${commentId}`;
      const mentions = mentionsState.has(inputId)
        ? Array.from(mentionsState.get(inputId).values())
        : [];

      const payload = {
        ...getJiraConfigPayload(),
        issueKey: state.currentIssueKey,
        commentText: text,
        parentId: commentId,
        mentions
      };
      const detail = await window.jiraApi.addComment(payload);
      mentionsState.delete(inputId);
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

// 1. 메모 추가 모달
function openMemoCreateModal() {
  if (!els.memoCreateModal) return;
  els.memoCreateDate.value = getTodayDateString();
  els.memoCreateTitle.value = '';
  els.memoCreateContent.value = '';
  populateLinksContainer(els.memoCreateLinksContainer, []);
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
  const date = els.memoCreateDate.value || getTodayDateString();
  const title = els.memoCreateTitle.value.trim();
  const content = els.memoCreateContent.value;
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

    await window.memoApi.createNote({ date, title, content, links });
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
  const keyword = (els.memoFilterKeyword.value || '').trim();

  try {
    if (els.memoTableBody) {
      els.memoTableBody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-[#6b778c]">메모 목록을 불러오는 중...</td></tr>';
    }

    const notes = await window.memoApi.listNotes({ startDate, endDate, keyword });
    memoState.notes = notes || [];
    memoState.selectedIds.clear();

    renderMemoTable(memoState.notes);
    updateSelectedCount();
  } catch (err) {
    console.error('메모 목록 조회 실패:', err);
    if (els.memoTableBody) {
      els.memoTableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-red-500">조회 실패: ${err.message}</td></tr>`;
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
    const titleBtn = document.createElement('button');
    titleBtn.className = 'cursor-pointer border-0 bg-transparent text-left font-medium text-[#0052cc] hover:underline p-0 text-sm max-w-[420px] truncate block';
    titleBtn.textContent = note.title;
    titleBtn.title = note.title;
    titleBtn.addEventListener('click', () => {
      openMemoDetailModal(note.id);
    });
    tdTitle.appendChild(titleBtn);

    // 날짜 td
    const tdDate = document.createElement('td');
    tdDate.className = 'py-2.5 px-3 text-[#42526e] text-xs whitespace-nowrap';
    tdDate.textContent = note.date || '';

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
    els.memoDetailDate.value = note.date || '';
    els.memoDetailTitle.value = note.title || '';
    els.memoDetailContent.value = note.content || '';

    const links = Array.isArray(note.links) && note.links.length > 0 ? note.links : (note.link ? [note.link] : []);
    populateLinksContainer(els.memoDetailLinksContainer, links, true);

    if (els.memoDetailMeta) {
      const createdStr = note.createdAt ? new Date(note.createdAt).toLocaleString('ko-KR') : '';
      els.memoDetailMeta.textContent = `작성일시: ${createdStr}`;
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
  const date = els.memoDetailDate.value || getTodayDateString();
  const title = els.memoDetailTitle.value.trim();
  const content = els.memoDetailContent.value;
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

    await window.memoApi.updateNote(id, { date, title, content, links });
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
    els.memoDetailSaveBtn.textContent = '수정 저장';
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
  const dates = selectedNotes.map((n) => n.date).filter(Boolean).sort();
  const minDate = dates[0] || '';
  const maxDate = dates[dates.length - 1] || '';
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
initSettingsForm();
initSearchForm();
showScreen('search');


