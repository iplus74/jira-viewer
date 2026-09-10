'use strict';

/**
 * 개발 업무 메모 SQLite 데이터베이스 모듈
 * - sql.js (WebAssembly SQLite) 기반으로 동작하여 추가적인 네이티브 빌드 도구 없이 동작합니다.
 * - app.getPath('userData') 하위의 dev_notes.sqlite 파일로 자동 영속화됩니다.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const initSqlJs = require('sql.js');

let dbInstance = null;
let SQL = null;
let dbFilePath = null;

function getDbFilePath() {
  if (!dbFilePath) {
    let baseDir = '';
    try {
      baseDir = app.getPath('userData');
    } catch {
      baseDir = process.env.APPDATA || process.env.HOME || '.';
    }
    dbFilePath = path.join(baseDir, 'dev_notes.sqlite');
  }
  return dbFilePath;
}

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!SQL) {
    SQL = await initSqlJs();
  }

  const filePath = getDbFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.error('기존 SQLite 파일 로드 실패, 새 데이터베이스를 생성합니다:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // 테이블 및 인덱스 초기화
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS dev_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dev_notes_date ON dev_notes(date);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  persistDb();
  return dbInstance;
}

function persistDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(getDbFilePath(), buffer);
  } catch (err) {
    console.error('SQLite 데이터베이스 파일 저장 실패:', err);
  }
}

function getNowFormattedString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeLinks(linkInput) {
  if (!linkInput) return '';
  let linksArray = [];
  if (Array.isArray(linkInput)) {
    linksArray = linkInput.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof linkInput === 'string') {
    const trimmed = linkInput.trim();
    if (!trimmed) return '';
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        linksArray = parsed.map((s) => String(s).trim()).filter(Boolean);
      } else if (typeof parsed === 'string' && parsed.trim()) {
        linksArray = [parsed.trim()];
      }
    } catch {
      linksArray = trimmed
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return linksArray.length > 0 ? JSON.stringify(linksArray) : '';
}

function parseLinks(rawLink) {
  if (!rawLink) return [];
  if (Array.isArray(rawLink)) {
    return rawLink.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof rawLink === 'string') {
    const trimmed = rawLink.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
      if (typeof parsed === 'string' && parsed.trim()) {
        return [parsed.trim()];
      }
    } catch {
      return trimmed
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * [작성일시, 내용] 다중 항목 데이터 정규화 (JSON 문자열로 직렬화)
 */
function normalizeContents(contentsInput, fallbackDate = '') {
  if (!contentsInput) return JSON.stringify([]);
  let items = [];

  if (Array.isArray(contentsInput)) {
    items = contentsInput.map((item, idx) => {
      const writtenAt = (item.writtenAt || item.date || fallbackDate || getNowFormattedString()).trim();
      const text = (item.text || item.content || '').trim();
      return {
        id: item.id || `entry_${Date.now()}_${idx}`,
        writtenAt,
        text
      };
    }).filter((item) => item.text || item.writtenAt);
  } else if (typeof contentsInput === 'string') {
    const trimmed = contentsInput.trim();
    if (!trimmed) return JSON.stringify([]);
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeContents(parsed, fallbackDate);
      }
    } catch {
      // 일반 문자열인 경우 단일 항목으로 변환
      items = [{
        id: `entry_${Date.now()}_0`,
        writtenAt: fallbackDate || getNowFormattedString(),
        text: trimmed
      }];
    }
  }

  return JSON.stringify(items);
}

/**
 * DB의 content 필드를 [ { id, writtenAt, text }, ... ] 구조의 배열로 파싱
 */
function parseContents(rawContent, fallbackDate = '', createdAt = '') {
  const defaultWrittenAt = fallbackDate || (createdAt ? createdAt.slice(0, 16).replace('T', ' ') : getNowFormattedString());
  if (!rawContent) return [];

  if (Array.isArray(rawContent)) {
    return rawContent.map((item, idx) => ({
      id: item.id || `entry_${idx}`,
      writtenAt: item.writtenAt || item.date || defaultWrittenAt,
      text: item.text || item.content || ''
    }));
  }

  if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => ({
          id: item.id || `entry_${idx}`,
          writtenAt: item.writtenAt || item.date || defaultWrittenAt,
          text: item.text || item.content || ''
        }));
      }
    } catch {
      // 일반 문자열 호환
      return [{
        id: 'entry_legacy',
        writtenAt: defaultWrittenAt,
        text: trimmed
      }];
    }
  }

  return [];
}

