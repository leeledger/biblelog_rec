import { DIFFICULT_WORDS as DIFFICULT_WORDS_MAIN } from "./difficult_words";
import { DIFFICULT_WORDS as DIFFICULT_WORDS_BIBLICAL } from "./difficult_words_back";

// 두 파일의 어려운 단어 목록을 병합
const DIFFICULT_WORDS = [...DIFFICULT_WORDS_MAIN, ...DIFFICULT_WORDS_BIBLICAL];

/**
 * Normalizes text by removing whitespace and punctuation.
 * @param text The text to normalize.
 * @returns The normalized text.
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g, '');
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
 * 인식된 텍스트가 구절의 **시작 부분**과 일치해야 합니다.
 * 
 * @param verseText 원본 구절 텍스트
 * @param recognizedText 인식된 텍스트
 * @param similarityThreshold 유사도 임계값 (기본 70%)
 * @returns 원본 구절에서 매칭된 글자 수 (공백 포함)
 */
export function findMatchedPrefixLength(
  verseText: string,
  recognizedText: string,
  similarityThreshold: number = 70
): number {
  if (!verseText || !recognizedText) return 0;

  const normalizedVerse = normalizeText(verseText);
  const normalizedRecognized = normalizeText(recognizedText);

  if (normalizedRecognized.length === 0) return 0;
  if (normalizedVerse.length === 0) return 0;

  // 원본 텍스트에서 공백/문장부호를 제외한 글자 인덱스 매핑
  const charToOriginalIndex: number[] = [];
  for (let i = 0; i < verseText.length; i++) {
    const char = verseText[i];
    if (!/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g.test(char)) {
      charToOriginalIndex.push(i);
    }
  }

  // 인식된 텍스트가 구절 **시작 부분**과 일치하는지 확인
  // 인식된 텍스트 전체가 구절의 prefix와 유사해야 함
  let bestMatchOriginalLength = 0;

  // 인식된 텍스트 길이만큼 구절 prefix와 비교
  const checkLength = Math.min(normalizedVerse.length, normalizedRecognized.length);

  // 직접 prefix 비교 - 인식된 텍스트가 구절 시작과 얼마나 일치하는지
  for (let prefixLen = 1; prefixLen <= checkLength; prefixLen++) {
    const versePrefix = normalizedVerse.substring(0, prefixLen);
    const recognizedPrefix = normalizedRecognized.substring(0, prefixLen);

    // 두 prefix가 같은지 확인 (정확한 일치)
    let matchCount = 0;
    for (let i = 0; i < prefixLen; i++) {
      if (versePrefix[i] === recognizedPrefix[i]) {
        matchCount++;
      }
    }

    const accuracy = (matchCount / prefixLen) * 100;

    if (accuracy >= similarityThreshold) {
      // 정규화된 인덱스 → 원본 인덱스로 변환
      if (prefixLen <= charToOriginalIndex.length) {
        bestMatchOriginalLength = charToOriginalIndex[prefixLen - 1] + 1;
      }
    } else {
      // 더 이상 일치하지 않으면 중단
      break;
    }
  }

  return bestMatchOriginalLength;
}