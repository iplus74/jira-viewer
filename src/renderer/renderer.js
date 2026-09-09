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
  aiRefreshBtn: document.getElementById('ai-refresh-btn')
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

// ---- 시작 ----
initSettingsForm();
initSearchForm();
showScreen('search');
