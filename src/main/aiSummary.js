'use strict';

/**
 * AI 기반 이슈 요약 모듈.
 * - 이슈 내용/댓글을 바탕으로 담당자가 해야 할 업무를 요약합니다.
 * - 요약 파일이 이미 존재하고 이슈가 변경되지 않았으면 파일을 그대로 재사용합니다.
 * - 요약 파일이 없거나 이슈가 변경되었으면 @github/copilot-sdk 로 새로 생성합니다.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { app } = require('electron');

let CopilotSdkModule = null;
function loadCopilotSdk() {
  if (CopilotSdkModule === null) {
    try {
      // eslint-disable-next-line global-require
      CopilotSdkModule = require('@github/copilot-sdk');
    } catch (err) {
      CopilotSdkModule = false;
      console.error('@github/copilot-sdk 로드 실패:', err.message);
    }
  }
  return CopilotSdkModule || null;
}

// Electron의 process.execPath(Electron 바이너리)로 번들 CLI(index.js)를 실행하면
// 인자 파싱이 깨지므로, 플랫폼별 네이티브 copilot 실행 파일을 직접 사용한다.
// 패키징된 앱에서는 app.asar 내부에서 직접 실행 시 spawn ENOTDIR 가 발생하므로
// app.asar.unpacked 경로로 치환하고 실제 파일 존재 여부 및 권한을 확인한다.
function resolveNativeCliPath() {
  const binaryName = process.platform === 'win32' ? 'copilot.exe' : 'copilot';
  const packageName = `@github/copilot-${process.platform}-${process.arch}`;
  const candidates = [];

  try {
    const copilotEntryPath = require.resolve('@github/copilot/package.json');
    const resolved = require.resolve(packageName, { paths: [path.dirname(copilotEntryPath)] });
    if (resolved) {
      if (resolved.includes('app.asar')) {
        candidates.push(resolved.replace('app.asar', 'app.asar.unpacked'));
      }
      candidates.push(resolved);
    }
  } catch {
    // ignore
  }

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@github', `copilot-${process.platform}-${process.arch}`, binaryName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@github', 'copilot', 'node_modules', `@github/copilot-${process.platform}-${process.arch}`, binaryName)
    );
  }

  if (typeof app?.getAppPath === 'function') {
    const appPath = app.getAppPath();
    const unpackedBase = appPath.replace('app.asar', 'app.asar.unpacked');
    candidates.push(
      path.join(unpackedBase, 'node_modules', '@github', `copilot-${process.platform}-${process.arch}`, binaryName),
      path.join(unpackedBase, 'node_modules', '@github', 'copilot', 'node_modules', `@github/copilot-${process.platform}-${process.arch}`, binaryName)
    );
  }

  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(candidate)) {
        const stat = fsSync.statSync(candidate);
        if (stat.isFile()) {
          if (process.platform !== 'win32') {
            try {
              fsSync.chmodSync(candidate, 0o755);
            } catch {
              // ignore chmod failure
            }
          }
          return candidate;
        }
      }
    } catch {
      // ignore
    }
  }

  console.error('Copilot CLI 네이티브 바이너리를 찾지 못했습니다.');
  return null;
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
  const issueMarkdown = buildIssueMarkdown(issueDetail);

  return `다음 Jira Issue 내용 및 댓글 정보(Markdown)에서 설명과 댓글을 읽어 작업자(${issueDetail.assignee || '담당자'})가 해야 할 업무 내용을 정리해 주세요.
결과물은 Markdown 서식으로 작성해 주세요.

---

${issueMarkdown}
`;
}

/**
 * copilot-sdk 를 사용해 요약 텍스트 생성
 * @param {object} issueDetail - jiraClient.getIssueDetail() 결과
 * @param {string} [githubToken] - Copilot 인증에 사용할 GitHub 토큰
 * @param {string[]} [models] - 시도할 모델 이름 목록(순서대로 시도, 실패 시 다음 모델로 대체)
 */
