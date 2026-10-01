'use strict';

/**
 * Jira REST API 연동 모듈.
 * jira-finder/index.js 의 downloadIssues(), downloadMentionList(), downloadIssue() 로직을
 * 동일한 JQL/필터 규칙으로 재구현한 모듈입니다.
 */

const fs = require('fs');
const path = require('path');
const { buildAttachmentMarker } = require('../shared/attachmentMarker');

// URL 메타데이터(타이틀) 캐시
const urlTitleCache = new Map();
// 첨부파일 다운로드 캐시 (다운로드 폴더 + 첨부파일 ID 기준)
const attachmentDownloadCache = new Map();

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').trim() || 'file';
}

/**
 * 첨부파일을 지정된 폴더로 다운로드하고 로컬 절대 경로를 반환. 이미 받은 파일은 재사용.
 */
async function downloadAttachmentToFolder(attachment, downloadDir, config) {
  if (!downloadDir || !attachment || !attachment.content) return null;
  const cacheKey = `${downloadDir}::${attachment.id}`;
  if (attachmentDownloadCache.has(cacheKey)) {
    return attachmentDownloadCache.get(cacheKey);
  }

  try {
    fs.mkdirSync(downloadDir, { recursive: true });
    const safeName = `${attachment.id}_${sanitizeFilename(attachment.filename)}`;
    const destPath = path.join(downloadDir, safeName);

    if (!fs.existsSync(destPath)) {
      const headers = buildAuthHeaders(config);
      headers.Accept = '*/*';
      const response = await fetch(attachment.content, { method: 'GET', headers });
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
    }

    attachmentDownloadCache.set(cacheKey, destPath);
    return destPath;
  } catch (err) {
    console.error(`첨부파일(${attachment.filename}) 다운로드 실패:`, err.message);
    return null;
  }
}

function buildAuthHeaders(config) {
  const { email, token } = config;
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: authHeader
  };
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * URL로부터 웹페이지의 제목(Title) 또는 Jira 이슈 제목을 조회하는 함수
 */
async function fetchUrlTitle(url, config) {
  if (!url) return '';
  if (urlTitleCache.has(url)) {
    return urlTitleCache.get(url);
  }

  const headers = buildAuthHeaders(config);

  const jiraIssueMatch = url.match(/\/browse\/([A-Z0-9]+-\d+)/i);
  if (jiraIssueMatch) {
    const issueKey = jiraIssueMatch[1].toUpperCase();
    try {
      const issueRes = await fetch(`${config.jiraUrl}/rest/api/3/issue/${issueKey}?fields=summary`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(3000)
      });
      if (issueRes.ok) {
        const issueData = await issueRes.json();
        const issueSummary = issueData.fields?.summary;
        if (issueSummary) {
          const formattedTitle = `[${issueKey}] ${issueSummary}`;
          urlTitleCache.set(url, formattedTitle);
          return formattedTitle;
        }
      }
    } catch {
      // Jira API 조회 실패 시 fallback
    }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let charset = 'utf-8';
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      if (charsetMatch) {
        charset = charsetMatch[1].trim().toLowerCase();
      }

      const buffer = await response.arrayBuffer();
      let html = '';
      try {
        html = new TextDecoder(charset).decode(buffer);
      } catch {
        html = new TextDecoder('utf-8').decode(buffer);
      }

      if (charset === 'utf-8' && /charset=["']?euc-kr["']?/i.test(html)) {
        try {
          html = new TextDecoder('euc-kr').decode(buffer);
        } catch {
          // ignore
        }
      }

      let title = '';
      const ogMatch =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      if (ogMatch && ogMatch[1]) {
        title = ogMatch[1];
      } else {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        }
      }

      if (title) {
        title = decodeHtmlEntities(title.trim());
        urlTitleCache.set(url, title);
        return title;
      }
    }
  } catch {
    // 일반 웹페이지 title 조회 실패 시 fallback
  }

  urlTitleCache.set(url, url);
  return url;
}

/**
 * ADF(Atlassian Document Format)를 마크다운 텍스트로 변환
 */
