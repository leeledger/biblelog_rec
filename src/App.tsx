import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { progressService } from './services/progressService';
import { groupService } from './services/groupService';
import { BibleVerse, SessionReadingProgress, ReadingState, User, UserProgress, UserSessionRecord, Group } from './types';
import { AVAILABLE_BOOKS, getVersesForSelection, getNextReadingStart, BOOK_ABBREVIATIONS_MAP, TOTAL_CHAPTERS_IN_BIBLE } from './constants';
import { normalizeText, calculateSimilarity, containsDifficultWord, findMatchedPrefixLength } from './utils';
import rawBibleData from './bible_hierarchical.json';

import useSpeechRecognition from './hooks/useSpeechRecognition';
import useAudioRecorder from './hooks/useAudioRecorder';
import * as authService from './services/authService';
import AuthForm from './components/AuthForm';
import HallOfFame from './components/HallOfFame';
import { BrowserRecommendation } from './components/BrowserRecommendation';
import { useWakeLock } from './hooks/useWakeLock'; // 추가

// Refactored Sub-components
import Dashboard from './components/Dashboard';
import ActiveReadingSession from './components/ActiveReadingSession';
import InstallPWA from './components/InstallPWA';
import LandingPage from './components/LandingPage';
import MyPage from './components/MyPage';
import PasswordChangeModal from './components/PasswordChangeModal';
import { Analytics } from "@vercel/analytics/react";

// Define the type for the flat Bible data structure from bible_fixed.json
type RawBibleDataType = { [key: string]: string; };
const bibleData: RawBibleDataType = rawBibleData as RawBibleDataType;

const FUZZY_MATCH_LOOKBACK_FACTOR = 1.3;
const FUZZY_MATCH_SIMILARITY_THRESHOLD_DEFAULT = 55;
const MINIMUM_READ_LENGTH_RATIO_DEFAULT = 0.9;
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_DEFAULT = 5;
// iOS는 인식이 빨라서 더 엄격한 조건 적용
const FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS = 60; // 50 -> 60 (더 높은 유사도 요구)
const MINIMUM_READ_LENGTH_RATIO_IOS = 0.98; // 0.95 -> 0.98 (더 많이 읽어야 함)
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS = 1; // 2 -> 1 (거의 전체를 읽어야 함)
const LONG_VERSE_CHAR_COUNT = 30;
const END_PORTION_LENGTH = 15;

const initialSessionProgress: SessionReadingProgress = {
  totalVersesInSession: 0,
  sessionCompletedVersesCount: 0,
  sessionInitialSkipCount: 0,
};

type ViewState = 'IDLE_SETUP' | 'LEADERBOARD';