async function generateSummaryText(issueDetail, githubToken, models) {
  const sdk = loadCopilotSdk();
  if (!sdk) {
    throw new Error('@github/copilot-sdk 를 사용할 수 없습니다. 패키지가 설치되어 있는지 확인해 주세요.');
  }
  const { CopilotClient, RuntimeConnection } = sdk;

  const summaryDir = getSummaryDir();
  try {
    await fs.mkdir(summaryDir, { recursive: true });
  } catch {
    // ignore
  }

  const token = sanitizeGithubToken(githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const clientOptions = {
    workingDirectory: summaryDir
  };
  if (token) {
    // 토큰을 명시적으로 전달해 macOS 키체인 기반 로그인 사용자 인증(비밀번호 반복 요청)을 건너뜁니다.
    clientOptions.gitHubToken = token;
    clientOptions.useLoggedInUser = false;
  }
  const nativeCliPath = resolveNativeCliPath();
  if (nativeCliPath) {
    clientOptions.connection = RuntimeConnection.forStdio({ path: nativeCliPath });
  }

  // 모델 목록이 비어 있으면 undefined 하나로 시도해 CLI의 기본 모델을 사용한다.
  const modelList = Array.isArray(models) && models.length ? models : [undefined];
  const prompt = buildSummaryPrompt(issueDetail);

  const client = new CopilotClient(clientOptions);
  try {
    await client.start();
    let lastError = null;
    for (const model of modelList) {
      let session;
      try {
        session = await client.createSession(model ? { model } : {});
        const result = await session.sendAndWait(prompt, 120000);
        const content = result?.data?.content || '요약을 생성하지 못했습니다.';
        await session.disconnect();
        return content;
      } catch (err) {
        lastError = err;
        console.error(`모델 "${model || '기본값'}"로 요약 생성 실패:`, err.message);
        if (session) {
          try {
            await session.disconnect();
          } catch {
            // ignore disconnect errors
          }
        }
      }
    }
    throw lastError || new Error('요약을 생성하지 못했습니다.');
  } catch (err) {
    if (token && /Bad credentials|401/i.test(err.message || '')) {
      throw new Error(
        '설정된 GitHub 토큰이 GitHub에서 거부되었습니다(Bad credentials). 토큰이 만료/취소되지 않았는지, ' +
          '복사 시 공백이나 따옴표가 포함되지 않았는지 확인하거나, 설정에서 토큰을 비워 두어 로컬에 로그인된 ' +
          'Copilot CLI 인증을 사용해 보세요.'
      );
    }
    throw err;
  } finally {
    try {
      await client.stop();
    } catch {
      // ignore stop errors
    }
  }
}

// 붙여넣기 과정에서 흔히 섞여 들어가는 'Bearer ' 접두어, 따옴표, 공백 제거
function sanitizeGithubToken(rawToken) {
  if (!rawToken) return '';
  return String(rawToken)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

const { execFile } = require('child_process');
const { splitAttachmentMarkers } = require('../shared/attachmentMarker');

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function encodeMarkdownUrl(url) {
  return encodeURI(url).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function convertMarkersToMarkdownLinks(text, baseDirRelative = 'files') {
  const segments = splitAttachmentMarkers(text || '');
  return segments
    .map((seg) => {
      if (seg.type !== 'attachment') {
        return seg.value;
      }
      const filename = seg.filename || (seg.path ? path.basename(seg.path) : 'file');
      const basename = seg.path ? path.basename(seg.path) : filename;
      const rawRelPath = `./${baseDirRelative}/${basename}`;
      const safeRelPath = encodeMarkdownUrl(rawRelPath);
      if (seg.kind === 'image') {
        return `\n![${filename}](${safeRelPath})\n`;
      }
      return `[📎 ${filename}](${safeRelPath})`;
    })
    .join('');
}

function buildIssueMarkdown(issueDetail) {
  const comments = issueDetail.comments || [];
  let commentsText = '';

  if (comments.length === 0) {
    commentsText = '등록된 댓글이 없습니다.';
  } else {
    commentsText = comments
      .map((c) => {
        const author = c.author || '알 수 없음';
        const created = c.created ? new Date(c.created).toLocaleString('ko-KR') : '';
        const parentFormatted = convertMarkersToMarkdownLinks(c.text, 'files');
        const parentText = parentFormatted.replace(/\n/g, '\n> ');
        let block = `### #${c.index || 1} 작성자: ${author} (${created})\n\n> ${parentText}\n`;

        if (Array.isArray(c.replies) && c.replies.length > 0) {
          const repliesText = c.replies
            .map((r) => {
              const rAuthor = r.author || '알 수 없음';
              const rCreated = r.created ? new Date(r.created).toLocaleString('ko-KR') : '';
              const childFormatted = convertMarkersToMarkdownLinks(r.text, 'files');
              const childText = childFormatted.replace(/\n/g, '\n>> ');
              return `\n#### #${r.index || 1} 작성자: ${rAuthor} (${rCreated}) [답글]\n\n>> ${childText}\n`;
            })
            .join('');
          block += repliesText;
        }
        return block;
      })
      .join('\n');
  }

  const descFormatted = convertMarkersToMarkdownLinks(issueDetail.description, 'files');

  return `# 이슈 상세 정보 [${issueDetail.key}]

- **제목**: ${issueDetail.summary || ''}
- **담당자**: ${issueDetail.assignee || ''}
- **상태**: ${issueDetail.status || ''}
- **URL**: ${issueDetail.webUrl || ''}

---

## 설명

${(descFormatted || '설명 없음').trim()}

---

## 댓글 (총 ${comments.length}개)

${commentsText}
`;
}

function resolveAgyCliPath() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, '.local', 'bin', 'agy'),
    '/usr/local/bin/agy',
    '/opt/homebrew/bin/agy'
  ];

  for (const c of candidates) {
    try {
      if (fsSync.existsSync(c)) {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return 'agy';
}

function getAgyEnv() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const extraPaths = [
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];

  const currentPath = process.env.PATH || '';
  const mergedPath = Array.from(new Set([...extraPaths, ...currentPath.split(':')])).join(':');

  return {
    ...process.env,
    PATH: mergedPath
  };
}

function runAntigravityCli(issueKey, workDir, agySkill) {
  return new Promise((resolve, reject) => {
    const agyPath = resolveAgyCliPath();
    const skillName = (agySkill && agySkill.trim()) || 'jira-ai-task';
    const args = ['--print', `${skillName} ${issueKey}`, '--dangerously-skip-permissions'];

    execFile(
      agyPath,
      args,
      {
        cwd: workDir,
        env: getAgyEnv(),
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Antigravity CLI 실행 실패: ${error.message}`);
          if (stderr) console.error(`CLI stderr: ${stderr}`);
          return reject(
            new Error(`Antigravity CLI 실행 중 오류가 발생했습니다: ${error.message}${stderr ? `\n${stderr}` : ''}`)
          );
        }
        resolve(stdout);
      }
    );
  });
}

function autoLinkAttachments(summaryText) {
  if (!summaryText) return '';
  const REGEX = /`?(\d+_[^`\n\r]+?\.(?:png|jpg|jpeg|gif|pdf|zip|docx|xlsx|pptx|txt|webp|svg))`?/gi;

  return summaryText.replace(REGEX, (match, filename, offset, string) => {
    const prevStr = string.slice(Math.max(0, offset - 20), offset);
    if (prevStr.includes('](') || prevStr.includes(']<')) {
      return match;
    }
    const relPath = `./files/${filename}`;
    const safeUrl = encodeMarkdownUrl(relPath);
    return `[📎 ${filename}](${safeUrl})`;
  });
}

async function getOrCreateAntigravitySummary(issueDetail, forceRefresh = false, agyWorkDir, agySkill) {
  const baseDir = (agyWorkDir && agyWorkDir.trim()) || '/Users/yangsukim/data/work/house_sara/jira-tasks';
  const todayStr = getTodayString();
  const issueKey = issueDetail.key;

  const tasksDir = path.join(baseDir, 'tasks', todayStr);
  const issuesDir = path.join(baseDir, 'issues', todayStr);

  const taskFilePath = path.join(tasksDir, `task_${issueKey}.md`);
  const issueFilePath = path.join(issuesDir, `view_${issueKey}.md`);

  // Step 1 & Step 2: 작업 요약 파일이 이미 존재하고 강제 새로고침이 아닌 경우
  if (!forceRefresh && fsSync.existsSync(taskFilePath)) {
    const summaryText = autoLinkAttachments(await fs.readFile(taskFilePath, 'utf-8'));
    const stat = await fs.stat(taskFilePath);
    return {
      issueKey,
      summary: summaryText,
      generatedAt: stat.mtimeMs,
      filePath: taskFilePath,
      fromCache: true,
      module: 'antigravity'
    };
  }

  // Step 3: 파일이 없거나 강제 새로고침인 경우
  // 3-1) 이슈 상세 마크다운 파일 저장
  await fs.mkdir(issuesDir, { recursive: true });
  const issueMarkdown = buildIssueMarkdown(issueDetail);
  await fs.writeFile(issueFilePath, issueMarkdown, 'utf-8');

  // 3-2) Antigravity CLI 실행 (작업 디렉터리: baseDir)
  await fs.mkdir(tasksDir, { recursive: true });
  await runAntigravityCli(issueKey, baseDir, agySkill);

  // 3-3) 생성된 결과 파일 확인
  if (!fsSync.existsSync(taskFilePath)) {
    throw new Error(`Antigravity CLI 작업이 완료되었으나 요약 파일(${taskFilePath})을 찾을 수 없습니다.`);
  }

  const summaryText = autoLinkAttachments(await fs.readFile(taskFilePath, 'utf-8'));
  const stat = await fs.stat(taskFilePath);
  return {
    issueKey,
    summary: summaryText,
    generatedAt: stat.mtimeMs,
    filePath: taskFilePath,
    fromCache: false,
    module: 'antigravity'
  };
}

/**
 * 이슈 요약을 조회하거나 새로 생성합니다.
 * @param {object} issueDetail - jiraClient.getIssueDetail() 결과
 * @param {boolean} forceRefresh - 강제로 재생성할지 여부
 * @param {string} [githubToken] - Copilot 인증에 사용할 GitHub 토큰
 * @param {string[]} [models] - 시도할 모델 이름 목록(순서대로 시도, 실패 시 다음 모델로 대체)
 */
async function getOrCreateSummary(issueDetail, forceRefresh = false, githubToken, models) {
  const issueKey = issueDetail.key;
  const existing = await readExistingSummary(issueKey);

  const issueUpdatedAt = issueDetail.updated ? new Date(issueDetail.updated).getTime() : null;

  if (existing && !forceRefresh) {
    const summaryUpdatedAt = existing.issueUpdatedAt;
    // 요약 생성 시점 이후 이슈가 변경되지 않았으면 기존 요약 재사용
    if (!issueUpdatedAt || !summaryUpdatedAt || issueUpdatedAt <= summaryUpdatedAt) {
      return { ...existing, fromCache: true, module: 'copilot' };
    }
  }

  const summaryText = await generateSummaryText(issueDetail, githubToken, models);
  const record = {
    issueKey,
    summary: summaryText,
    generatedAt: Date.now(),
    issueUpdatedAt: issueUpdatedAt || Date.now(),
    module: 'copilot'
  };
  const filePath = await saveSummary(issueKey, record);
  return { ...record, filePath, fromCache: false };
}

module.exports = {
  getSummaryDir,
  getSummaryFilePath,
  readExistingSummary,
  saveSummary,
  getOrCreateSummary,
  getOrCreateAntigravitySummary,
  getTodayString,
  buildIssueMarkdown
};
