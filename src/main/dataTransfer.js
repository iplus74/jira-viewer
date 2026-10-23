'use strict';

/**
 * 메모/설정 암호화 내보내기·가져오기
 * - 키 파생: scrypt (salt 16B), 암호화: AES-256-GCM (IV 12B, 인증 태그 16B)
 * - 파일 포맷(JSON): { magic, version, kind, kdf, salt, iv, tag, data } (바이너리는 base64)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const memoDb = require('./memoDb');

const MAGIC = 'JIRAVIEWER-EXPORT';
const VERSION = 1;
const KINDS = { memo: '메모', settings: '설정' };
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, SCRYPT);
}

function encryptPayload(kind, payloadObj, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${MAGIC}:${VERSION}:${kind}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(payloadObj), 'utf8'), cipher.final()]);
  return {
    magic: MAGIC,
    version: VERSION,
    kind,
    kdf: { name: 'scrypt', ...{ N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p } },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64')
  };
}

function decryptPayload(kind, text, password) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error('손상되었거나 올바르지 않은 파일입니다.');
  }
  if (!envelope || envelope.magic !== MAGIC || envelope.version !== VERSION) {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  if (envelope.kind !== kind) {
    throw new Error(`${KINDS[kind]} 파일이 아닙니다. (파일 종류: ${KINDS[envelope.kind] || envelope.kind})`);
  }
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error('bad');
    const key = deriveKey(password, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(`${MAGIC}:${VERSION}:${kind}`));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    throw new Error('비밀번호가 올바르지 않거나 파일이 손상되었습니다.');
  }
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function assertKind(kind) {
  if (!KINDS[kind]) throw new Error('알 수 없는 데이터 종류입니다.');
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('비밀번호를 입력해 주세요.');
  }
}

async function exportData({ kind, password, dir }) {
  assertKind(kind);
  assertPassword(password);
  if (!dir || typeof dir !== 'string') throw new Error('저장 폴더를 선택해 주세요.');

  const payload = kind === 'memo'
    ? { notes: await memoDb.exportAllNotesRaw() }
    : { settings: await memoDb.getAllSettings() };
  const envelope = encryptPayload(kind, payload, password);
  const filePath = path.join(dir, `jira-viewer-${kind}_${timestamp()}.jvexp`);
  fs.writeFileSync(filePath, JSON.stringify(envelope), { mode: 0o600 });
  return { filePath };
}

async function importData({ kind, password, filePath }) {
  assertKind(kind);
  assertPassword(password);
  if (!filePath || typeof filePath !== 'string') throw new Error('파일 경로를 선택해 주세요.');

  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`파일을 읽을 수 없습니다: ${err.message}`);
  }
  const payload = decryptPayload(kind, text, password);

  if (kind === 'memo') {
    const count = await memoDb.replaceAllNotesRaw(payload && payload.notes);
    return { count };
  }
  const settings = payload && payload.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('설정 데이터 형식이 올바르지 않습니다.');
  }
  await memoDb.saveSettings(settings);
  return { count: Object.keys(settings).length };
}

module.exports = { exportData, importData, encryptPayload, decryptPayload };
