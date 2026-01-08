import { DIFFICULT_WORDS as DIFFICULT_WORDS_MAIN } from "./difficult_words";
import { DIFFICULT_WORDS as DIFFICULT_WORDS_BIBLICAL } from "./difficult_words_back";

// 두 파일의 어려운 단어 목록을 병합
const DIFFICULT_WORDS = [...DIFFICULT_WORDS_MAIN, ...DIFFICULT_WORDS_BIBLICAL];

/**
 * 숫자를 한글 읽기로 변환합니다. (예: 34 -> 삼십사)
 */
function convertDigitsToKorean(text: string): string {
  const units = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const positions = ['', '십', '백', '천', '만', '억', '조'];

  return text.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    if (num === 0) return '영';

    let result = '';
    const len = match.length;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(match[i], 10);
      const pos = len - 1 - i;

      if (digit > 0) {
        if (digit === 1 && pos > 0 && pos <= 3) {
          result += positions[pos];
        } else {
          result += units[digit] + positions[pos];
        }
      }
    }
    return result;
  });
}

/**
 * Normalizes text by removing whitespace and punctuation.
 * Also converts digits to Korean words for better matching.
 * @param text The text to normalize.
 * @returns The normalized text.
 */
export function normalizeText(text: string): string {
  const textWithKoreanNumbers = convertDigitsToKorean(text);
  return textWithKoreanNumbers.toLowerCase().replace(/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g, '');
}

export function containsDifficultWord(text: string): boolean {
  return DIFFICULT_WORDS.some(word => text.includes(word));
}

// Utility functions

/**
 * Calculates the Levenshtein distance between two strings.
 * The Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to change one word into the other.
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns The Levenshtein distance.
 */
export function calculateLevenshteinDistance(s1: string, s2: string): number {
  // Ensure s1 is not shorter than s2 for this implementation's optimization path,
  // making s1 the (potentially) longer string or same length.
  if (s1.length < s2.length) {
    return calculateLevenshteinDistance(s2, s1);
  }

  // s1 is longer or same length as s2.
  if (s2.length === 0) {
    return s1.length; // If s2 is empty, all chars in s1 must be deleted/inserted.
  }

  const previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 0; i < s1.length; i++) {
    const s1Char = s1[i];
    const currentRow = [i + 1]; // First element is like deleting s1Char to match empty s2 prefix
    for (let j = 0; j < s2.length; j++) {
      const s2Char = s2[j];
      const insertions = previousRow[j + 1] + 1;
      const deletions = currentRow[j] + 1;
      const substitutions = previousRow[j] + (s1Char === s2Char ? 0 : 1);

      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    for (let k = 0; k < previousRow.length; k++) {
      previousRow[k] = currentRow[k];
    }
  }

  return previousRow[s2.length];
}

/**
 * Calculates the similarity between a target string and a buffer string.
 * This version is tuned for finding the target within a buffer that might be longer
 * and contain extraneous text (e.g., previous verses).
 * @param targetText The target string (e.g., a Bible verse).
 * @param bufferTextToSearch The buffer string (e.g., recognized speech, possibly longer than target).
 * @returns Similarity percentage (0-100).
 */
export function calculateSimilarity(targetText: string, bufferTextToSearch: string): number {
  const L_target = targetText.length;
  const L_buffer = bufferTextToSearch.length;

  if (L_target === 0) return 100; // Convention: empty target is perfectly similar.
  if (L_buffer === 0 && L_target > 0) return 0; // Non-empty target cannot be found in empty buffer.

  // Calculate the Levenshtein distance between the target and the buffer.
  const distance = calculateLevenshteinDistance(targetText, bufferTextToSearch);

  // Estimate "coreEdits": edits pertaining to the target sequence within the buffer.
  // This attempts to subtract edits that are due to length differences if the buffer is longer.
  let coreEdits = distance - Math.max(0, L_buffer - L_target);
  coreEdits = Math.max(0, coreEdits); // Ensure coreEdits is not negative.

  // Similarity is calculated relative to the target's length.
  let similarityScore = ((L_target - coreEdits) / L_target) * 100;

  // If coreEdits exceed target length, it implies no meaningful match.
  if (coreEdits > L_target) {
    similarityScore = 0;
  }

  return Math.max(0, Math.min(100, similarityScore)); // Clamp result to 0-100 range.
}

/**
 * 구절 텍스트에서 인식된 텍스트와 매칭되는 prefix 길이를 찾습니다.
 * '시작 지점'부터의 일치를 매우 엄격하게 체크하여 취소선이 앞서나가는 현상을 방지합니다.
 */
export function findMatchedPrefixLength(
  verseText: string,
  recognizedText: string,
  similarityThreshold: number = 85 // 80 -> 85로 상향하여 더 높은 정확도 요구
): number {
  if (!verseText || !recognizedText) return 0;

  const normalizedVerse = normalizeText(verseText);
  const normalizedRecognized = normalizeText(recognizedText);

  if (normalizedRecognized.length === 0 || normalizedVerse.length === 0) return 0;

  // 원본 텍스트의 실제 인덱스 매핑 (공백/문장부호 제외)
  const charToOriginalIndex: number[] = [];
  for (let i = 0; i < verseText.length; i++) {
    if (!/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g.test(verseText[i])) {
      charToOriginalIndex.push(i);
    }
  }

  let bestMatchOriginalLength = 0;

  // 인식된 단어들을 하나씩 보면서 구절의 시작과 맞는지 체크
  const words = normalizedRecognized.split(/\s+/).filter(w => w.length > 0);
  let combinedWords = "";

  for (const word of words) {
    const nextTest = combinedWords + (combinedWords ? "" : "") + word; // 띄어쓰기 없이 붙여서 비교 (normalizeText 결과가 붙어있는 경우 대비)
    if (nextTest.length > normalizedVerse.length + 3) break;

    // 구절의 해당 길이만큼의 prefix 추출
    const versePrefix = normalizedVerse.substring(0, nextTest.length);
    const sim = calculateSimilarity(versePrefix, nextTest);

    // 임계값 이상의 높은 유사도를 요구
    if (sim >= similarityThreshold) {
      combinedWords = nextTest;
      const targetIdx = Math.min(nextTest.length - 1, charToOriginalIndex.length - 1);
      if (targetIdx >= 0) {
        bestMatchOriginalLength = charToOriginalIndex[targetIdx] + 1;
      }
    } else {
      // 한 단어라도 틀리면 더 이상의 진행을 막음 (취소선이 앞서나가는 것 방지)
      // 단, 인식된 텍스트가 매우 짧을 때는 유사도 판정이 부정확할 수 있으므로 약간의 여유를 줌
      if (nextTest.length > 3) break;
    }
  }

  return bestMatchOriginalLength;
}