// Navbar Component Definition
const Navbar: React.FC<{
  currentUser: User;
  overallCompletedChaptersCount: number;
  onLogout: () => void;
  onMyPageClick: () => void;
  isReadingMode: boolean;
  recordingEnabled: boolean;
}> = ({ currentUser, overallCompletedChaptersCount, onLogout, onMyPageClick, isReadingMode, recordingEnabled }) => (
  <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">📖</span>
        <h1 className="text-xl font-black text-indigo-600 tracking-tight">바이블로그</h1>
      </div>
      {!isReadingMode && (
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              {recordingEnabled && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-md font-black animate-pulse">REC</span>}
              <p className="text-sm font-bold text-gray-800">{currentUser.username}님</p>
            </div>
            <p className="text-[10px] text-gray-400 font-medium">전체 {overallCompletedChaptersCount}장 완료</p>
          </div>
          <button onClick={onMyPageClick} className="p-2 hover:bg-gray-100 rounded-full transition-colors relative">
            👤
            {recordingEnabled && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-red-500 transition-colors"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  </header>
);

const App: React.FC = () => {
  // 플랫폼 감지 로직
  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);

  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [bibleResetLoading, setBibleResetLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => {
    const saved = localStorage.getItem('selectedGroupId');
    // "null", "undefined", 빈 문자열, 또는 숫자가 아닌 값은 모두 null로 처리
    if (!saved || saved === 'null' || saved === 'undefined') {
      return null;
    }
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? null : parsed;
  }); // null means Private Journey
  const [userOverallProgress, setUserOverallProgress] = useState<UserProgress | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('IDLE_SETUP');
  const [sessionCount, setSessionCount] = useState(0);

  const [sessionTargetVerses, setSessionTargetVerses] = useState<BibleVerse[]>([]);
  const [currentVerseIndexInSession, setCurrentVerseIndexInSession] = useState(0);

  // 아멘 패스 기능 관련 상태
  const [verseStartTime, setVerseStartTime] = useState<number | null>(null);
  const [showAmenPrompt, setShowAmenPrompt] = useState(false);
  const [verseTimeoutId, setVerseTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [hasDifficultWords, setHasDifficultWords] = useState(false);

  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [matchedVersesContentForSession, setMatchedVersesContentForSession] = useState<string>('');
  const [isRetryingVerse, setIsRetryingVerse] = useState(false);
  const [readingState, setReadingState] = useState<ReadingState>(ReadingState.IDLE);

  // 점진적 매칭: 현재 구절에서 매칭된 글자 수
  const [matchedCharCount, setMatchedCharCount] = useState(0);
  const [isResumeSession, setIsResumeSession] = useState(false);
  const [isMicWaiting, setIsMicWaiting] = useState(false); // 마이크 대기 중 여부

  // 데이터 로딩 상태
  const [isProgressLoading, setIsProgressLoading] = useState(true);

  // 푸터 섹션 확장 상태
  const [footerSupportExpanded, setFooterSupportExpanded] = useState(false);
  const [footerChurchExpanded, setFooterChurchExpanded] = useState(false);
  const [showMyPage, setShowMyPage] = useState(false);

  // 디버그 로그 (ID 100번 사용자 전용)
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addDebugLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setDebugLogs(prev => [...prev.slice(-15), `${timestamp} ${msg}`]);
  }, []);

  // --- Debug Panel Support (Placed at top to satisfy Hook rules) ---
  const debugPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (window as any).addDebugLog = addDebugLog;
  }, [addDebugLog]);
  useEffect(() => {
    if (debugPanelRef.current) {
      debugPanelRef.current.scrollTop = debugPanelRef.current.scrollHeight;
    }
  }, [debugLogs]);


  // Prevent pull-to-refresh on mobile during speech recognition
  useEffect(() => {
    let startY = 0;
    let maybePrevent = false;
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0 && e.touches.length === 1) {
        startY = e.touches[0].clientY;
        maybePrevent = true;
      } else {
        maybePrevent = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!maybePrevent) return;
      const currentY = e.touches[0].clientY;
      if (currentY - startY > 5) {
        // User is pulling down from the top
        e.preventDefault();
      }
    };
    if (readingState === ReadingState.LISTENING) {
      document.addEventListener('touchstart', onTouchStart, { passive: false });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
    }
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [readingState]);

  const [sessionProgress, setSessionProgress] = useState<SessionReadingProgress>(initialSessionProgress);

  // 외부 이벤트(전화 수신 등) 감지 및 자동 복구 로직
  useEffect(() => {
    const handleVisibilityOrFocusChange = () => {
      // 페이지가 다시 보여지거나 포커스를 받았을 때
      if (!document.hidden && document.visibilityState === 'visible') {
        // 현재 '읽기 중'인 상태에서 돌아왔다면 마이크 리셋을 위해 새로고침 실행
        if (readingState === ReadingState.READING || readingState === ReadingState.LISTENING) {
          console.log('[App.tsx] App regained focus/visibility. Reloading to reset mic engine...');
          // 잠시 지연 후 새로고침 (데이터 저장과의 충돌 방지)
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocusChange);
    window.addEventListener('focus', handleVisibilityOrFocusChange);
    // blur: 플로팅 전화 수신 등으로 브라우저가 포커스를 잃는 순간 감지
    window.addEventListener('blur', handleVisibilityOrFocusChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocusChange);
      window.removeEventListener('focus', handleVisibilityOrFocusChange);
      window.removeEventListener('blur', handleVisibilityOrFocusChange);
    };
  }, [readingState]);



  const [sessionCertificationMessage, setSessionCertificationMessage] = useState<string>('');
  const [appError, setAppError] = useState<string | null>(null);
  const [showPasswordChangePrompt, setShowPasswordChangePrompt] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);

  const [overallCompletedChaptersCount, setOverallCompletedChaptersCount] = useState(0);
  const [totalBibleChapters, setTotalBibleChapters] = useState(0);

  // State for ChapterSelector default values, dynamically updated by user progress
  // Consolidated state for ChapterSelector default values
  const [selectorState, setSelectorState] = useState({
    book: AVAILABLE_BOOKS[0]?.name || '',
    startChapter: 1,
    endChapter: 1,
    startVerse: 1
  });
  const [showBookCompletionStatus, setShowBookCompletionStatus] = useState(false);
  const [syncedVerseIndex, setSyncedVerseIndex] = useState(0); // UI 동기화용 인덱스 추가

  const {
    isListening,
    transcript: sttTranscript,
    error: sttError,
    startListening,
    stopListening,
    abortListening, // 추가
    browserSupportsSpeechRecognition,
    resetTranscript,
    markVerseTransition,
    isStalled // 추가
  } = useSpeechRecognition({ lang: 'ko-KR' });

  // 녹음 기능 (recording_enabled 유저 또는 ID 1번만 사용)
  const isRecordingEnabled = useMemo(() => {
    if (!currentUser) return false;
    const isSpecialUser = Number(currentUser.id) === 1 || Number(currentUser.id) === 100 || currentUser.username === '테스트';
    const hasFlag = currentUser.recording_enabled === true || String(currentUser.recording_enabled) === 'true';
    return hasFlag || isSpecialUser;
  }, [currentUser]);

  const {
    isRecording,
    recordings: audioRecordings,
    isUploading: isAudioUploading,
    uploadProgress: audioUploadProgress,
    startRecording,
    prepareMic,
    stopRecording,
    uploadAllRecordings,
    clearRecordings,
    closeStream,
    recordingCount,
  } = useAudioRecorder();

  // 마이크 상태 감지 및 와치독 (안드로이드 마이크 멈춤 대응)
  useEffect(() => {
    if (currentUser?.id === 100) {
      addDebugLog(`🎤 isListening: ${isListening}`);
    }

    // 통독 중인데 마이크가 꺼졌다면 대기 상태 추적
    let timer: NodeJS.Timeout;
    if (readingState === ReadingState.LISTENING && !isListening) {
      timer = setTimeout(() => {
        setIsMicWaiting(true);
        if (currentUser?.id === 100) addDebugLog('⚠️ 마이크 3초 이상 응답 없음 - 자동 재시작 시도');
        // 강제로 한 번 더 깨우기 시도
        startListening();
      }, 3000);
    } else {
      setIsMicWaiting(false);
    }

    return () => clearTimeout(timer);
  }, [isListening, readingState, currentUser?.id, addDebugLog]);

  // [근본 재설계] 중간 트리거 방식(useEffect)을 완전히 제거하여 충돌 변수를 없앱니다.
  // 녹음 시작은 이제 오직 세션 시작 시점에만 수행됩니다.

  // 세션 종료(뒤로가기 포함) 통합 처리 함수
  const handleExitSession = useCallback(() => {
    stopListening();
    closeStream(); // 녹음기 마이크 세션도 함께 닫기
    setReadingState(ReadingState.IDLE);
    setSessionTargetVerses([]);
    setCurrentVerseIndexInSession(0);
    setSyncedVerseIndex(0);
    setIsResumeSession(false);
    setMatchedVersesContentForSession('');
    setSessionProgress(initialSessionProgress);
    setSessionCertificationMessage('');
    setTranscriptBuffer('');
    // 세션 복구 정보 삭제
    localStorage.removeItem('pendingReadingSession');
  }, [stopListening, closeStream, setReadingState]);

  // 안드로이드 뒤로가기 버튼 인터셉트 로직
  useEffect(() => {
    // 앱 진입 시 현재 히스토리를 대시보드로 간주하고 상태 하나 추가
    if (!window.history.state || window.history.state.type !== 'biblelog-state') {
      window.history.replaceState({ type: 'biblelog-state', view: 'dashboard' }, '');
      window.history.pushState({ type: 'biblelog-state', view: 'sub' }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      if (readingState !== ReadingState.IDLE || showHallOfFame || currentView !== 'IDLE_SETUP') {
        window.history.pushState({ type: 'biblelog-state', view: 'sub' }, '');
        if (readingState !== ReadingState.IDLE) {
          handleExitSession();
        } else if (showHallOfFame) {
          setShowHallOfFame(false);
        } else if (currentView !== 'IDLE_SETUP') {
          setCurrentView('IDLE_SETUP');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [readingState, showHallOfFame, currentView, handleExitSession]);



  const { requestWakeLock, releaseWakeLock } = useWakeLock(); // 추가

  const loadUserGroups = async (userId: number) => {
    try {
      const groups = await groupService.getUserGroups(userId);
      setUserGroups(groups);

      // 만약 선택된 그룹이 더 이상 목록에 없다면(탈퇴/삭제), 개인 통독으로 전환
      if (selectedGroupId !== null && !groups.some(g => g.id === selectedGroupId)) {
        setSelectedGroupId(null);
      }
    } catch (err) {
      console.error('Failed to load user groups:', err);
    }
  };

  // Persistence for selectedGroupId
  useEffect(() => {
    if (selectedGroupId !== null) {
      localStorage.setItem('selectedGroupId', selectedGroupId.toString());
    } else {
      localStorage.removeItem('selectedGroupId');
    }
  }, [selectedGroupId]);

  // Overall Bible Progress Effect
  useEffect(() => {
    console.log('[Overall Progress Effect] Triggered. user:', currentUser?.username, 'group:', selectedGroupId);

    const fetchAndSetFullProgress = async () => {
      if (currentUser && currentUser.username) {
        setIsProgressLoading(true);
        setTotalBibleChapters(TOTAL_CHAPTERS_IN_BIBLE);
        try {
          const progressData = await progressService.loadUserProgress(currentUser.username, selectedGroupId);
          setUserOverallProgress(progressData);
          setOverallCompletedChaptersCount(progressData?.completedChapters?.length || 0);
        } catch (error) {
          console.error('[Overall Progress Effect] Error fetching progress:', error);
          setUserOverallProgress(null);
          setOverallCompletedChaptersCount(0);
        } finally {
          setIsProgressLoading(false);
        }
      } else {
        setUserOverallProgress(null);
        setOverallCompletedChaptersCount(0);
        setTotalBibleChapters(0);
        setIsProgressLoading(false);
      }
    };

    fetchAndSetFullProgress();

    if (currentUser?.must_change_password) {
      setShowPasswordChangePrompt(true);
    } else {
      setShowPasswordChangePrompt(false);
    }
  }, [currentUser, selectedGroupId]);

  // Effect to handle retrying a verse after STT has fully stopped
  useEffect(() => {
    if (currentUser?.id === 100) {
      addDebugLog(`retry check - retry:${isRetryingVerse} listen:${isListening}`);
    }
    if (isRetryingVerse && !isListening) {
      if (currentUser?.id === 100) addDebugLog('🚀 startListening() 호출');
      startListening();
      setIsRetryingVerse(false);
    }
  }, [isRetryingVerse, isListening, startListening, currentUser?.id, addDebugLog]);

  // Authentication & Session Recovery Effect
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      if (user.id) loadUserGroups(user.id);

      // 세션 복구 로직: 권한 허용 후 리프레시된 경우 자동 복구
      const pendingSession = localStorage.getItem('pendingReadingSession');
      if (pendingSession) {
        try {
          const { book, startCh, endCh, startVerse } = JSON.parse(pendingSession);
          localStorage.removeItem('pendingReadingSession');
          console.log('[App.tsx] Pending session found. Resuming...', book, startCh);

          // 약간의 지연 후 세션 시작 (UI 안정화 대기)
          setTimeout(() => {
            handleSelectChaptersAndStartReading(book, startCh, endCh, startVerse);
          }, 800);
        } catch (e) {
          console.error('Failed to parse pending session:', e);
          localStorage.removeItem('pendingReadingSession');
        }
      }
    }
  }, []);

  // Effect to set default values for ChapterSelector based on user progress
  useEffect(() => {
    if (currentUser && userOverallProgress) {
      const lastReadInfo = userOverallProgress.lastReadBook && userOverallProgress.lastReadChapter && (userOverallProgress.lastReadVerse !== undefined && userOverallProgress.lastReadVerse !== null)
        ? { book: userOverallProgress.lastReadBook, chapter: userOverallProgress.lastReadChapter, verse: userOverallProgress.lastReadVerse }
        : null;
      const nextRead = getNextReadingStart(lastReadInfo);

      if (nextRead) {
        setSelectorState({
          book: nextRead.book,
          startChapter: nextRead.chapter,
          endChapter: nextRead.chapter,
          startVerse: nextRead.verse
        });
      } else {
        const firstBook = AVAILABLE_BOOKS[0];
        if (firstBook) {
          setSelectorState({
            book: firstBook.name,
            startChapter: 1,
            endChapter: 1,
            startVerse: 1
          });
        }
      }
    } else {
      const firstBook = AVAILABLE_BOOKS[0];
      if (firstBook) {
        setSelectorState({
          book: firstBook.name,
          startChapter: 1,
          endChapter: 1,
          startVerse: 1
        });
      }
    }
  }, [userOverallProgress, currentUser]);

  const handleRegister = async (username: string, password_provided: string): Promise<{ success: boolean; message: string; user?: User }> => {
    const result = await authService.registerUser(username, password_provided);
    if (result.success) {
      setAppError(null);
    } else {
      setAppError(result.message || "Registration failed from App.tsx");
    }
    return result;
  };

  const handlePasswordChangeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeSuccess('');

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordChangeError('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }
    if (newPassword === '1234') {
      setPasswordChangeError('새 비밀번호는 기본 비밀번호와 다르게 설정해야 합니다.');
      return;
    }

    if (!currentUser || typeof currentUser.id !== 'number') {
      setPasswordChangeError('사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    try {
      const result = await authService.changePassword(currentUser.id, newPassword);
      if (result && result.user) {
        setPasswordChangeSuccess('비밀번호가 성공적으로 변경되었습니다!');
        setCurrentUser({ ...currentUser, ...result.user, must_change_password: false });
        setShowPasswordChangePrompt(false);
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordChangeError(result?.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (error) {
      setPasswordChangeError('비밀번호 변경 중 오류가 발생했습니다.');
    }
  };

  const handleAuth = async (username: string, password_provided: string): Promise<boolean> => {
    const user = await authService.loginUser(username, password_provided);
    if (user) {
      setCurrentUser(user);
      if (user.id) loadUserGroups(user.id);
      setShowPasswordChangePrompt(user.must_change_password === true);
      setAppError(null);

      // 로그인 성공 시 페이지 최상단으로 스크롤
      window.scrollTo({ top: 0, behavior: 'smooth' });

      return true;
    } else {
      setAppError('비밀번호를 확인하세요.');
      return false;
    }
  };

  const currentTargetVerseForSession = useMemo(() => {
    if (currentVerseIndexInSession < sessionTargetVerses.length) {
      return sessionTargetVerses[currentVerseIndexInSession];
    }
    return null;
  }, [currentVerseIndexInSession, sessionTargetVerses]);

  const handleVerseSkip = useCallback(() => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) return;

    const currentVerse = currentTargetVerseForSession;

    setMatchedVersesContentForSession(prev => prev + `${currentVerse.book} ${currentVerse.chapter}:${currentVerse.verse} - [패스] ${currentVerse.text}\n`);

    const newTotalCompletedInSelection = currentVerseIndexInSession + 1;
    setSessionProgress(prev => ({
      ...prev,
      sessionCompletedVersesCount: newTotalCompletedInSelection,
    }));

    if (currentVerseIndexInSession >= sessionTargetVerses.length - 1) {
      setReadingState(ReadingState.SESSION_COMPLETED);
      stopListening();
      resetTranscript();
      setTranscriptBuffer('');

      const firstVerseActuallyReadInSession = sessionTargetVerses[sessionProgress.sessionInitialSkipCount] || sessionTargetVerses[0];
      const lastVerseOfSession = sessionTargetVerses[sessionTargetVerses.length - 1];
      const versesReadCountThisSession = sessionTargetVerses.length - sessionProgress.sessionInitialSkipCount;

      const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}장 ${firstVerseActuallyReadInSession.verse}절 ~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}장 ${lastVerseOfSession.verse}절 (총 ${versesReadCountThisSession}절) 읽기 완료!`;
      setSessionCertificationMessage(certMsg);
      setAppError(null);

      handleStopReadingAndSave(newTotalCompletedInSelection, true);
    } else {
      setMatchedCharCount(0); // 구절 전환 시 리셋
    }
  }, [currentTargetVerseForSession, readingState, currentVerseIndexInSession, sessionTargetVerses, sessionProgress, stopListening, resetTranscript]);

  // --------------- CORE MATCHING LOGIC (KEPT IN APP.TSX) -----------------
  useEffect(() => {
    setTranscriptBuffer(sttTranscript);

    // 점진적 매칭: 현재 구절에서 매칭된 글자 수 업데이트
    if (currentTargetVerseForSession && sttTranscript) {
      // 신중한 작업: 아이폰은 절대 건드리지 않고(isIOS), 안드로이드(!isIOS)인 경우만 누적 로직 적용
      if (!isIOS) {
        setMatchedCharCount(prev => {
          // 1. 전체 본문과 현재 음성을 기존 방식대로 비교 (혹시라도 음성 버퍼가 유지되는 경우 대비)
          const wholeMatch = findMatchedPrefixLength(
            currentTargetVerseForSession.text,
            sttTranscript,
            60
          );

          // 2. 스마트 누적 & 겹쳐 읽기 대응 (앵커 기반 탐색)
          // 음성 인식 결과의 앞부분 단어들을 '앵커(시작점)'로 삼아 본문의 어디와 일치하는지 찾습니다.
          // 이를 통해 사용자가 멈춘 후 이전 단어를 겹쳐 읽어도 현재 위치를 정확히 찾아낼 수 있습니다.
          let maximalReach = prev;
          const fullText = currentTargetVerseForSession.text;
          const normFullText = normalizeText(fullText);
          const words = sttTranscript.trim().split(/\s+/).filter(w => w.length > 0);

          // 음성의 앞 8단어까지 앵커 후보로 사용하여 본문 내 시작 지점 탐색
          for (let i = 0; i < Math.min(words.length, 8); i++) {
            const anchor = normalizeText(words[i]);
            if (anchor.length < 2) continue; // 너무 짧은 조사는 무시

            let searchIdx = 0;
            while ((searchIdx = normFullText.indexOf(anchor, searchIdx)) !== -1) {
              // 찾은 앵커 지점의 원본 텍스트(공백 포함) 인덱스 계산
              let originalStart = 0;
              let currentNormIdx = 0;
              for (let j = 0; j < fullText.length; j++) {
                if (!/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g.test(fullText[j])) {
                  if (currentNormIdx === searchIdx) {
                    originalStart = j;
                    break;
                  }
                  currentNormIdx++;
                }
              }

              // [중요] 미래 점프 방지:
              // 찾은 앵커 위치가 현재 취소선 위치(prev)보다 너무 멀리(10자 이상) 앞서있다면
              // 성경 특성상 '반복되는 다른 단어'를 찾은 것으로 간주하고 무시합니다.
              if (originalStart > prev + 10) {
                searchIdx++;
                continue;
              }

              // 해당 지점부터 음성이 일치하는지 체크 (임계값 45로 유연하게 판정)
              const testTranscript = words.slice(i).join(' ');
              const matchLen = findMatchedPrefixLength(fullText.substring(originalStart), testTranscript, 45);

              if (matchLen > 0) {
                const totalReach = originalStart + matchLen;
                if (totalReach > maximalReach) maximalReach = totalReach;
              }
              searchIdx++; // 다음 앵커 검색
            }
          }

          return Math.max(maximalReach, wholeMatch);
        });
      } else {
        // 아이폰용 로직: 사파리의 중간 인식 수정으로 인한 마킹 깜빡임(Flickering) 방지
        const matchedCount = findMatchedPrefixLength(
          currentTargetVerseForSession.text,
          sttTranscript,
          60
        );
        // 이미 마킹된 뒷부분은 인식이 요동쳐도 후퇴하지 않고 고정되도록 최대값 유지
        setMatchedCharCount(prev => Math.max(prev, matchedCount));
      }
    }

    if (readingState !== ReadingState.LISTENING || !showAmenPrompt) return;

    const normalizedTranscript = normalizeText(sttTranscript.toLowerCase());
    if (normalizedTranscript.includes('아멘')) {
      handleVerseSkip();
    }
  }, [sttTranscript, showAmenPrompt, readingState, handleVerseSkip, currentTargetVerseForSession, isIOS]);

  useEffect(() => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) {
      return;
    }

    // 아멘 패스
    if (showAmenPrompt && transcriptBuffer) {
      const normalizedTranscript = normalizeText(transcriptBuffer.toLowerCase());
      if (normalizedTranscript.includes('아멘')) {
        console.log('[App.tsx] 아멘 패스 감지됨');
        setShowAmenPrompt(false);
        if (verseTimeoutId) {
          clearTimeout(verseTimeoutId);
          setVerseTimeoutId(null);
        }

        setTimeout(() => {
          setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text} [아멘 패스 적용]\n`);
          setTranscriptBuffer('');
          setTimeout(() => resetTranscript(), 50);

          if (currentVerseIndexInSession < sessionTargetVerses.length - 1) {
            setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
            setMatchedCharCount(0); // 구절 전환 시 리셋
          } else {
            handleStopReadingAndSave(sessionTargetVerses.length, true);
          }
        }, isIOS ? 500 : 0);
        return;
      }
    }

    if (transcriptBuffer.length === 0) return;

    const normalizedTargetVerseText = normalizeText(currentTargetVerseForSession.text);
    const normalizedBuffer = normalizeText(transcriptBuffer);

    if (normalizedTargetVerseText.length === 0) return;

    const lookbackWindowSize = Math.floor(normalizedTargetVerseText.length * FUZZY_MATCH_LOOKBACK_FACTOR);
    const bufferPortionToCompare = normalizedBuffer.substring(
      Math.max(0, normalizedBuffer.length - lookbackWindowSize)
    );

    const similarityThreshold = isIOS ? FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS : FUZZY_MATCH_SIMILARITY_THRESHOLD_DEFAULT;
    const minLengthRatio = isIOS ? MINIMUM_READ_LENGTH_RATIO_IOS : MINIMUM_READ_LENGTH_RATIO_DEFAULT;
    const absDiffThreshold = isIOS ? ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS : ABSOLUTE_READ_DIFFERENCE_THRESHOLD_DEFAULT;

    const similarity = calculateSimilarity(normalizedTargetVerseText, bufferPortionToCompare);

    const isLengthSufficientByRatio = bufferPortionToCompare.length >= normalizedTargetVerseText.length * minLengthRatio;
    const isLengthSufficientByAbsoluteDiff = (normalizedTargetVerseText.length - bufferPortionToCompare.length) <= absDiffThreshold && bufferPortionToCompare.length > 0;

    const verseHasDifficultWord = containsDifficultWord(normalizedTargetVerseText);
    const adjustedSimilarityThreshold = verseHasDifficultWord ? (similarityThreshold - 20) : similarityThreshold;

    let isMatch = similarity >= adjustedSimilarityThreshold && (isLengthSufficientByRatio || isLengthSufficientByAbsoluteDiff);

    // 모든 안드로이드 유저를 위한 스마트 완료 판정 로직:
    if (!isIOS && currentTargetVerseForSession) {
      // 현재 음성 버퍼가 처음부터 얼마나 매칭되는지 확인
      const wholeMatchScore = findMatchedPrefixLength(currentTargetVerseForSession.text, sttTranscript, 60);

      // '끊어 읽기' 상태 판별: 누적 진행도는 높은데, 현재 버퍼의 처음부터 매칭되는 점수는 현저히 낮을 때
      const isPartReading = (matchedCharCount > 0) && (wholeMatchScore < matchedCharCount * 0.7);

      if (isPartReading) {
        // [중간부터 끊어 읽는 경우] 누적 85% 도달 시 완료 후보
        if (matchedCharCount / currentTargetVerseForSession.text.length >= 0.85) {
          // [적당한 끝단 검증] 구절의 마지막 약 10글자가 음성 버퍼 끝부분에 들어있는지 확인
          const targetEndPortion = normalizeText(currentTargetVerseForSession.text).slice(-10);
          const bufferEndPortion = normalizeText(sttTranscript).slice(-15); // 약간 더 넓은 범위 탐색
          const endSimilarity = calculateSimilarity(targetEndPortion, bufferEndPortion);

          // 아이폰(60)보다 완화된 50점 기준으로 체크하여 답답함을 방지하면서도 끝맺음을 확인
          if (endSimilarity >= 50) {
            isMatch = true;
          }
        }
      } else {
        // [처음부터 쭉 읽는 경우] 숏컷(85%)을 허용하지 않고, 기존의 엄격한 similarity와 lengthRatio 기준을 그대로 따름
        // (사용자가 끝까지 다 읽기 전에 구절이 미리 넘어가는 것을 방지)
      }
    }

    if (isIOS && isMatch && normalizedTargetVerseText.length > LONG_VERSE_CHAR_COUNT) {
      const targetEnd = normalizedTargetVerseText.slice(-END_PORTION_LENGTH);
      const bufferEnd = bufferPortionToCompare.slice(-END_PORTION_LENGTH);
      const endSimilarity = calculateSimilarity(targetEnd, bufferEnd);

      if (endSimilarity < 50) {
        const endPortionHasDifficultWord = containsDifficultWord(targetEnd);
        if (!endPortionHasDifficultWord) {
          isMatch = false;
        }
      }
    }

    if (isMatch) {
      console.log(`[App.tsx] Verse matched! Index: ${currentVerseIndexInSession}`);
      const transitionDelay = isIOS ? 600 : 100; // Android도 100ms 정도 딜레이를 주어 버퍼가 정리될 시간을 줌

      setTimeout(() => {
        setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text}\n`);
        setTranscriptBuffer('');
        setMatchedCharCount(0); // 구절 전환 시 리셋

        // 구절 전환 알림 (음성 인식 라이프사이클 관리)
        if (markVerseTransition) markVerseTransition();

        // 리셋 및 다음 구절 준비
        setTimeout(() => {
          resetTranscript();
        }, 50);
      }, transitionDelay);

      const newTotalCompletedInSelection = currentVerseIndexInSession + 1;
      setSessionProgress(prev => ({
        ...prev,
        sessionCompletedVersesCount: newTotalCompletedInSelection,
      }));

      if (currentVerseIndexInSession >= sessionTargetVerses.length - 1) {
        setReadingState(ReadingState.SESSION_COMPLETED);
        stopListening();
        resetTranscript();
        setTranscriptBuffer('');

        const firstVerseActuallyReadInSession = sessionTargetVerses[sessionProgress.sessionInitialSkipCount] || sessionTargetVerses[0];
        const lastVerseOfSession = sessionTargetVerses[sessionTargetVerses.length - 1];
        const versesReadCountThisSession = sessionTargetVerses.length - sessionProgress.sessionInitialSkipCount;

        const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}장 ${firstVerseActuallyReadInSession.verse}절 ~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}장 ${lastVerseOfSession.verse}절 (총 ${versesReadCountThisSession}절) 읽기 완료!`;
        setSessionCertificationMessage(certMsg);
        setAppError(null);

        if (currentUser && versesReadCountThisSession > 0) {
          handleStopReadingAndSave(newTotalCompletedInSelection, true);
        }
      } else {
        // AUTO SAVE LOGIC
        if (currentUser && userOverallProgress) {
          const lastCompletedVerse = sessionTargetVerses[currentVerseIndexInSession];
          const bookInfo = AVAILABLE_BOOKS.find(b => b.name === lastCompletedVerse.book);
          const isLastVerseOfChapter = bookInfo && lastCompletedVerse.verse === bookInfo.versesPerChapter[lastCompletedVerse.chapter - 1];

          let updatedCompletedChapters = [...(userOverallProgress.completedChapters || [])];
          if (isLastVerseOfChapter) {
            const chapterKey = `${lastCompletedVerse.book}:${lastCompletedVerse.chapter}`;
            if (!updatedCompletedChapters.includes(chapterKey)) {
              updatedCompletedChapters.push(chapterKey);
            }
          }

          const updatedProgress: UserProgress = {
            ...userOverallProgress,
            groupId: selectedGroupId,
            lastReadBook: lastCompletedVerse.book,
            lastReadChapter: lastCompletedVerse.chapter,
            lastReadVerse: lastCompletedVerse.verse,
            completedChapters: updatedCompletedChapters
          };

          progressService.saveUserProgress(currentUser.username, updatedProgress)
            .then(() => {
              setUserOverallProgress(updatedProgress);
              if (isLastVerseOfChapter) {
                setOverallCompletedChaptersCount(updatedProgress.completedChapters?.length || 0);
              }
            })
            .catch(err => console.error(err));
        }

        setCurrentVerseIndexInSession(prevIdx => prevIdx + 1);
        setTranscriptBuffer('');
      }
    }
  }, [transcriptBuffer, readingState, currentTargetVerseForSession, currentUser, sessionTargetVerses, userOverallProgress]);

  // 구절 전환 동기화 로직 (마이크 예열 대기)
  useEffect(() => {
    if (isListening || readingState !== ReadingState.LISTENING) {
      setSyncedVerseIndex(currentVerseIndexInSession);
    }
  }, [isListening, currentVerseIndexInSession, readingState]);

  useEffect(() => {
    if (sttError) setAppError(`음성인식 오류: ${sttError}`);
  }, [sttError]);

  const checkMicPermission = async (): Promise<boolean> => {
    try {
      setReadingState(ReadingState.PREPARING);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      setAppError('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 허용을 확인해주세요.');
      setReadingState(ReadingState.IDLE);
      return false;
    }
  };

  const handleSelectChaptersAndStartReading = useCallback(async (book: string, startCh: number, endCh: number, startVerse?: number) => {
    if (isIOS) {
      const hasPermission = await checkMicPermission();
      if (!hasPermission) return;
    }

    // startVerse를 getVersesForSelection에 전달하여 처음부터 원하는 구절이 나오게 합니다.
    const requestedStartVerse = startVerse || selectorState.startVerse || 1;
    const verses = getVersesForSelection(book, startCh, endCh, requestedStartVerse);

    setSessionTargetVerses(verses);
    setReadingState(ReadingState.LISTENING);
    setCurrentVerseIndexInSession(0); // getVersesForSelection이 이미 처리함
    setSyncedVerseIndex(0);
    setMatchedVersesContentForSession("");
    setTranscriptBuffer("");
    setMatchedCharCount(0);
    clearRecordings();

    setSessionProgress({
      totalVersesInSession: verses.length,
      sessionCompletedVersesCount: 0,
      sessionInitialSkipCount: 0,
    });
    setSessionCertificationMessage("");
    setAppError(null);
    resetTranscript();
  }, [isIOS, checkMicPermission, selectorState.startVerse, clearRecordings, resetTranscript]);

  const handleStopReadingAndSave = useCallback(async (overrideSessionCompletedCount?: number | React.MouseEvent<HTMLButtonElement>, isNaturalCompletion: boolean = false) => {
    const finalCount = typeof overrideSessionCompletedCount === 'number'
      ? overrideSessionCompletedCount
      : sessionProgress.sessionCompletedVersesCount;

    if (!isNaturalCompletion) stopListening();
    const startTime = Date.now();
    setReadingState(ReadingState.SAVING);

    // 1. 녹음 중지
    if (isRecording && sessionTargetVerses.length > 0) {
      console.log('[App.tsx] Stopping recording before UI transition...');
      const firstV = sessionTargetVerses[0];
      const lastV = sessionTargetVerses[sessionTargetVerses.length - 1];

      await new Promise<void>(res => {
        stopRecording(firstV.book, firstV.chapter, firstV.verse, lastV.verse, (blob, duration) => {
          console.log(`[App.tsx] Recording stopped. Duration: ${duration}s, Size: ${blob?.size} bytes`);
          res();
        });
      });
      closeStream();
      console.log('[App.tsx] Mic stream closed.');
    }

    // [중요 수정] 오디오 자동 업로드를 여기서 제거합니다.
    // 사용자가 '원정 성공' 화면(SAVING -> SESSION_COMPLETED)으로 즉시 넘어가게 하기 위함입니다.
    // 미업로드 파일은 결과 화면에서 사용자가 수동으로 '지금 즉시 업로드' 버튼을 눌러 처리하게 합니다.

    // 3. 진도 저장
    try {
      const readCount = finalCount - sessionProgress.sessionInitialSkipCount;
      if (currentUser && readCount > 0) {
        const firstV = sessionTargetVerses[sessionProgress.sessionInitialSkipCount] || sessionTargetVerses[0];
        const lastV = sessionTargetVerses[finalCount - 1] || firstV;

        const historyEntry: UserSessionRecord = {
          date: new Date().toISOString(),
          book: firstV.book, startChapter: firstV.chapter, startVerse: firstV.verse,
          endChapter: lastV.chapter, endVerse: lastV.verse, versesRead: readCount
        };

        const updatedProgress: UserProgress = {
          lastReadBook: lastV.book,
          lastReadChapter: lastV.chapter,
          lastReadVerse: lastV.verse,
          groupId: selectedGroupId,
          history: userOverallProgress?.history ? [...userOverallProgress.history, historyEntry] : [historyEntry],
          completedChapters: userOverallProgress?.completedChapters || [],
          totalSkips: userOverallProgress?.totalSkips || 0
        };

        await progressService.saveUserProgress(currentUser.username, updatedProgress);
        setUserOverallProgress(updatedProgress);
        setOverallCompletedChaptersCount(updatedProgress.completedChapters?.length || 0);
      }
    } catch (err: any) {
      console.error('[App.tsx] Save progress failed:', err);
      setAppError(`진도 저장 실패: ${err.message}`);
    } finally {
      // 최소 0.5초간 저장 중 화면 유지 (사용자 인지용)
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) await new Promise(r => setTimeout(r, 500 - elapsed));

      setReadingState(ReadingState.SESSION_COMPLETED);
    }
  }, [stopListening, isRecording, sessionTargetVerses, stopRecording, closeStream, isRecordingEnabled, currentUser, selectedGroupId, uploadAllRecordings, sessionProgress, userOverallProgress]);

  const handleManualNextVerse = useCallback(async () => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) return;

    const currentVerse = currentTargetVerseForSession;
    const isLastVerse = currentVerseIndexInSession >= sessionTargetVerses.length - 1;

    // 1. 녹음 끊기 및 다음 준비
    if (isRecordingEnabled && isRecording) {
      stopRecording(currentVerse.book, currentVerse.chapter, currentVerse.verse, currentVerse.verse);
      if (!isLastVerse) {
        // 마지막이 아니면 바로 다음 녹음 시작 준비
        setTimeout(() => startRecording(), 300);
      }
    }

    setMatchedVersesContentForSession(prev => prev + `${currentVerse.book} ${currentVerse.chapter}:${currentVerse.verse} - (수동완료) ${currentVerse.text}\n`);

    if (isLastVerse) {
      // 진짜 마지막 구절일 때만 저장 화면으로 이동
      const nextIdx = currentVerseIndexInSession + 1;
      setSessionProgress(prev => ({ ...prev, sessionCompletedVersesCount: nextIdx }));
      await handleStopReadingAndSave(nextIdx, true);
    } else {
      // 마지막이 아니면 그냥 다음 구절로 전환 (저장X, 대기창X)
      const nextIdx = currentVerseIndexInSession + 1;
      setSessionProgress(prev => ({ ...prev, sessionCompletedVersesCount: nextIdx }));
      setCurrentVerseIndexInSession(nextIdx);
      setMatchedCharCount(0);
      setTranscriptBuffer('');
      resetTranscript();
    }
  }, [currentTargetVerseForSession, readingState, isRecordingEnabled, isRecording, stopRecording, startRecording, currentVerseIndexInSession, sessionTargetVerses.length, handleStopReadingAndSave, resetTranscript]);

  const handleRetryVerse = useCallback(() => {
    setReadingState(ReadingState.LISTENING);
    setTranscriptBuffer(''); setAppError(null); setMatchedCharCount(0);
    resetTranscript(); setIsRetryingVerse(true);
  }, [resetTranscript]);

  const handleLogout = () => {
    if (readingState === ReadingState.LISTENING) handleStopReadingAndSave();
    authService.logoutUser();
    setCurrentUser(null); setUserOverallProgress(null);
    setReadingState(ReadingState.IDLE); setSessionTargetVerses([]);
    setCurrentVerseIndexInSession(0); setMatchedVersesContentForSession("");
    setSessionProgress(initialSessionProgress); setSessionCertificationMessage(""); setShowMyPage(false);
  };

  const handleBibleReset = async () => {
    if (!window.confirm('정말 다시 말씀 원정을 시작하시겠습니까?\n모든 진행률이 초기화됩니다.')) return;
    setBibleResetLoading(true);
    try {
      const success = await progressService.resetBibleProgress(currentUser?.username || '');
      if (success) {
        const refreshed = await progressService.loadUserProgress(currentUser?.username || '');
        setUserOverallProgress(refreshed); setOverallCompletedChaptersCount(0);
        alert('성경 읽기 진도가 초기화되었습니다.');
      }
    } finally { setBibleResetLoading(false); }
  };

  useEffect(() => {
    setShowAmenPrompt(false);
    if (verseTimeoutId) { clearTimeout(verseTimeoutId); setVerseTimeoutId(null); }
    const hasDifficult = currentTargetVerseForSession ? containsDifficultWord(currentTargetVerseForSession.text) : false;
    setHasDifficultWords(hasDifficult);
    if (readingState === ReadingState.LISTENING && currentTargetVerseForSession) {
      setVerseStartTime(Date.now());
      const waitTime = Math.min(5000 + (currentTargetVerseForSession.text.length * 200), 45000);
      const tid = setTimeout(() => setShowAmenPrompt(true), waitTime);
      setVerseTimeoutId(tid);
    }
  }, [currentVerseIndexInSession, readingState, currentTargetVerseForSession]);

  useEffect(() => {
    if (readingState === ReadingState.LISTENING) {
      requestWakeLock();
      // 자동 녹음 시작 (녹음 권한이 있는 유저라면)
      if (isRecordingEnabled && !isRecording) {
        console.log('[App.tsx] LISTENING state detected. Auto-starting recorder...');
        if ((window as any).addDebugLog) (window as any).addDebugLog('[SESSION] LISTENING - Auto starting recorder...');
        startRecording().catch(err => {
          console.error('Auto start recording failed:', err);
          if ((window as any).addDebugLog) (window as any).addDebugLog(`[ERROR] Auto start failed: ${err.message}`);
        });
      }
    } else {
      releaseWakeLock();
    }
    return () => { releaseWakeLock(); };
  }, [readingState, isRecordingEnabled, isRecording, startRecording, requestWakeLock, releaseWakeLock]);

  if (!currentUser) {
    return (
      <>
        <BrowserRecommendation />
        <LandingPage
          authForm={<AuthForm onAuth={handleAuth} onRegister={handleRegister} title="로그인 또는 회원등록" />}
        />
        {appError && <p className="fixed bottom-10 left-0 right-0 text-red-500 text-center bg-white/80 p-2">{appError}</p>}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900 relative pb-[120px]">
      <Analytics />
      <BrowserRecommendation />

      {/* Emergency Status Bar - REC_MODE 전용 (상단) */}
      <div className="bg-yellow-400 text-black text-[10px] font-black p-1 flex justify-around items-center border-b border-black z-[1001]">
        <span>USER: {currentUser?.username || 'GUEST'} (ID:{currentUser?.id || '-'})</span>
        <span className={isRecordingEnabled ? 'bg-red-600 text-white px-2 rounded-full animate-pulse' : 'text-gray-500'}>
          {isRecordingEnabled ? '● REC_MODE_ACTIVE' : '○ REC_MODE_OFF'}
        </span>
      </div>

      <Navbar
        currentUser={currentUser}
        overallCompletedChaptersCount={overallCompletedChaptersCount}
        onLogout={handleLogout}
        onMyPageClick={() => setShowMyPage(true)}
        isReadingMode={readingState !== ReadingState.IDLE}
        recordingEnabled={isRecordingEnabled}
      />

      <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
        {readingState === ReadingState.IDLE ? (
          <Dashboard
            currentUser={currentUser}
            userOverallProgress={userOverallProgress}
            totalBibleChapters={TOTAL_CHAPTERS_IN_BIBLE}
            overallCompletedChaptersCount={overallCompletedChaptersCount}
            selectedBookForSelector={selectorState.book}
            startChapterForSelector={selectorState.startChapter}
            endChapterForSelector={selectorState.endChapter}
            startVerseForSelector={selectorState.startVerse}
            onStartReading={handleSelectChaptersAndStartReading}
            onShowHallOfFame={() => setShowHallOfFame(true)}
            onBibleReset={handleBibleReset}
            showBookCompletionStatus={showBookCompletionStatus}
            setShowBookCompletionStatus={setShowBookCompletionStatus}
            currentView={currentView}
            setCurrentView={setCurrentView}
            bibleResetLoading={bibleResetLoading}
            isLoading={isProgressLoading}
            userGroups={userGroups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={(id: number | null) => setSelectedGroupId(id)}
            onGroupAction={async () => { if (currentUser?.id) await loadUserGroups(currentUser.id); }}
            recordingCount={recordingCount}
            isAudioUploading={isAudioUploading}
            audioUploadProgress={audioUploadProgress}
            onUploadRecordings={() => { if (currentUser?.id) uploadAllRecordings(currentUser.id, selectedGroupId); }}
          />
        ) : (
          <ActiveReadingSession
            readingState={readingState}
            sessionTargetVerses={sessionTargetVerses}
            currentTargetVerse={sessionTargetVerses[syncedVerseIndex] || null}
            sessionProgress={{ ...sessionProgress, sessionCompletedVersesCount: syncedVerseIndex }}
            transcript={sttTranscript}
            matchedVersesContent={matchedVersesContentForSession}
            showAmenPrompt={showAmenPrompt}
            hasDifficultWords={hasDifficultWords}
            matchedCharCount={syncedVerseIndex === currentVerseIndexInSession ? matchedCharCount : (sessionTargetVerses[syncedVerseIndex]?.text.length || 0)}
            onStopReading={() => handleStopReadingAndSave(undefined, false)}
            onRetryVerse={handleRetryVerse}
            onExitSession={handleExitSession}
            onStartListening={async () => {
              if (isRecordingEnabled) await startRecording();
              else setTimeout(() => startListening(), 300);
            }}
            sessionCertificationMessage={sessionCertificationMessage}
            isStalled={isStalled}
            onSessionCompleteConfirm={handleExitSession}
            isResume={isResumeSession}
            isListening={isListening}
            isMicWaiting={isMicWaiting}
            sttError={sttError}
            isRecordingEnabled={isRecordingEnabled}
            onManualNextVerse={handleManualNextVerse}
            recordingCount={recordingCount}
            isAudioUploading={isAudioUploading}
            audioUploadProgress={audioUploadProgress}
            onUploadRecordings={() => { if (currentUser?.id) uploadAllRecordings(currentUser.id, selectedGroupId); }}
          />
        )}
      </main>

      {showHallOfFame && (
        <HallOfFame
          groupId={selectedGroupId}
          groupName={userGroups.find(g => g.id === selectedGroupId)?.name}
          onClose={() => setShowHallOfFame(false)}
        />
      )}

      {showMyPage && (
        <MyPage
          isOpen={showMyPage}
          onClose={() => setShowMyPage(false)}
          currentUser={currentUser}
          onLogout={handleLogout}
          onPasswordChange={() => setShowPasswordChangePrompt(true)}
        />
      )}

      {showPasswordChangePrompt && (
        <PasswordChangeModal
          isOpen={showPasswordChangePrompt}
          onClose={() => setShowPasswordChangePrompt(false)}
          currentUser={currentUser}
          onSuccess={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowPasswordChangePrompt(false);
            alert('비밀번호가 변경되었습니다.');
          }}
        />
      )}

      <footer className="bg-white border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        <p>&copy; 2026 BibleLog. All rights reserved.</p>
      </footer>

      {/* EMERGENCY MASTER STATUS BAR & DEBUG LOGS */}
      <div className="fixed bottom-0 left-0 right-0 z-[2000] flex flex-col bg-gray-900 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
        {/* Real-time Logs - All users can see for debugging this session */}
        <div
          ref={debugPanelRef}
          className="h-24 overflow-y-auto px-4 py-2 font-mono text-[10px] bg-black text-green-400 border-b border-gray-700 select-all"
        >
          {debugLogs.length === 0 ? ">>> Waiting for system events..." : debugLogs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>

        <div className="px-4 py-2 flex items-center justify-between font-black text-[10px]">
          <div className="flex items-center gap-3">
            <span className="text-amber-400">ID: {currentUser?.id || 'GUEST'}</span>
            <span className="text-white opacity-50">/</span>
            <span className="text-blue-400">STATE: {readingState}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={isRecordingEnabled ? 'bg-red-600 text-white px-2 rounded-full animate-pulse' : 'text-gray-500'}>
              {isRecordingEnabled ? '[REC_MODE: ACTIVE]' : '[REC_MODE: INACTIVE]'}
            </span>
            <span className="text-white/40">v-emergency-0211-PROXY</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