function mapRowToNote(row) {
  const links = parseLinks(row.link);
  const rawContents = parseContents(row.content, row.date, row.created_at);

  // 작성일시 내림차순 (최신순이 맨 위)
  const contents = rawContents.sort((a, b) => {
    const dtA = a.writtenAt || '';
    const dtB = b.writtenAt || '';
    return dtB.localeCompare(dtA);
  });

  // 대표 작성일시 (가장 최근 항목의 writtenAt 또는 row.created_at)
  const latestWrittenAt = contents.length > 0 ? contents[0].writtenAt : (row.date || row.created_at);
  const firstWrittenAt = contents.length > 0 ? contents[contents.length - 1].writtenAt : (row.date || row.created_at);

  // 전체 텍스트 요약 (기존 content 호환)
  const combinedContentText = contents.map((c) => c.text).filter(Boolean).join('\n\n');

  return {
    id: row.id,
    date: row.date || (latestWrittenAt ? latestWrittenAt.slice(0, 10) : ''),
    writtenAt: latestWrittenAt,
    firstWrittenAt,
    title: row.title,
    contents,            // 다중 내용 항목 [{ id, writtenAt, text }] (작성일시 내림차순)
    content: combinedContentText, // 하위 호환용 텍스트
    link: links[0] || '', // 이전 단일 링크 호환용
    links,               // 다중 링크 배열
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 개발 메모 추가
 */
async function createNote(note) {
  const db = await getDb();
  const now = new Date().toISOString();
  const title = (note.title || '').trim();
  const contentsInput = note.contents || (note.content ? [{ writtenAt: note.writtenAt || getNowFormattedString(), text: note.content }] : []);
  const serializedContent = normalizeContents(contentsInput, note.date);
  const link = normalizeLinks(note.links || note.link);

  if (!title) {
    throw new Error('메모 제목은 필수 입력 항목입니다.');
  }

  // SQLite의 NOT NULL date 컬럼 호환: 첫 번째 항목의 날짜 또는 오늘 날짜
  const parsedContents = parseContents(serializedContent, '', now);
  const firstEntryDate = parsedContents[0]?.writtenAt ? parsedContents[0].writtenAt.slice(0, 10) : now.slice(0, 10);
  const dateValue = note.date || firstEntryDate;

  const stmt = db.prepare(`
    INSERT INTO dev_notes (date, title, content, link, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run([dateValue, title, serializedContent, link, now, now]);
  stmt.free();

  const res = db.exec('SELECT last_insert_rowid() AS id');
  const insertedId = res[0]?.values[0]?.[0];

  persistDb();
  return getNoteById(insertedId);
}

/**
 * 개발 메모 단건 조회
 */
async function getNoteById(id) {
  const db = await getDb();
  const stmt = db.prepare(`
    SELECT id, date, title, content, link, created_at, updated_at
    FROM dev_notes
    WHERE id = ?
  `);
  stmt.bind([id]);

  let note = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    note = mapRowToNote(row);
  }
  stmt.free();
  return note;
}

/**
 * 개발 메모 목록 조회 (기간 및 키워드 필터링)
 */
async function getNotes({ startDate, endDate, keyword } = {}) {
  const db = await getDb();

  // 모든 메모 조회 후 상세 필터링 및 최신순 정렬
  const sql = `
    SELECT id, date, title, content, link, created_at, updated_at
    FROM dev_notes
    ORDER BY id DESC
  `;

  const stmt = db.prepare(sql);
  const rawNotes = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rawNotes.push(mapRowToNote(row));
  }
  stmt.free();

  const filteredNotes = rawNotes.filter((note) => {
    // 1. 기간 필터링: 메모 내 내용(contents) 중 하나라도 기간 내에 속하거나 대표 날짜가 범위 내인 경우
    if (startDate || endDate) {
      const dates = [];
      if (note.contents && note.contents.length > 0) {
        note.contents.forEach((c) => {
          if (c.writtenAt) {
            dates.push(c.writtenAt.slice(0, 10));
          }
        });
      }
      if (note.date) dates.push(note.date);
      if (note.createdAt) dates.push(note.createdAt.slice(0, 10));

      const isMatchPeriod = dates.some((d) => {
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      });

      if (!isMatchPeriod) return false;
    }

    // 2. 키워드 필터링: 제목 또는 내용 전체 텍스트 검색
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      const titleMatch = (note.title || '').toLowerCase().includes(kw);
      const contentMatch = (note.content || '').toLowerCase().includes(kw);
      const contentsMatch = note.contents.some((c) => (c.text || '').toLowerCase().includes(kw) || (c.writtenAt || '').includes(kw));

      if (!titleMatch && !contentMatch && !contentsMatch) {
        return false;
      }
    }

    return true;
  });

  // 작성일시/생성일시 최신순 정렬
  filteredNotes.sort((a, b) => {
    const dateA = a.writtenAt || a.date || a.createdAt || '';
    const dateB = b.writtenAt || b.date || b.createdAt || '';
    return dateB.localeCompare(dateA);
  });

  return filteredNotes;
}

/**
 * 여러 ID로 개발 메모 목록 조회 (AI 요약용)
 */
async function getNotesByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const sql = `
    SELECT id, date, title, content, link, created_at, updated_at
    FROM dev_notes
    WHERE id IN (${placeholders})
    ORDER BY id ASC
  `;

  const stmt = db.prepare(sql);
  stmt.bind(ids);

  const notes = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    notes.push(mapRowToNote(row));
  }
  stmt.free();

  // 작성일시 오름차순 정렬 (타임라인 순)
  notes.sort((a, b) => {
    const dateA = a.firstWrittenAt || a.writtenAt || a.date || a.createdAt || '';
    const dateB = b.firstWrittenAt || b.writtenAt || b.date || b.createdAt || '';
    return dateA.localeCompare(dateB);
  });

  return notes;
}

/**
 * 개발 메모 수정
 */
async function updateNote(id, note) {
  const db = await getDb();
  const now = new Date().toISOString();
  const title = (note.title || '').trim();
  const contentsInput = note.contents || (note.content ? [{ writtenAt: note.writtenAt || getNowFormattedString(), text: note.content }] : []);
  const serializedContent = normalizeContents(contentsInput, note.date);
  const link = normalizeLinks(note.links || note.link);

  if (!title) {
    throw new Error('메모 제목은 필수 입력 항목입니다.');
  }

  const parsedContents = parseContents(serializedContent, '', now);
  const firstEntryDate = parsedContents[0]?.writtenAt ? parsedContents[0].writtenAt.slice(0, 10) : now.slice(0, 10);
  const dateValue = note.date || firstEntryDate;

  const stmt = db.prepare(`
    UPDATE dev_notes
    SET date = ?, title = ?, content = ?, link = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run([dateValue, title, serializedContent, link, now, id]);
  stmt.free();

  persistDb();
  return getNoteById(id);
}

/**
 * 개발 메모 삭제
 */
async function deleteNote(id) {
  const db = await getDb();
  const stmt = db.prepare('DELETE FROM dev_notes WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  persistDb();
  return { success: true, id };
}

/**
 * 전체 설정 조회 (Key-Value 객체 반환)
 */
async function getAllSettings() {
  const db = await getDb();
  const stmt = db.prepare('SELECT key, value FROM app_settings');
  const result = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    result[row.key] = row.value;
  }
  stmt.free();
  return result;
}

/**
 * 단일 설정값 조회
 */
async function getSetting(key, defaultValue = '') {
  const db = await getDb();
  const stmt = db.prepare('SELECT value FROM app_settings WHERE key = ?');
  stmt.bind([key]);
  let value = defaultValue;
  if (stmt.step()) {
    value = stmt.getAsObject().value;
  }
  stmt.free();
  return value;
}

/**
 * 설정 일괄 저장 (트랜잭션 적용)
 */
async function saveSettings(settingsObj) {
  if (!settingsObj || typeof settingsObj !== 'object') {
    return false;
  }
  const db = await getDb();
  const now = new Date().toISOString();
  db.run('BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    for (const [key, val] of Object.entries(settingsObj)) {
      if (val !== undefined && val !== null) {
        stmt.run([key, typeof val === 'object' ? JSON.stringify(val) : String(val), now]);
      }
    }
    stmt.free();
    db.run('COMMIT');
    persistDb();
    return true;
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch {
      // rollback error ignore
    }
    console.error('SQLite 설정 저장 실패:', err);
    throw err;
  }
}

module.exports = {
  getDbFilePath,
  getDb,
  createNote,
  getNoteById,
  getNotes,
  getNotesByIds,
  updateNote,
  deleteNote,
  getAllSettings,
  getSetting,
  saveSettings
};

