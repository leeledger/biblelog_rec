import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
    return currentUser?.recording_enabled === true || currentUser?.id === 1 || currentUser?.id === 100;
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
        resetTranscript();
        setMatchedCharCount(0); // 구절 전환 시 리셋

        // 구절 전환 시 마이크 리셋 (더 강력한 초기화)
        // abortListening()을 사용하여 이전 구절의 잔여 인식을 즉시 파기하고 엔진을 초기화함
        const delay = isIOS ? 50 : 200;
        if (currentUser?.id === 100) addDebugLog(`🔄 구절 전환 - ${delay}ms 후 abort`);
        setTimeout(() => {
          if (currentUser?.id === 100) addDebugLog('🛑 abortListening() 호출');
          abortListening();
          setIsRetryingVerse(true);
        }, delay);
      }
    }
  }, [transcriptBuffer, readingState, currentTargetVerseForSession, currentUser, sessionTargetVerses, userOverallProgress]);

  // 구절 전환 동기화 로직 (마이크 예열 대기)
  useEffect(() => {
    // 모든 플랫폼에서 마이크가 실제로 켜졌거나, 인식이 끝난 상태(IDLE 등)면 UI 인덱스를 동기화
    // 이를 통해 '글자가 보일 때 마이크가 100% 준비됨'을 보장하고 이전 텍스트 잔상을 제거함
    if (isListening || readingState !== ReadingState.LISTENING) {
      setSyncedVerseIndex(currentVerseIndexInSession);
    }
  }, [isListening, currentVerseIndexInSession, readingState]);
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (sttError) {
      setAppError(`음성인식 오류: ${sttError}`);
    }
  }, [sttError]);

  // Removed automatic startListening useEffect to comply with mobile browser user gesture requirements.
  // startListening should now be called directly from user-initiated events (buttons).

  /**
   * 마이크 권한을 선제적으로 확인합니다. (iOS 대응)
   */
  const checkMicPermission = async (): Promise<boolean> => {
    try {
      setReadingState(ReadingState.PREPARING);

      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 권한 획득 성공 시 즉시 트랙 중지 (전력 소모 방지)
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error('Mic permission check failed:', err);
      // 권한 거부 시 메시지 처리
      setAppError('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 허용을 확인해주세요.');
      setReadingState(ReadingState.IDLE);
      return false;
    }
  };

  const handleSelectChaptersAndStartReading = useCallback(async (book: string, startCh: number, endCh: number, startVerse?: number) => {
    // 세션 정보 로컬 스토리지 저장 (리프레시 대비)
    const sessionParams = { book, startCh, endCh, startVerse: startVerse || selectorState.startVerse };
    localStorage.setItem('pendingReadingSession', JSON.stringify(sessionParams));

    // iOS인 경우 마이크 권한 선제적 확인
    if (isIOS) {
      const hasPermission = await checkMicPermission();
      if (!hasPermission) {
        localStorage.removeItem('pendingReadingSession');
        return;
      }
    }

    // 권한 확인 완료 후 정상 진행
    localStorage.removeItem('pendingReadingSession');
    const verses = getVersesForSelection(book, startCh, endCh);
    if (verses.length > 0) {
      let initialSkip = 0;

      // 전달받은 startVerse가 있거나, selector의 기본값이 있으면 이어 읽기 적용
      const actualStartVerse = startVerse || selectorState.startVerse;

      if (
        book === selectorState.book &&
        startCh === selectorState.startChapter &&
        endCh === selectorState.startChapter &&
        actualStartVerse > 1
      ) {
        const firstVerseIndex = verses.findIndex(v => v.verse === actualStartVerse);
        if (firstVerseIndex !== -1) {
          initialSkip = firstVerseIndex;
        }
      }

      // 이어서 읽기 여부 판별 (마지막 읽은 위치의 다음 포인트와 현재 선택이 일치하는지)
      const lastReadPoint = userOverallProgress ? {
        book: userOverallProgress.lastReadBook || '',
        chapter: userOverallProgress.lastReadChapter || 1,
        verse: userOverallProgress.lastReadVerse || 0
      } : null;

      const nextSuggested = getNextReadingStart(lastReadPoint);
      const isActuallyNext = nextSuggested &&
        book === nextSuggested.book &&
        startCh === nextSuggested.chapter &&
        actualStartVerse === nextSuggested.verse;

      setIsResumeSession(!!isActuallyNext);

      setSessionTargetVerses(verses);
      setReadingState(ReadingState.READING);
      setCurrentVerseIndexInSession(initialSkip);
      setMatchedVersesContentForSession('');
      setTranscriptBuffer('');
      setMatchedCharCount(0); // 세션 시작 시 리셋

      // 0단계: 녹음 기록 초기화
      clearRecordings();

      // [복구] 음성 인식 엔진 즉시 가동 (순정 상태)
      if (currentUser?.id === 1 || currentUser?.id === 100) addDebugLog('🎙️ 음성 인식 가동 시작');
      resetTranscript();

      setSessionProgress({
        totalVersesInSession: verses.length,
        sessionCompletedVersesCount: initialSkip,
        sessionInitialSkipCount: initialSkip,
      });
      setSessionCertificationMessage("");
      setAppError(null);
    } else {
      setAppError('선택한 범위의 성경 데이터를 찾을 수 없습니다.');
    }
  }, [selectorState, resetTranscript]);

  const handleStopReadingAndSave = useCallback((overrideSessionCompletedCount?: number | React.MouseEvent<HTMLButtonElement>, isNaturalCompletion: boolean = false) => {
    if (!isNaturalCompletion) {
      stopListening();
      setReadingState(ReadingState.SAVING);
    }

    // 녹음 중이면 녹음 중지
    if (isRecording && sessionTargetVerses.length > 0) {
      const firstVerse = sessionTargetVerses[0];
      const lastVerse = sessionTargetVerses[sessionTargetVerses.length - 1];

      // [수정] 녹음이 완료되는 즉시 업로드를 수행하도록 콜백 연결
      stopRecording(firstVerse.book, firstVerse.chapter, firstVerse.verse, lastVerse.verse, () => {
        if (currentUser?.id) {
          console.log('[App] Recording finalized. Starting upload...');
          uploadAllRecordings(currentUser.id, selectedGroupId);
        }
      });
    }
    closeStream(); // 세션 종료 시 마이크 스트림을 수동으로 닫아 권한 반납 (중요)

    const currentSessionCompletedVersesCount = (typeof overrideSessionCompletedCount === 'number')
      ? overrideSessionCompletedCount
      : sessionProgress.sessionCompletedVersesCount;

    const versesActuallyReadThisSessionCount = currentSessionCompletedVersesCount - sessionProgress.sessionInitialSkipCount;

    let firstEffectivelyReadVerse: BibleVerse | null = null;
    if (versesActuallyReadThisSessionCount > 0 && sessionTargetVerses.length > sessionProgress.sessionInitialSkipCount) {
      firstEffectivelyReadVerse = sessionTargetVerses[sessionProgress.sessionInitialSkipCount];
    }

    let lastEffectivelyReadVerse: BibleVerse | null = null;
    if (versesActuallyReadThisSessionCount > 0 && currentSessionCompletedVersesCount > 0) {
      lastEffectivelyReadVerse = sessionTargetVerses[currentSessionCompletedVersesCount - 1];
    }

    if (currentUser && lastEffectivelyReadVerse && firstEffectivelyReadVerse && versesActuallyReadThisSessionCount > 0) {
      if (!isNaturalCompletion) {
        const certMsg = `${firstEffectivelyReadVerse.book} ${firstEffectivelyReadVerse.chapter}장 ${firstEffectivelyReadVerse.verse}절 ~ ${lastEffectivelyReadVerse.book} ${lastEffectivelyReadVerse.chapter}장 ${lastEffectivelyReadVerse.verse}절 (총 ${versesActuallyReadThisSessionCount}절) 읽음 (세션 중단).`;
        setSessionCertificationMessage(certMsg);
      }

      const historyEntry: UserSessionRecord = {
        date: new Date().toISOString(),
        book: firstEffectivelyReadVerse.book,
        startChapter: firstEffectivelyReadVerse.chapter,
        startVerse: firstEffectivelyReadVerse.verse,
        endChapter: lastEffectivelyReadVerse.chapter,
        endVerse: lastEffectivelyReadVerse.verse,
        versesRead: versesActuallyReadThisSessionCount
      };

      const newCompletedChaptersInSession = new Set<string>(userOverallProgress?.completedChapters || []);

      const versesReadInSession = sessionTargetVerses.slice(
        sessionProgress.sessionInitialSkipCount,
        currentSessionCompletedVersesCount
      );

      const uniqueChaptersInSession = [...new Set(versesReadInSession.map(v => `${v.book}:${v.chapter}`))];

      for (const chapterKey of uniqueChaptersInSession) {
        const [book, chapterStr] = chapterKey.split(':');
        const chapterNum = parseInt(chapterStr, 10);
        const bookInfo = AVAILABLE_BOOKS.find(b => b.name === book);
        if (bookInfo) {
          const lastVerseInChapter = bookInfo.versesPerChapter[chapterNum - 1];
          // 특정 장의 마지막 절이 이번 세션에서 읽은 구절 목록에 포함되어 있는지 확인
          const readLastVerseOfThisChapter = versesReadInSession.some(
            v => v.book === book && v.chapter === chapterNum && v.verse === lastVerseInChapter
          );

          if (readLastVerseOfThisChapter) {
            newCompletedChaptersInSession.add(chapterKey);
          }
        }
      }

      const updatedUserProgress: UserProgress = {
        groupId: selectedGroupId,
        lastReadBook: lastEffectivelyReadVerse.book,
        lastReadChapter: lastEffectivelyReadVerse.chapter,
        lastReadVerse: lastEffectivelyReadVerse.verse,
        totalSkips: userOverallProgress?.totalSkips || 0,
        history: userOverallProgress?.history ? [...userOverallProgress.history, historyEntry] : [historyEntry],
        completedChapters: Array.from(newCompletedChaptersInSession)
      };

      // 진도 저장을 먼저 완료한 후 화면 전환
      progressService.saveUserProgress(currentUser.username, updatedUserProgress)
        .then(() => {
          setUserOverallProgress(updatedUserProgress);
          setOverallCompletedChaptersCount(updatedUserProgress.completedChapters?.length || 0);
        })
        .catch(err => {
          console.error(err);
          setAppError("저장에 실패했습니다. 잠시 후 다시 시도하거나, 네트워크 상태를 확인해주세요.");
          setSessionCertificationMessage("⚠️ 저장 실패: 완료 기록이 저장되지 않았습니다.");
        })
        .finally(() => {
          // 저장 완료 후 완료 화면 표시
          setReadingState(ReadingState.SESSION_COMPLETED);
        });

    } else if (versesActuallyReadThisSessionCount <= 0 && !isNaturalCompletion) {
      setSessionCertificationMessage("이번 세션에서 읽은 구절이 없습니다.");
      setReadingState(ReadingState.SESSION_COMPLETED);
    }
  }, [stopListening, sessionProgress, sessionTargetVerses, currentUser, userOverallProgress, selectedGroupId, isRecording, stopRecording]);

  // 녹음 모드 유저를 위한 수동 다음 절 이동 함수 (정의 위치 중요: handleStopReadingAndSave 이후)
  const handleManualNextVerse = useCallback(() => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) return;

    const currentVerse = currentTargetVerseForSession;
    // 수동 이동 시에는 [녹음] 표시와 함께 저장
    setMatchedVersesContentForSession(prev => prev + `${currentVerse.book} ${currentVerse.chapter}:${currentVerse.verse} - (녹음됨) ${currentVerse.text}\n`);

    const newTotalCompletedInSelection = currentVerseIndexInSession + 1;
    setSessionProgress(prev => ({
      ...prev,
      sessionCompletedVersesCount: newTotalCompletedInSelection,
    }));

    if (currentVerseIndexInSession >= sessionTargetVerses.length - 1) {
      handleStopReadingAndSave(newTotalCompletedInSelection, true);
    } else {
      setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
      setMatchedCharCount(0);
    }
  }, [currentTargetVerseForSession, readingState, currentVerseIndexInSession, sessionTargetVerses, handleStopReadingAndSave]);

  const handleRetryVerse = useCallback(() => {
    setReadingState(ReadingState.LISTENING);
    setTranscriptBuffer('');
    setAppError(null);
    setMatchedCharCount(0); // 다시 읽기 시 리셋
    setIsRetryingVerse(true);

    // resetTranscript가 내부적으로 abort/start 사이클을 수행하여 버퍼를 깨끗이 비움
    resetTranscript();
  }, [resetTranscript]);



  const checkForDifficultWords = (verse: BibleVerse | null) => {
    if (!verse) return false;
    return containsDifficultWord(verse.text);
  };

  useEffect(() => {
    setShowAmenPrompt(false);

    if (verseTimeoutId) {
      clearTimeout(verseTimeoutId);
      setVerseTimeoutId(null);
    }

    const hasDifficult = checkForDifficultWords(currentTargetVerseForSession);
    setHasDifficultWords(hasDifficult);

    if (readingState === ReadingState.LISTENING && currentTargetVerseForSession) {
      setVerseStartTime(Date.now());

      // 글자 수 기반 동적 대기 시간 계산: 기본 5초 + 글자당 0.2초 (최대 45초 한도)
      const verseLength = currentTargetVerseForSession.text.length;
      const dynamicWaitTime = Math.min(5000 + (verseLength * 200), 45000);

      const timeoutId = setTimeout(() => {
        setShowAmenPrompt(true);
      }, dynamicWaitTime);
      setVerseTimeoutId(timeoutId);
    }
  }, [currentVerseIndexInSession, readingState, currentTargetVerseForSession]);

  // 화면 꺼짐 방지 (Wake Lock) 트리거
  useEffect(() => {
    if (readingState === ReadingState.LISTENING) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [readingState, requestWakeLock, releaseWakeLock]);

  if (!currentUser) {
    return (
      <>
        <BrowserRecommendation />
        <LandingPage
          authForm={
            <div className="space-y-4">
              <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-500 drop-shadow-sm">바이블로그</h2>
                <p className="text-sm text-gray-500 font-medium">BibleLog Journey</p>
              </div>
              <AuthForm onAuth={handleAuth} onRegister={handleRegister} title="로그인 또는 회원등록" />
              {appError && <p className="mt-4 text-red-500 text-center">{appError}</p>}


              {userOverallProgress && (userOverallProgress.lastReadChapter > 0) && readingState === ReadingState.IDLE && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700 text-center font-medium">
                  {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}장 {userOverallProgress.lastReadVerse || 1}절에서 이어 읽으실 수 있습니다.
                </div>
              )}

              {!browserSupportsSpeechRecognition && (
                <div className="mt-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-2xl text-sm">
                  <p className="font-semibold">음성 인식 미지원</p>
                  <p className="opacity-80">현재 브라우저에서는 음성 인식 기능을 지원하지 않습니다. Chrome, Safari 최신 버전을 권장합니다.</p>
                </div>
              )}
            </div>
          }
        />
      </>
    );
  }

  // Handle Bible Reset
  const handleBibleReset = async () => {
    if (!window.confirm('정말 다시 말씀 원정을 시작하시겠습니까?\n완독 횟수가 증가하고, 모든 진행률이 초기화됩니다.')) return;
    setBibleResetLoading(true);
    try {
      const res = await fetch('/api/bible-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, groupId: selectedGroupId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`다시 시작되었습니다! (완독 횟수: ${data.round}회)`);
        window.location.reload();
      } else {
        alert('오류: ' + (data.error || '진행을 실패했습니다.'));
      }
    } catch (e) {
      alert('서버 오류: 잠시 후 다시 시도해주세요.');
    } finally {
      setBibleResetLoading(false);
    }
  };

  const handleLogout = () => {
    if (readingState === ReadingState.LISTENING) {
      handleStopReadingAndSave();
    }
    authService.logoutUser();
    setCurrentUser(null);
    setUserOverallProgress(null);
    setReadingState(ReadingState.IDLE);
    setSessionTargetVerses([]);
    setCurrentVerseIndexInSession(0);
    setMatchedVersesContentForSession('');
    setSessionProgress(initialSessionProgress);
    setSessionCertificationMessage('');
    setShowMyPage(false);
  };

  return (
    <>
      <Analytics />
      <BrowserRecommendation />
      <div className="container mx-auto p-4 max-w-4xl bg-amber-50 shadow-lg rounded-lg">

        {/* Dashboard View */}
        {readingState === ReadingState.IDLE && (
          <Dashboard
            currentUser={currentUser}
            userOverallProgress={userOverallProgress}
            totalBibleChapters={totalBibleChapters}
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
            // Group Props
            userGroups={userGroups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={(id: number | null) => setSelectedGroupId(id)}
            onGroupAction={async () => {
              if (currentUser?.id) await loadUserGroups(currentUser.id);
            }}
          />
        )}

        {/* Hall of Fame Modal */}
        {showHallOfFame && (
          <HallOfFame
            groupId={selectedGroupId}
            groupName={userGroups.find(g => g.id === selectedGroupId)?.name}
            onClose={() => setShowHallOfFame(false)}
          />
        )}

        {/* Active Reading Session View */}
        {(readingState !== ReadingState.IDLE) && (
          <ActiveReadingSession
            readingState={readingState}
            sessionTargetVerses={sessionTargetVerses}
            currentTargetVerse={sessionTargetVerses[syncedVerseIndex] || null}
            sessionProgress={{
              ...sessionProgress,
              sessionCompletedVersesCount: syncedVerseIndex
            }}
            transcript={sttTranscript}
            matchedVersesContent={matchedVersesContentForSession}
            showAmenPrompt={showAmenPrompt}
            hasDifficultWords={hasDifficultWords}
            matchedCharCount={syncedVerseIndex === currentVerseIndexInSession ? matchedCharCount : (sessionTargetVerses[syncedVerseIndex]?.text.length || 0)}
            onStopReading={() => handleStopReadingAndSave(undefined, false)}
            onRetryVerse={handleRetryVerse}
            onExitSession={handleExitSession}
            onStartListening={async () => {
              setReadingState(ReadingState.LISTENING);

              if (isRecordingEnabled) {
                // 특정 유저: 녹음만 가동 (인식 패스)
                if (currentUser?.id === 1 || currentUser?.id === 100) addDebugLog('🎙️ [모드] 녹음 전용 모드 가동');
                await startRecording();
              } else {
                // 일반 유저: 인식만 가동
                setTimeout(() => {
                  startListening();
                }, 300);
              }
            }}
            sessionCertificationMessage={sessionCertificationMessage}
            isStalled={isStalled}
            onSessionCompleteConfirm={() => {
              // 세션 완료 후 페이지 새로고침하여 음성인식 리소스 정리
              // 이렇게 하면 다음 세션에서 마이크 버벅임 방지
              window.location.reload();
            }}
            isResume={isResumeSession}
            isListening={isListening}
            isMicWaiting={isMicWaiting}
            sttError={sttError}
            // 녹음 모드를 위한 추가 프로퍼티
            isRecordingEnabled={isRecordingEnabled}
            onManualNextVerse={handleManualNextVerse}
            recordingCount={recordingCount}
            isAudioUploading={isAudioUploading}
            audioUploadProgress={audioUploadProgress}
            onUploadRecordings={() => {
              if (currentUser?.id) {
                uploadAllRecordings(currentUser.id, selectedGroupId);
              }
            }}
          />
        )}

        {/* Unified Global Footer */}
        {readingState === ReadingState.IDLE && (
          <footer className="mt-16 pb-12 px-4 border-t border-gray-100 pt-12 text-center">
            <div className="max-w-md md:max-w-2xl lg:max-w-full mx-auto space-y-10">
              {/* Support Section */}
              {currentUser && (
                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl border border-indigo-50 shadow-sm overflow-hidden transition-all duration-300">
                  <button
                    onClick={() => setFooterSupportExpanded(!footerSupportExpanded)}
                    className="w-full p-6 flex items-center justify-between group"
                  >
                    <h4 className="text-indigo-900 font-black flex items-center gap-2">
                      <span className="text-xl">❤️</span> 바이블로그를 응원해 주세요
                    </h4>
                    <span className={`text-indigo-400 transition-transform duration-300 ${footerSupportExpanded ? 'rotate-180' : ''}`}>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </span>
                  </button>

                  {footerSupportExpanded && (
                    <div className="px-6 pb-8 animate-fade-in-down">
                      <p className="text-sm text-indigo-700 opacity-80 mb-6 leading-relaxed break-keep">
                        성도님들의 따뜻한 후원은 더 나은 바이블로그 서비스 운영을 지속하는 큰 힘이 됩니다.
                      </p>

                      <div className="flex flex-col items-center gap-6 mb-6">
                        {/* QR Code Section */}
                        <div className="bg-white p-6 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center shadow-sm w-full max-w-[240px]">
                          <img src="/assets/kakao-qr.png" alt="카카오페이 QR" className="w-40 h-40 object-contain mb-3" />
                          <span className="text-[10px] font-bold text-gray-400">카카오페이 스캔 송금</span>
                        </div>

                        {/* Direct Pay Link Button */}
                        <a
                          href="https://qr.kakaopay.com/FPSSoizJo"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full max-w-[240px] py-4 bg-[#FFEB00] text-[#3C1E1E] rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-md shadow-yellow-100"
                        >
                          <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png" alt="" className="w-5 h-5" />
                          카카오페이로 지금 송금
                        </a>
                      </div>

                      <p className="text-[10px] text-indigo-300 italic text-center">
                        *후원금은 서비스 고도화와 서버 운영비로 사용됩니다.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Church Custom Solution Promotion */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-50 text-left overflow-hidden transition-all duration-300">
                <button
                  onClick={() => setFooterChurchExpanded(!footerChurchExpanded)}
                  className="w-full p-6 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">⛪</span>
                    <div>
                      <h4 className="text-lg font-black text-gray-900 leading-tight">
                        우리 교회만을 위한 <br className="md:hidden" />
                        <span className="text-indigo-600 font-black">특별한 통독 서비스</span>
                      </h4>
                      <p className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-wider">Church Custom Solutions</p>
                    </div>
                  </div>
                  <span className={`text-gray-300 transition-transform duration-300 ${footerChurchExpanded ? 'rotate-180' : ''}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </span>
                </button>

                {footerChurchExpanded && (
                  <div className="px-6 pb-8 space-y-6 animate-fade-in-down">
                    <div className="h-px bg-gray-50 w-full mb-6"></div>
                    <ul className="space-y-4">
                      <li className="flex gap-3">
                        <span className="text-indigo-500 font-bold">01</span>
                        <div>
                          <strong className="text-sm text-gray-800 block mb-1">교회용 관리자 대시보드</strong>
                          <p className="text-xs text-gray-500 leading-relaxed">전 성도의 통독 현황을 통계로 한눈에 관리하고 엑셀로 다운로드하여 심방 및 양육 자료로 활용하세요.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="text-indigo-500 font-bold">02</span>
                        <div>
                          <strong className="text-sm text-gray-800 block mb-1">특별 통독 캠페인 패키지</strong>
                          <p className="text-xs text-gray-500 leading-relaxed">사순절, 연말연시 등 주제별 캠페인을 개설하고 달성도에 따른 자동 수료증 발급 솔루션을 제공합니다.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="text-indigo-500 font-bold">03</span>
                        <div>
                          <strong className="text-sm text-gray-800 block mb-1">교회 전용 브랜딩 및 커스텀</strong>
                          <p className="text-xs text-gray-500 leading-relaxed">교회 로고 적용은 물론, 주간 광고와 말씀 요약을 노출하는 전용 커뮤니티 페이지를 구성해 드립니다.</p>
                        </div>
                      </li>
                    </ul>

                    <a
                      href="mailto:luxual8@gmail.com"
                      className="w-full flex items-center justify-center py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 group"
                    >
                      문의하기 <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Legal & Credits Section */}
              <div className="space-y-6">
                {/* Bible Translation Info */}
                <div className="text-center px-4">
                  <p className="text-[10px] text-gray-400 leading-relaxed break-keep">
                    본 서비스는 저작권 정책에 따라 <span className="font-bold text-gray-500">개역한글</span> 번역본을<br />
                    사용하고 있습니다.
                    개역개정은 고액의 라이선스 비용이 발생하여 <br />
                    부득이하게 개역한글로 제공되는 점 양해 부탁드립니다.
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100 flex flex-col items-center gap-4">
                  <button
                    onClick={() => setShowMyPage(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 text-gray-500 rounded-full text-xs font-bold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                  >
                    <span>👤</span> 마이페이지 (관리)
                  </button>
                </div>

                <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>개인정보 처리방침</span>
                  <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                  <span>이용약관</span>
                </div>

                <div className="text-[11px] text-gray-400 leading-relaxed space-y-2 font-medium break-keep">
                  <p>바이블로그는 아이디와 비밀번호 외의 개인정보를 수집하지 않습니다.</p>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    <span>포도나무교회</span>
                    <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                    <span>Dev: 이종림</span>
                    <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                    <a href="mailto:luxual8@gmail.com" className="text-indigo-400 underline decoration-indigo-200 hover:text-indigo-600">문의 및 개선</a>
                  </div>

                  {/* Patent Pending Info */}
                  <div className="mt-4 p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 inline-block">
                    <p className="text-[10px] text-indigo-600 font-bold mb-1">특허 출원 중 (제 10-2026-0002574 호)</p>
                    <p className="text-[9px] text-gray-400 font-medium">실시간 음성 인식 기반의 텍스트 매칭을 이용한 낭독 진도 관리 시스템 및 그 방법</p>
                  </div>

                  <p className="opacity-70 mt-4">Copyright © 2026 <span className="font-extrabold text-gray-500">bibleLog.kr</span>. All rights reserved.</p>
                  <p className="italic text-gray-300 text-[10px] mt-2">"음성 인식 정확도를 위해 조용한 환경을 권장합니다"</p>
                </div>
              </div>
            </div>
          </footer>
        )}
        {/* My Page Modal */}
        {currentUser && (
          <MyPage
            isOpen={showMyPage}
            onClose={() => setShowMyPage(false)}
            currentUser={currentUser}
            onLogout={handleLogout}
            onPasswordChange={() => {
              setShowPasswordChangePrompt(true);
            }}
          />
        )}

        {/* Password Change Modal */}
        {currentUser && (
          <PasswordChangeModal
            isOpen={showPasswordChangePrompt}
            onClose={() => {
              setShowPasswordChangePrompt(false);
              setPasswordChangeError('');
              setPasswordChangeSuccess('');
              setNewPassword('');
              setConfirmNewPassword('');
            }}
            currentUser={currentUser}
            onSuccess={(updatedUser) => {
              setCurrentUser(updatedUser);
              setShowPasswordChangePrompt(false);
              alert('비밀번호가 안전하게 변경되었습니다.');
            }}
          />
        )}
      </div>

      {/* 디버그 로그 오버레이 (ID 100 사용자 전용) */}
      {currentUser?.id === 100 && debugLogs.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/90 text-green-400 text-[10px] p-2 max-h-48 overflow-y-auto z-[9999] font-mono border-t border-green-900/30">
          <div className="flex justify-between items-center mb-1 pb-1 border-b border-green-900/20">
            <span className="text-yellow-400 font-bold">🔧 MIC DEBUG PANEL</span>
            <button onClick={() => setDebugLogs([])} className="text-red-400 px-2 active:bg-red-900/20 rounded">CLEAR</button>
          </div>
          {debugLogs.map((log, i) => (
            <div key={i} className="py-0.5 border-b border-white/5 last:border-0">{log}</div>
          ))}
        </div>
      )}
    </>
  );
};

export default App;
