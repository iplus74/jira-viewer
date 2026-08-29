'use strict';

const STORAGE_KEYS = {
  jiraUrl: 'jv.jiraUrl',
  email: 'jv.email',
  token: 'jv.token',
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
    token: localStorage.getItem(STORAGE_KEYS.token) || ''
  };
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEYS.jiraUrl, cfg.jiraUrl || '');
  localStorage.setItem(STORAGE_KEYS.email, cfg.email || '');
  localStorage.setItem(STORAGE_KEYS.token, cfg.token || '');
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

els.cfgSave.addEventListener('click', () => {
  saveConfig({
    jiraUrl: els.cfgJiraUrl.value.trim(),
    email: els.cfgEmail.value.trim(),
    token: els.cfgToken.value
  });
  els.settingsPanel.classList.add('hidden');
});

function getJiraConfigPayload() {
  const cfg = loadConfig();
  return { jiraUrl: cfg.jiraUrl, email: cfg.email, token: cfg.token };
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
    els.issueList.innerHTML = '<div class="status-msg">조건에 맞는 이슈가 없습니다.</div>';
    return;
  }
  issues.forEach((issue) => {
    const card = document.createElement('div');
    card.className = 'issue-card';
    card.innerHTML = `
      <div class="issue-title">[${issue.key}] ${escapeHtml(issue.summary)}</div>
      <div class="issue-meta">담당자: ${escapeHtml(issue.assignee)} · 상태: ${escapeHtml(issue.status)}</div>
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

// ---- 이슈 상세 ----
async function openIssueDetail(issueKey) {
  state.currentIssueKey = issueKey;
  showScreen('detail');
  els.issueDetail.innerHTML = '<div class="status-msg">불러오는 중...</div>';

  try {
    const payload = { ...getJiraConfigPayload(), issueKey };
    const [detail, transitions] = await Promise.all([
      window.jiraApi.getIssue(payload),
      window.jiraApi.getTransitions(payload)
    ]);
    renderIssueDetail(detail);
    renderStatusOptions(transitions, detail.status);
  } catch (err) {
    els.issueDetail.innerHTML = `<div class="status-msg">오류: ${escapeHtml(err.message)}</div>`;
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
  let commentsHtml = '';
  if (!detail.comments || detail.comments.length === 0) {
    commentsHtml = '<div class="status-msg">등록된 댓글이 없습니다.</div>';
  } else {
    commentsHtml = detail.comments
      .map((c) => {
        const repliesHtml = (c.replies || [])
          .map(
            (r) => `
          <div class="comment-reply">
            <div class="comment-meta">#${r.index} ${escapeHtml(r.author)} · ${new Date(r.created).toLocaleString('ko-KR')} [답글]</div>
            <div class="comment-text">${escapeHtml(r.text)}</div>
          </div>`
          )
          .join('');
        return `
        <div class="comment-block">
          <div class="comment-meta">#${c.index} ${escapeHtml(c.author)} · ${new Date(c.created).toLocaleString('ko-KR')}</div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
          ${repliesHtml}
        </div>`;
      })
      .join('');
  }

  els.issueDetail.innerHTML = `
    <h2>[${detail.key}] ${escapeHtml(detail.summary)}</h2>
    <div class="status-msg">담당자: ${escapeHtml(detail.assignee)} · 상태: ${escapeHtml(detail.status)} · <a href="#" id="detail-webUrl">${detail.webUrl}</a></div>
    <div class="issue-desc">${escapeHtml(detail.description)}</div>
    <h3>댓글 (총 ${detail.comments ? detail.comments.length : 0}개)</h3>
    ${commentsHtml}
  `;

  const link = document.getElementById('detail-webUrl');
  if (link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.jiraApi.openInBrowser(detail.webUrl);
    });
  }
}

els.backBtn.addEventListener('click', () => {
  showScreen('search');
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
    const payload = { ...getJiraConfigPayload(), issueKey: state.currentIssueKey, forceRefresh };
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
