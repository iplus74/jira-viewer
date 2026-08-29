'use strict';

/**
 * AI 기반 이슈 요약 모듈.
 * - 이슈 내용/댓글을 바탕으로 담당자가 해야 할 업무를 요약합니다.
 * - 요약 파일이 이미 존재하고 이슈가 변경되지 않았으면 파일을 그대로 재사용합니다.
 * - 요약 파일이 없거나 이슈가 변경되었으면 @github/copilot-sdk 로 새로 생성합니다.
 */

const fs = require('fs/promises');
const path = require('path');
const { app } = require('electron');

let CopilotClientCtor = null;
function loadCopilotClient() {
  if (CopilotClientCtor === null) {
    try {
      // eslint-disable-next-line global-require
      CopilotClientCtor = require('@github/copilot-sdk').CopilotClient;
    } catch (err) {
      CopilotClientCtor = false;
      console.error('@github/copilot-sdk 로드 실패:', err.message);
    }
  }
  return CopilotClientCtor || null;
}

function getSummaryDir() {
  const dir = path.join(app.getPath('userData'), 'issue-summaries');
  return dir;
}

function getSummaryFilePath(issueKey) {
  // 파일명 규칙: {이슈키}.summary.json (메타데이터 포함, 재사용 가능)
  return path.join(getSummaryDir(), `${issueKey}.summary.json`);
}

async function readExistingSummary(issueKey) {
  const filePath = getSummaryFilePath(issueKey);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveSummary(issueKey, summaryRecord) {
  const dir = getSummaryDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = getSummaryFilePath(issueKey);
  await fs.writeFile(filePath, JSON.stringify(summaryRecord, null, 2), 'utf-8');
  return filePath;
}

function buildSummaryPrompt(issueDetail) {
  const commentsText = (issueDetail.comments || [])
    .map((c) => {
      const replies = (c.replies || [])
        .map((r) => `    - 답글(${r.author}, ${r.created}): ${r.text}`)
        .join('\n');
      return `- 댓글(${c.author}, ${c.created}): ${c.text}${replies ? `\n${replies}` : ''}`;
    })
    .join('\n');

  return `다음은 Jira 이슈 정보입니다. 담당자(${issueDetail.assignee})가 처리해야 할 업무 내용을 한국어로 간결하게 정리해 주세요.
불릿 포인트 형식으로 "해야 할 일", "참고 사항", "다음 액션"을 구분하여 작성하세요.

이슈 키: ${issueDetail.key}
제목: ${issueDetail.summary}
상태: ${issueDetail.status}
URL: ${issueDetail.webUrl}

[설명]
${issueDetail.description}

[댓글]
${commentsText || '등록된 댓글이 없습니다.'}
`;
}

/**
 * copilot-sdk 를 사용해 요약 텍스트 생성
 */
async function generateSummaryText(issueDetail) {
  const CopilotClient = loadCopilotClient();
  if (!CopilotClient) {
    throw new Error('@github/copilot-sdk 를 사용할 수 없습니다. 패키지가 설치되어 있는지 확인해 주세요.');
  }

  const client = new CopilotClient();
  try {
    await client.start();
    const session = await client.createSession({});
    const prompt = buildSummaryPrompt(issueDetail);
    const result = await session.sendAndWait(prompt, 120000);
    const content = result?.data?.content || '요약을 생성하지 못했습니다.';
    await session.disconnect();
    return content;
  } finally {
    try {
      await client.stop();
    } catch {
      // ignore stop errors
    }
  }
}

/**
 * 이슈 요약을 조회하거나 새로 생성합니다.
 * @param {object} issueDetail - jiraClient.getIssueDetail() 결과
 * @param {boolean} forceRefresh - 강제로 재생성할지 여부
 */
async function getOrCreateSummary(issueDetail, forceRefresh = false) {
  const issueKey = issueDetail.key;
  const existing = await readExistingSummary(issueKey);

  const issueUpdatedAt = issueDetail.updated ? new Date(issueDetail.updated).getTime() : null;

  if (existing && !forceRefresh) {
    const summaryUpdatedAt = existing.issueUpdatedAt;
    // 요약 생성 시점 이후 이슈가 변경되지 않았으면 기존 요약 재사용
    if (!issueUpdatedAt || !summaryUpdatedAt || issueUpdatedAt <= summaryUpdatedAt) {
      return { ...existing, fromCache: true };
    }
  }

  const summaryText = await generateSummaryText(issueDetail);
  const record = {
    issueKey,
    summary: summaryText,
    generatedAt: Date.now(),
    issueUpdatedAt: issueUpdatedAt || Date.now()
  };
  const filePath = await saveSummary(issueKey, record);
  return { ...record, filePath, fromCache: false };
}

module.exports = {
  getSummaryDir,
  getSummaryFilePath,
  readExistingSummary,
  saveSummary,
  getOrCreateSummary
};