async function adfToText(
  adf,
  attachments = [],
  isLocal = false,
  config,
  context = { depth: 0, listType: null, itemIndex: 1 },
  downloadDir = null
) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;

  let text = '';
  const type = adf.type;

  let prefix = '';
  let suffix = '';

  if (type === 'heading') {
    const level = adf.attrs?.level || 1;
    prefix = '#'.repeat(level) + ' ';
    suffix = '\n';
  } else if (type === 'paragraph') {
    suffix = '  \n';
  } else if (type === 'blockquote') {
    prefix = '> ';
    suffix = '\n';
  } else if (type === 'codeBlock') {
    const lang = adf.attrs?.language || '';
    prefix = `\`\`\`${lang}\n`;
    suffix = '\n```\n';
  } else if (type === 'bulletList') {
    context = { depth: context.depth + 1, listType: 'bullet' };
  } else if (type === 'orderedList') {
    context = { depth: context.depth + 1, listType: 'ordered' };
  } else if (type === 'taskList') {
    context = { depth: context.depth + 1, listType: 'task' };
  } else if (type === 'listItem') {
    const indent = '    '.repeat(Math.max(0, context.depth - 1));
    let listSign = '- ';
    if (context.listType === 'ordered') {
      const idx = context.itemIndex || 1;
      if (context.depth === 2) {
        const charCode = 96 + (idx % 26 || 26);
        listSign = `${String.fromCharCode(charCode)}. `;
      } else {
        listSign = `${idx}. `;
      }
    } else if (context.listType === 'bullet' && context.depth > 1) {
      listSign = '* ';
    }
    prefix = `${indent}${listSign}`;
    suffix = '';
  } else if (type === 'taskItem') {
    const indent = '    '.repeat(Math.max(0, context.depth - 1));
    const stateSign = adf.attrs?.state === 'DONE' ? '[x] ' : '[ ] ';
    prefix = `${indent}- ${stateSign}`;
    suffix = '';
  } else if (type === 'media') {
    const attrs = adf.attrs || {};
    if (attrs.type === 'external') {
      text += `\n[이미지: ${attrs.url}]\n`;
    } else if (attrs.type === 'file') {
      let matched = null;
      if (attrs.alt) {
        const cleanAlt = attrs.alt.normalize();
        matched = attachments.find((att) => att.filename && att.filename.normalize() === cleanAlt);
      }
      if (!matched) {
        let attachmentId = '';
        if (attrs.collection && attrs.collection.startsWith('issueAttachment-')) {
          attachmentId = attrs.collection.replace('issueAttachment-', '');
        }
        matched = attachments.find((att) => String(att.id) === attachmentId || String(att.id) === String(attrs.id));
      }

      if (matched) {
        if (downloadDir) {
          const localPath = await downloadAttachmentToFolder(matched, downloadDir, config);
          if (localPath) {
            const kind = (matched.mimeType || '').startsWith('image/') ? 'image' : 'file';
            text += `\n${buildAttachmentMarker(kind, localPath, matched.filename)}\n`;
          } else {
            text += `\n[첨부 이미지: ${matched.filename} (${matched.content})]\n`;
          }
        } else if (isLocal) {
          const localName = matched.localFilename || matched.filename;
          text += `\n![첨부 파일](./images/${localName})\n`;
        } else {
          text += `\n[첨부 이미지: ${matched.filename} (${matched.content})]\n`;
        }
      } else {
        text += `\n[첨부 이미지 ID: ${attrs.id}]\n`;
      }
    }
  } else if (type === 'mention') {
    text += adf.attrs?.text || '';
  } else if (type === 'hardBreak') {
    text += '  \n';
  } else if (type === 'emoji') {
    text += adf.attrs?.shortName || adf.attrs?.text || '';
  } else if (type === 'inlineCard' || type === 'blockCard' || type === 'embedCard') {
    const url = adf.attrs?.url || adf.attrs?.data?.url || '';
    if (url) {
      const title = await fetchUrlTitle(url, config);
      if (type === 'blockCard' || type === 'embedCard') {
        text += `\n[${title}](${url})\n`;
      } else {
        text += `[${title}](${url})`;
      }
    }
  }

  if (adf.text) {
    let nodeText = adf.text;
    if (adf.marks && Array.isArray(adf.marks)) {
      for (const mark of adf.marks) {
        if (mark.type === 'strong') {
          nodeText = `**${nodeText}**`;
        } else if (mark.type === 'em') {
          nodeText = `*${nodeText}*`;
        } else if (mark.type === 'strike') {
          nodeText = `~~${nodeText}~~`;
        } else if (mark.type === 'code') {
          nodeText = `\`${nodeText}\``;
        } else if (mark.type === 'link') {
          const href = mark.attrs?.href || '';
          let matchedAtt = null;
          if (attachments && attachments.length > 0) {
            matchedAtt = attachments.find(
              (att) => att.content === href || (att.id && href.includes(`/attachment/content/${att.id}`))
            );
          }
          if (matchedAtt && downloadDir) {
            const localPath = await downloadAttachmentToFolder(matchedAtt, downloadDir, config);
            if (localPath) {
              const kind = (matchedAtt.mimeType || '').startsWith('image/') ? 'image' : 'file';
              nodeText = buildAttachmentMarker(kind, localPath, matchedAtt.filename);
            } else {
              nodeText = `[${nodeText}](${href})`;
            }
          } else if (matchedAtt && isLocal && matchedAtt.localFilename) {
            nodeText = `![${nodeText}](./images/${matchedAtt.localFilename})`;
          } else {
            nodeText = `[${nodeText}](${href})`;
          }
        }
      }
    }
    text += nodeText;
  }

  if (adf.content && Array.isArray(adf.content)) {
    const isList = ['bulletList', 'orderedList', 'taskList'].includes(type);
    for (let index = 0; index < adf.content.length; index++) {
      const child = adf.content[index];
      const childContext = isList ? { ...context, itemIndex: index + 1 } : context;
      text += await adfToText(child, attachments, isLocal, config, childContext, downloadDir);
    }
  }

  if (prefix || suffix) {
    text = prefix + text + suffix;
  }

  if ((type === 'listItem' || type === 'taskItem') && !text.endsWith('\n')) {
    text += '\n';
  }

  return text;
}

