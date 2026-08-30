'use strict';

const STORAGE_KEYS = {
  jiraUrl: 'jv.jiraUrl',
  email: 'jv.email',
  token: 'jv.token',
  downloadDir: 'jv.downloadDir',
  githubToken: 'jv.githubToken',
  aiModels: 'jv.aiModels',
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
    githubToken: localStorage.getItem(STORAGE_KEYS.githubToken) || '',
    aiModels: localStorage.getItem(STORAGE_KEYS.aiModels) || ''
  };
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEYS.jiraUrl, cfg.jiraUrl || '');
  localStorage.setItem(STORAGE_KEYS.email, cfg.email || '');
  localStorage.setItem(STORAGE_KEYS.token, cfg.token || '');
  localStorage.setItem(STORAGE_KEYS.downloadDir, cfg.downloadDir || '');
  localStorage.setItem(STORAGE_KEYS.githubToken, cfg.githubToken || '');
  localStorage.setItem(STORAGE_KEYS.aiModels, cfg.aiModels || '');
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
  cfgGithubToken: document.getElementById('cfg-githubToken'),
  cfgAiModels: document.getElementById('cfg-aiModels'),
  cfgSave: document.getElementById('cfg-save'),
  cfgCancel: document.getElementById('cfg-cancel'),

  searchScreen: document.getElementById('search-screen'),
  searchType: document.getElementById('search-type'),
  searchStatus: document.getElementById('search-status'),
  searchEmail: document.getElementById('search-email'),
  searchMaxNum: document.getElementById('search-maxnum'),
  searchBtn: document.getElementById('search-btn'),
  searchStatusMsg: document.getElementById('search-status-msg'),
  issueList: document.getElementById('issue-list'),

  detailScreen: document.getElementById('detail-screen'),
  backBtn: document.getElementById('back-btn'),
  statusSelect: document.getElementById('status-select'),
  statusApplyBtn: document.getElementById('status-apply-btn'),
  aiSummaryBtn: document.getElementById('ai-summary-btn'),
  openBrowserBtn: document.getElementById('open-browser-btn'),
  issueDetail: document.getElementById('issue-detail'),

  aiModal: document.getElementById('ai-summary-modal'),
  aiModalClose: document.getElementById('ai-modal-close'),
  aiSummaryMeta: document.getElementById('ai-summary-meta'),
  aiSummaryText: document.getElementById('ai-summary-text'),
  aiRefreshBtn: document.getElementById('ai-refresh-btn')
};

// ---- 초기화 ----
function initSettingsForm() {
  const cfg = loadConfig();
  els.cfgJiraUrl.value = cfg.jiraUrl;
  els.cfgEmail.value = cfg.email;
  els.cfgToken.value = cfg.token;
  els.cfgDownloadDir.value = cfg.downloadDir;
  els.cfgGithubToken.value = cfg.githubToken;
  els.cfgAiModels.value = cfg.aiModels;
}

function initSearchForm() {
  const last = loadLastSearch();
  if (last.searchType) els.searchType.value = last.searchType;
  if (last.statusKey) els.searchStatus.value = last.statusKey;
  if (last.targetEmail) els.searchEmail.value = last.targetEmail;
  else els.searchEmail.value = loadConfig().email;
  if (last.maxNum) els.searchMaxNum.value = last.maxNum;
}

els.settingsToggle.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.cfgCancel.addEventListener('click', () => {
  initSettingsForm();
  els.settingsPanel.classList.add('hidden');
});

els.cfgChooseFolder.addEventListener('click', async () => {
  const selected = await window.jiraApi.chooseDownloadFolder();
  if (selected) {
    els.cfgDownloadDir.value = selected;
  }
});

