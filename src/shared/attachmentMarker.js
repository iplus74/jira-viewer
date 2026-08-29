'use strict';

/**
 * 다운로드된 첨부파일을 본문 텍스트 안에 표시하기 위한 마커 포맷.
 * 일반 텍스트에서 등장하지 않는 제어 문자(\u0000, \u0001)를 구분자로 사용해
 * escapeHtml 처리 후에도 그대로 남아 렌더러에서 안전하게 치환할 수 있다.
 */
const OPEN = '\u0000ATTACH\u0001';
const SEP = '\u0001';
const CLOSE = '\u0000';
const MARKER_REGEX = /\u0000ATTACH\u0001([a-z]+)\u0001([^\u0001\u0000]*)\u0001([^\u0000]*)\u0000/g;

function buildAttachmentMarker(kind, localPath, filename) {
  return `${OPEN}${kind}${SEP}${localPath}${SEP}${filename}${CLOSE}`;
}

/**
 * 마커가 포함된 텍스트를 { type: 'text' | 'attachment', ... } 세그먼트 배열로 분리
 */
function splitAttachmentMarkers(text) {
  const input = text || '';
  const segments = [];
  let lastIndex = 0;
  let match;
  MARKER_REGEX.lastIndex = 0;
  while ((match = MARKER_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'attachment', kind: match[1], path: match[2], filename: match[3] });
    lastIndex = MARKER_REGEX.lastIndex;
  }
  if (lastIndex < input.length) {
    segments.push({ type: 'text', value: input.slice(lastIndex) });
  }
  return segments;
}

module.exports = { buildAttachmentMarker, splitAttachmentMarkers };