/**
 * 특정 이슈의 댓글 목록을 가져오는 함수 (parentId 정보 포함)
 */
async function getIssueComments(issueKey, config) {
  const headers = buildAuthHeaders(config);
  const commentUrl = new URL(`${config.jiraUrl}/rest/api/3/issue/${issueKey}/comment`);
  commentUrl.searchParams.append('maxResults', '100');

  try {
    const response = await fetch(commentUrl, { method: 'GET', headers });
    if (!response.ok) {
      throw new Error(`Jira Comment API 요청 실패: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return data.comments || [];
  } catch (err) {
    console.error(`댓글 조회 실패 [${issueKey}]:`, err.message);
    return [];
  }
}

/**
 * 평탄화된(flat) 댓글 목록을 Jira API의 parentId 정보를 바탕으로 계층형 트리 구조로 조립
 * - 1-depth: 최상위 댓글 (parentId 없음), 작성일 최신순(내림차순) 정렬
 * - 2-depth: 부모 댓글(parentId 일치) 하위 답글, 작성일 오름차순 정렬
 */
function threadComments(comments) {
  const sortedByCreated = [...comments].sort((a, b) => new Date(a.created) - new Date(b.created));

  const rawList = sortedByCreated.map((comment, index) => ({
    ...comment,
    originalIndex: index + 1,
    replies: []
  }));

  const commentMap = new Map();
  rawList.forEach((c) => {
    commentMap.set(String(c.id), c);
  });

  const parentComments = [];

  rawList.forEach((comment) => {
    if (comment.parentId && commentMap.has(String(comment.parentId))) {
      const parent = commentMap.get(String(comment.parentId));
      parent.replies.push(comment);
    } else {
      parentComments.push(comment);
    }
  });

  parentComments.sort((a, b) => new Date(b.created) - new Date(a.created));
  parentComments.forEach((parent) => {
    parent.replies.sort((a, b) => new Date(a.created) - new Date(b.created));
  });

  return parentComments;
}

/**
 * ADF 트리를 순회하며 특정 accountId에 대한 mention 노드가 포함되어 있는지 확인
 */
function commentMentionsUser(adf, accountId) {
  if (!adf || typeof adf !== 'object') return false;
  if (adf.type === 'mention' && adf.attrs?.id === accountId) return true;
  if (Array.isArray(adf.content)) {
    return adf.content.some((child) => commentMentionsUser(child, accountId));
  }
  return false;
}

/**
 * 상태 select 값 -> JQL status 절 매핑
 * jira-finder downloadAllIssues() 의 statusKey 규칙과 동일
 */
function buildStatusClause(statusKey) {
  if (statusKey === 'default' || statusKey === '백로그·진행 중·검토 중') {
    return { clause: 'AND status IN ("Backlog", "In Progress", "백로그", "진행 중", "검토 중")', desc: '백로그/진행 중/검토 중' };
  }
  if (statusKey === 'test' || statusKey === '테스트 요청') {
    return { clause: 'AND status IN ("테스트 요청", "Test Request")', desc: '테스트 요청' };
  }
  if (statusKey === 'done' || statusKey === '완료') {
    return { clause: 'AND status IN ("Done", "완료")', desc: '완료' };
  }
  if (statusKey === 'all' || statusKey === '전체') {
    return { clause: '', desc: '모든 상태' };
  }
  return { clause: `AND status = "${statusKey}"`, desc: statusKey };
}

/**
 * 이메일을 사용하여 Jira 사용자 Account ID를 조회하는 함수
 */
async function getAccountIdByEmail(email, config) {
  const headers = buildAuthHeaders(config);
  const searchUrl = new URL(`${config.jiraUrl}/rest/api/3/user/search`);
  searchUrl.searchParams.append('query', email);

  try {
    const response = await fetch(searchUrl, { method: 'GET', headers });
    if (!response.ok) {
      throw new Error(`Jira User Search API 요청 실패: ${response.status} - ${await response.text()}`);
    }
    const users = await response.json();
    if (!users || users.length === 0) {
      return null;
    }
    const matchedUser =
      users.find((u) => u.emailAddress && u.emailAddress.toLowerCase() === email.toLowerCase()) || users[0];
    return matchedUser ? matchedUser.accountId : null;
  } catch (error) {
    console.error(`이메일(${email})로 Account ID를 조회하는 중 오류 발생:`, error.message);
    return null;
  }
}

/**
 * 키워드로 Jira 사용자를 검색하는 함수 (맨션 자동완성용)
 */
async function searchUsers(query, config, issueKey) {
  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery && !issueKey) return [];
  const headers = buildAuthHeaders(config);
  let searchUrl;
  if (issueKey) {
    searchUrl = new URL(`${config.jiraUrl}/rest/api/3/user/assignable/search`);
    searchUrl.searchParams.append('issueKey', issueKey);
    if (trimmedQuery) {
      searchUrl.searchParams.append('query', trimmedQuery);
    }
  } else {
    searchUrl = new URL(`${config.jiraUrl}/rest/api/3/user/search`);
    searchUrl.searchParams.append('query', trimmedQuery);
  }
  searchUrl.searchParams.append('maxResults', '10');

  try {
    const response = await fetch(searchUrl, { method: 'GET', headers });
    if (!response.ok) return [];
    const users = await response.json();
    return (users || []).map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName || u.emailAddress || '알 수 없는 사용자',
      emailAddress: u.emailAddress || '',
      avatarUrl: u.avatarUrls ? (u.avatarUrls['24x24'] || u.avatarUrls['48x48']) : ''
    }));
  } catch (err) {
    console.error('사용자 검색 실패:', err.message);
    return [];
  }
}

/**
 * '이슈' 검색: 담당자 == email 및/또는 제목 == keyword, 상태 == statusKey.
 */
async function searchAssignedIssues(config, { email, keyword, statusKey = 'default', maxResults = 20 }) {
  const headers = buildAuthHeaders(config);
  const clauses = [];
  let accountId = null;

  if (email) {
    accountId = await resolveAccountId(email, config);
    if (!accountId) {
      throw new Error(`이메일(${email})에 해당하는 Jira 사용자를 찾을 수 없습니다.`);
    }
    clauses.push(`assignee = "${accountId}"`);
  }

  if (keyword) {
    const escapedKeyword = keyword.replace(/"/g, '\\"');
    clauses.push(`summary ~ "${escapedKeyword}"`);
  }

  const { clause: statusClause, desc: statusDesc } = buildStatusClause(statusKey);
  if (statusClause) {
    clauses.push(statusClause.replace(/^AND\s+/, ''));
  }

  const jql = `${clauses.join(' AND ')} ORDER BY created DESC`.trim().replace(/\s+/g, ' ');

  const searchUrl = new URL(`${config.jiraUrl}/rest/api/3/search/jql`);
  searchUrl.searchParams.append('jql', jql);
  searchUrl.searchParams.append('maxResults', String(maxResults));
  searchUrl.searchParams.append('fields', 'key,summary,status,assignee');

  const response = await fetch(searchUrl, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Jira API 요청 실패: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  const issues = (data.issues || []).map((issue) => formatIssueListItem(issue));
  return { issues, statusDesc, accountId };
}

/**
 * '맨션된 이슈' 검색: 담당자 != email, 백로그/진행 중/테스트 요청 상태, 댓글에서 email이 맨션되었으나
 * 해당 댓글에 대댓글이 없거나 대댓글 작성자가 email이 아닌 이슈.
 */
async function searchMentionedIssues(config, { email, keyword, statusKey = 'default', maxResults = 20 }) {
  const headers = buildAuthHeaders(config);
  const accountId = await resolveAccountId(email, config);
  if (!accountId) {
    throw new Error(`이메일(${email})에 해당하는 Jira 사용자를 찾을 수 없습니다.`);
  }

  const clauses = [`assignee != "${accountId}"`];
  if (keyword) {
    const escapedKeyword = keyword.replace(/"/g, '\\"');
    clauses.push(`summary ~ "${escapedKeyword}"`);
  }
  let statusDesc;

  if (statusKey === 'default' || statusKey === '백로그·진행 중·검토 중') {
    clauses.push('status IN ("Backlog", "In Progress", "테스트 요청", "백로그", "진행 중", "Test Request")');
    statusDesc = '백로그/진행 중/테스트 요청';
  } else if (statusKey === 'all' || statusKey === '전체') {
    statusDesc = '모든 상태';
  } else {
    const built = buildStatusClause(statusKey);
    statusDesc = built.desc;
    if (built.clause) {
      clauses.push(built.clause.replace(/^AND\s+/, ''));
    }
  }

  const jql = `${clauses.join(' AND ')} ORDER BY created DESC`.trim().replace(/\s+/g, ' ');

  const searchUrl = new URL(`${config.jiraUrl}/rest/api/3/search/jql`);
  searchUrl.searchParams.append('jql', jql);
  searchUrl.searchParams.append('maxResults', String(maxResults));
  searchUrl.searchParams.append('fields', 'key,summary,status,assignee');

  const response = await fetch(searchUrl, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Jira API 요청 실패: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  const issues = data.issues || [];
  const matched = [];

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const issue of issues) {
    const comments = await getIssueComments(issue.key, config);
    if (comments.length === 0) continue;

    const threaded = threadComments(comments);
    const isMatch = threaded.some((parent) => {
      const hasUserReplied = parent.replies && parent.replies.some((reply) => reply.author?.accountId === accountId);
      if (hasUserReplied) return false;

      const isParentMentionRecent =
        commentMentionsUser(parent.body, accountId) &&
        parent.created &&
        now - new Date(parent.created).getTime() <= SEVEN_DAYS_MS;

      if (isParentMentionRecent) return true;

      const isReplyMentionRecent =
        parent.replies &&
        parent.replies.some(
          (reply) =>
            commentMentionsUser(reply.body, accountId) &&
            reply.created &&
            now - new Date(reply.created).getTime() <= SEVEN_DAYS_MS
        );

      return isReplyMentionRecent;
    });

    if (isMatch) {
      matched.push(formatIssueListItem(issue));
    }
  }

  return { issues: matched, statusDesc, accountId };
}

function formatIssueListItem(issue) {
  return {
    key: issue.key,
    summary: issue.fields?.summary || '제목 없음',
    status: issue.fields?.status?.name || '알 수 없음',
    assignee: issue.fields?.assignee?.displayName || '미배정'
  };
}

async function resolveAccountId(emailOrAccountId, config) {
  if (!emailOrAccountId) return null;
  if (!emailOrAccountId.includes('@')) return emailOrAccountId;
  return getAccountIdByEmail(emailOrAccountId, config);
}

/**
 * 이슈 상세 조회. downloadIssue()/getIssueDetails() 포맷 참고.
 */
async function getIssueDetail(issueKey, config, downloadDir = null, extraAttachments = []) {
  const headers = buildAuthHeaders(config);
  const issueUrl = new URL(`${config.jiraUrl}/rest/api/3/issue/${issueKey}`);
  issueUrl.searchParams.append('fields', 'summary,description,comment,attachment,status,assignee');

  const response = await fetch(issueUrl, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Jira API 요청 실패: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  const fields = data.fields || {};

  const summary = fields.summary || '제목 없음';
  const rawDescription = fields.description;
  const attachments = fields.attachment || [];

  // 방금 업로드한 첨부파일이 Jira 목록 조회에 아직 반영되지 않았을 수 있어 병합
  for (const extra of extraAttachments || []) {
    if (!attachments.some((att) => String(att.id) === String(extra.id))) {
      attachments.push(extra);
    }
  }

  const status = fields.status?.name || '알 수 없음';
  const assignee = fields.assignee?.displayName || '미배정';
  const descriptionText =
    (await adfToText(rawDescription, attachments, false, config, undefined, downloadDir)).trim() || '설명 없음';

  const comments = await getIssueComments(issueKey, config);
  const webUrl = `${config.jiraUrl}/browse/${issueKey}`;

  const threaded = threadComments(comments);
  const commentList = [];
  for (const parent of threaded) {
    const parentText = (await adfToText(parent.body, attachments, false, config, undefined, downloadDir)).trim();
    const replies = [];
    for (const child of parent.replies) {
      replies.push({
        id: child.id,
        author: child.author?.displayName || '알 수 없음',
        accountId: child.author?.accountId || '',
        created: child.created,
        text: (await adfToText(child.body, attachments, false, config, undefined, downloadDir)).trim(),
        index: child.originalIndex
      });
    }
    commentList.push({
      id: parent.id,
      author: parent.author?.displayName || '알 수 없음',
      accountId: parent.author?.accountId || '',
      created: parent.created,
      text: parentText,
      index: parent.originalIndex,
      replies
    });
  }

  const attachmentList = attachments.map((att) => ({
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
    content: att.content
  }));

  return {
    key: issueKey,
    summary,
    status,
    assignee,
    webUrl,
    description: descriptionText,
    comments: commentList,
    attachments: attachmentList,
    updated: data.fields?.updated || null,
    rawUpdated: data.fields?.updated
  };
}

/**
 * 이슈 상태 변경 (트랜지션 API 사용)
 */
async function getAvailableTransitions(issueKey, config) {
  const headers = buildAuthHeaders(config);
  const url = new URL(`${config.jiraUrl}/rest/api/3/issue/${issueKey}/transitions`);
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Jira 트랜지션 조회 실패: ${response.status} - ${await response.text()}`);
  }
  const data = await response.json();
  return data.transitions || [];
}

async function transitionIssueStatus(issueKey, targetStatusName, config) {
  const transitions = await getAvailableTransitions(issueKey, config);
  const match = transitions.find(
    (t) => t.name === targetStatusName || t.to?.name === targetStatusName
  );
  if (!match) {
    throw new Error(`'${targetStatusName}' 상태로 전환 가능한 트랜지션을 찾을 수 없습니다.`);
  }

  const headers = buildAuthHeaders(config);
  const url = new URL(`${config.jiraUrl}/rest/api/3/issue/${issueKey}/transitions`);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transition: { id: match.id } })
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Jira 상태 변경 실패: ${response.status} - ${await response.text()}`);
  }
  return true;
}

/**
 * 텍스트를 Jira REST API v3 ADF(Atlassian Document Format) 객체로 변환 (맨션 지원)
 */
function textToAdfDoc(text, mentions = []) {
  const lines = (text || '').split('\n');
  const validMentions = (mentions || []).filter((m) => m && m.accountId);

  const content = lines.map((line) => {
    if (!line) {
      return { type: 'paragraph', content: [] };
    }

    if (validMentions.length === 0) {
      return { type: 'paragraph', content: [{ type: 'text', text: line }] };
    }

    const lineContent = [];
    let remaining = line;

    while (remaining.length > 0) {
      let earliestMatch = null;
      let earliestPos = -1;
      let matchedMention = null;

      for (const m of validMentions) {
        const mentionText = m.text || `@${m.displayName}`;
        const pos = remaining.indexOf(mentionText);
        if (pos !== -1 && (earliestPos === -1 || pos < earliestPos)) {
          earliestPos = pos;
          earliestMatch = mentionText;
          matchedMention = m;
        }
      }

      if (earliestPos !== -1 && earliestMatch && matchedMention) {
        if (earliestPos > 0) {
          lineContent.push({ type: 'text', text: remaining.slice(0, earliestPos) });
        }
        lineContent.push({
          type: 'mention',
          attrs: {
            id: matchedMention.accountId,
            text: earliestMatch,
            userType: 'DEFAULT'
          }
        });
        remaining = remaining.slice(earliestPos + earliestMatch.length);
      } else {
        lineContent.push({ type: 'text', text: remaining });
        break;
      }
    }

    return { type: 'paragraph', content: lineContent };
  });

  return {
    type: 'doc',
    version: 1,
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }]
  };
}

const EXT_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.zip': 'application/zip'
};

function guessMimeType(filePath) {
  return EXT_MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function getAttachmentIcon(mimeType) {
  const type = mimeType || '';
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎞️';
  if (type.startsWith('audio/')) return '🎵';
  if (type === 'application/pdf') return '📄';
  if (type === 'application/zip') return '🗜️';
  return '📎';
}

/**
 * 로컬 파일들을 이슈 첨부파일로 업로드하고 업로드된 첨부파일 메타데이터 배열 반환
 */
async function uploadAttachments(issueKey, filePaths, config) {
  if (!filePaths || filePaths.length === 0) return [];

  const { Authorization } = buildAuthHeaders(config);
  const headers = { Authorization, Accept: 'application/json', 'X-Atlassian-Token': 'no-check' };
  const url = `${config.jiraUrl}/rest/api/3/issue/${issueKey}/attachments`;

  const form = new FormData();
  for (const filePath of filePaths) {
    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    form.append('file', new Blob([buffer], { type: guessMimeType(filePath) }), filename);
  }

  const response = await fetch(url, { method: 'POST', headers, body: form });
  if (!response.ok) {
    throw new Error(`Jira 첨부파일 업로드 실패 (${response.status}): ${await response.text()}`);
  }
  return await response.json();
}

/**
 * 특정 이슈에 댓글 또는 대댓글(답글) 등록 (이미지/첨부파일 동시 첨부 가능)
 *
 * 참고: 업로드한 첨부파일을 댓글 본문에 ADF media 노드로 직접 삽입하면 Jira가
 * "ATTACHMENT_VALIDATION_ERROR"로 거부한다(클래식 첨부 업로드는 즉시 참조 가능한
 * Media API 컬렉션에 등록되지 않음). 따라서 파일은 이슈 첨부파일로 업로드만 하고,
 * 댓글 본문에는 다운로드 링크 형태로 참조를 남긴다.
 */
async function addComment(issueKey, commentText, parentId, config, mentions = [], attachmentPaths = []) {
  const headers = buildAuthHeaders(config);
  const commentUrl = `${config.jiraUrl}/rest/api/3/issue/${issueKey}/comment`;

  const adfDoc = textToAdfDoc(commentText, mentions);
  let uploaded = [];

  if (attachmentPaths && attachmentPaths.length > 0) {
    uploaded = await uploadAttachments(issueKey, attachmentPaths, config);

    // 텍스트 없이 첨부파일만 등록하는 경우 자동 생성된 빈 문단은 제거
    if (!commentText || !commentText.trim()) {
      adfDoc.content = adfDoc.content.filter((node) => node.type !== 'paragraph' || (node.content && node.content.length > 0));
    }

    for (const att of uploaded) {
      adfDoc.content.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `${getAttachmentIcon(att.mimeType)} ${att.filename}`,
            marks: [{ type: 'link', attrs: { href: att.content } }]
          }
        ]
      });
    }
  }

  const bodyData = { body: adfDoc };

  if (parentId) {
    bodyData.parentId = String(parentId);
  }

  const response = await fetch(commentUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyData)
  });


  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Jira 댓글 등록 실패 (${response.status}): ${errText}`);
  }

  const comment = await response.json();
  return { comment, uploadedAttachments: uploaded };
}

module.exports = {
  buildAuthHeaders,
  adfToText,
  getIssueComments,
  threadComments,
  commentMentionsUser,
  getAccountIdByEmail,
  searchUsers,
  resolveAccountId,
  searchAssignedIssues,
  searchMentionedIssues,
  getIssueDetail,
  getAvailableTransitions,
  transitionIssueStatus,
  buildStatusClause,
  addComment
};
