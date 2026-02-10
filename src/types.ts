export interface BibleVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Represents progress within a single reading session
export interface SessionReadingProgress {
  totalVersesInSession: number; // Total number of verses in this session's goal
  sessionCompletedVersesCount: number; // Verses completed *in this session* (from start of selection, including skipped)
  sessionInitialSkipCount: number; // Number of verses skipped at the beginning of this session
}

export enum ReadingState {
  IDLE = "IDLE", // Or "CHAPTER_SELECTION"
  READING = "READING",
  LISTENING = "LISTENING",
  PREPARING = "PREPARING", // 마이크 권한 확인 및 준비 중
  PROCESSING = "PROCESSING",
  SESSION_COMPLETED = "SESSION_COMPLETED", // Current reading session's selection completed
  SAVING = "SAVING", // Progress is being saved
  ERROR = "ERROR",
}

export interface User {
  id?: number;
  username: string;
  must_change_password?: boolean;
  groups?: Group[]; // 가입된 그룹 목록
  recording_enabled?: boolean; // 녹음 기능 활성화 여부
}

export interface Group {
  id: number;
  name: string;
  invite_code: string;
  owner_id: number;
  owner_name?: string; // 추가: 그룹장의 아이디(이름)
  created_at: string;
  is_owner?: boolean; // 클라이언트 편의용
}

export interface GroupMember {
  group_id: number;
  user_id: number;
  joined_at: string;
  username?: string; // 리더보드 등에서 사용
}

// Stores the user's overall last read point ("bookmark")
export interface UserProgress {
  groupId?: number | null; // null 또는 0은 개인 여정
  lastReadBook: string;
  lastReadChapter: number;
  lastReadVerse: number;
  totalSkips?: number;
  history?: UserSessionRecord[];
  completedChapters?: string[]; // Array of strings like "BookName:ChapterNum"
  lastProgressUpdateDate?: string; // ISO string format for when progress was last saved
}

export interface UserSessionRecord {
  date: string;
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  versesRead: number; // Verses *actually* read in this session
}


// Web Speech API minimal type definitions (remains the same)
export interface ISpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface ISpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): ISpeechRecognitionAlternative;
  [index: number]: ISpeechRecognitionAlternative;
}

export interface ISpeechRecognitionResultList {
  readonly length: number;
  item(index: number): ISpeechRecognitionResult;
  [index: number]: ISpeechRecognitionResult;
}

export interface ISpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ISpeechRecognitionResultList;
}

export type SpeechRecognitionErrorCode =
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'aborted'
  | string;


export interface ISpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

export interface ISpeechRecognition extends EventTarget {
  grammars: any;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;

  start(): void;
  stop(): void;
  abort(): void;

  onaudiostart: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: ISpeechRecognition, ev: ISpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => any) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => any) | null;
  onsoundstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
}

export interface ISpeechRecognitionStatic {
  new(): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionStatic;
    webkitSpeechRecognition?: ISpeechRecognitionStatic;
  }
}

// For chapter selection
export interface BookChapterInfo {
  name: string;
  chapterCount: number;
  versesPerChapter: number[]; // versesPerChapter[0] is for chapter 1
}

// For maintenance mode
export interface MaintenanceInfo {
  isUnderMaintenance: boolean;
  message: string;
  startTime?: string;
  expectedEndTime?: string;
}