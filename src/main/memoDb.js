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

function mapRowToNote(row) {
  const links = parseLinks(row.link);
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    content: row.content,
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
  const date = note.date || new Date().toISOString().slice(0, 10);
  const title = (note.title || '').trim();
  const content = note.content || '';
  const link = normalizeLinks(note.links || note.link);

  if (!title) {
    throw new Error('메모 제목은 필수 입력 항목입니다.');
  }

  const stmt = db.prepare(`
    INSERT INTO dev_notes (date, title, content, link, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run([date, title, content, link, now, now]);
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

  let sql = `
    SELECT id, date, title, content, link, created_at, updated_at
    FROM dev_notes
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    sql += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date <= ?';
    params.push(endDate);
  }
  if (keyword && keyword.trim()) {
    sql += ' AND (title LIKE ? OR content LIKE ?)';
    const kw = `%${keyword.trim()}%`;
    params.push(kw, kw);
  }

  sql += ' ORDER BY date DESC, id DESC';

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const notes = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    notes.push(mapRowToNote(row));
  }
  stmt.free();
  return notes;
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
    ORDER BY date ASC, id ASC
  `;

  const stmt = db.prepare(sql);
  stmt.bind(ids);

  const notes = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    notes.push(mapRowToNote(row));
  }
  stmt.free();
  return notes;
}

/**
 * 개발 메모 수정
 */
async function updateNote(id, note) {
  const db = await getDb();
  const now = new Date().toISOString();
  const date = note.date || new Date().toISOString().slice(0, 10);
  const title = (note.title || '').trim();
  const content = note.content || '';
  const link = normalizeLinks(note.links || note.link);

  if (!title) {
    throw new Error('메모 제목은 필수 입력 항목입니다.');
  }

  const stmt = db.prepare(`
    UPDATE dev_notes
    SET date = ?, title = ?, content = ?, link = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run([date, title, content, link, now, id]);
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

module.exports = {
  getDbFilePath,
  getDb,
  createNote,
  getNoteById,
  getNotes,
  getNotesByIds,
  updateNote,
  deleteNote
};