els.cfgSave.addEventListener('click', () => {
  saveConfig({
    jiraUrl: els.cfgJiraUrl.value.trim(),
    email: els.cfgEmail.value.trim(),
    token: els.cfgToken.value,
    downloadDir: els.cfgDownloadDir.value.trim(),
    githubToken: els.cfgGithubToken.value.trim(),
    aiModels: els.cfgAiModels.value.trim()
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
  const maxNum = parseInt(els.searchMaxNum.value, 10) || 20;

  if (!targetEmail) {
    els.searchStatusMsg.textContent = '이메일을 입력해 주세요.';
    return;
  }

  saveLastSearch({ searchType, statusKey, targetEmail, maxNum });

  els.searchStatusMsg.textContent = '검색 중...';
  els.issueList.innerHTML = '';

  try {
    const payload = { ...getJiraConfigPayload(), searchType, targetEmail, statusKey, maxNum };
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
          <div class="ml-5 mt-2 mb-5 border-l-[3px] border-[#c1c7d0] pl-3">
            <div class="text-xs text-[#6b778c] mb-1">#${r.index} ${escapeHtml(r.author)} · ${new Date(r.created).toLocaleString('ko-KR')} [답글]</div>
            <div class="whitespace-pre-wrap leading-normal">${renderTextWithAttachments(r.text)}</div>
          </div>`
          )
          .join('');
        return `
        <div class="border-l-[3px] border-[#dfe1e6] pl-3 mb-5">
          <div class="text-xs text-[#6b778c] mb-1">#${c.index} ${escapeHtml(c.author)} · ${new Date(c.created).toLocaleString('ko-KR')}</div>
          <div class="whitespace-pre-wrap leading-normal">${renderTextWithAttachments(c.text)}</div>
          ${repliesHtml}
        </div>`;
      })
      .join('');
  }

  els.issueDetail.innerHTML = `
    <h2 class="mt-0 shrink-0">[${detail.key}] ${escapeHtml(detail.summary)}</h2>
    <div class="shrink-0 my-2.5 text-[13px] text-[#6b778c]">담당자: ${escapeHtml(detail.assignee)} · 상태: ${escapeHtml(detail.status)} · <a href="#" id="detail-webUrl">${escapeHtml(safeWebUrl || '유효하지 않은 URL')}</a></div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="whitespace-pre-wrap leading-[1.6] border-t border-b border-[#dfe1e6] py-3 my-3">${renderTextWithAttachments(detail.description)}</div>
      <h3>댓글 (총 ${detail.comments ? detail.comments.length : 0}개)</h3>
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

// 본문/댓글에 삽입된 첨부파일(이미지 외 파일) 클릭 시 기본 프로그램으로 열기
els.issueDetail.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-role="attachment-file-link"]');
  if (btn && btn.dataset.path) {
    window.jiraApi.openPath(btn.dataset.path);
    return;
  }
  const link = e.target.closest('[data-role="ext-link"]');
  if (link && link.dataset.url) {
    e.preventDefault();
    window.jiraApi.openInBrowser(link.dataset.url).catch((err) => showToast(`링크를 열 수 없습니다: ${err.message}`));
  }
});

els.openBrowserBtn.addEventListener('click', () => {
  if (state.currentIssueKey) {
    const cfg = loadConfig();
    window.jiraApi.openInBrowser(`${cfg.jiraUrl}/browse/${state.currentIssueKey}`);
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
  els.aiModal.classList.remove('hidden');
  els.aiSummaryMeta.textContent = forceRefresh ? '요약을 다시 생성하는 중...' : '요약을 불러오는 중...';
  els.aiSummaryText.textContent = '';

  try {
    const cfg = loadConfig();
    const payload = {
      ...getJiraConfigPayload(),
      issueKey: state.currentIssueKey,
      forceRefresh,
      githubToken: cfg.githubToken,
      aiModels: parseAiModels(cfg.aiModels)
    };
    const result = await window.jiraApi.getSummary(payload);
    els.aiSummaryText.textContent = result.summary;
    const generated = new Date(result.generatedAt).toLocaleString('ko-KR');
    els.aiSummaryMeta.textContent = result.fromCache
      ? `저장된 요약 (생성일시: ${generated})`
      : `새로 생성됨 (생성일시: ${generated})`;
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

// ---- 시작 ----
initSettingsForm();
initSearchForm();
showScreen('search');
