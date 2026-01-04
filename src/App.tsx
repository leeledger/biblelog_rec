import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { progressService } from './services/progressService';
import { groupService } from './services/groupService';
import { BibleVerse, SessionReadingProgress, ReadingState, User, UserProgress, UserSessionRecord, Group } from './types';
import { AVAILABLE_BOOKS, getVersesForSelection, getNextReadingStart, BOOK_ABBREVIATIONS_MAP, TOTAL_CHAPTERS_IN_BIBLE } from './constants';
import { normalizeText, calculateSimilarity, containsDifficultWord, findMatchedPrefixLength } from './utils';
import rawBibleData from './bible_hierarchical.json';

import useSpeechRecognition from './hooks/useSpeechRecognition';
import * as authService from './services/authService';
import AuthForm from './components/AuthForm';
import HallOfFame from './components/HallOfFame';
import { BrowserRecommendation } from './components/BrowserRecommendation';

// Refactored Sub-components
import Dashboard from './components/Dashboard';
import ActiveReadingSession from './components/ActiveReadingSession';
import InstallPWA from './components/InstallPWA';
import LandingPage from './components/LandingPage';

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
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null); // null means Private Journey
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

  // 데이터 로딩 상태
  const [isProgressLoading, setIsProgressLoading] = useState(true);


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
  const [selectedBookForSelector, setSelectedBookForSelector] = useState<string>(AVAILABLE_BOOKS[0]?.name || '');
  const [startChapterForSelector, setStartChapterForSelector] = useState<number>(1);
  const [endChapterForSelector, setEndChapterForSelector] = useState<number>(1);
  const [startVerseForSelector, setStartVerseForSelector] = useState<number>(1);
  const [showBookCompletionStatus, setShowBookCompletionStatus] = useState(false);

  const {
    isListening,
    transcript: sttTranscript,
    error: sttError,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    resetTranscript,
    markVerseTransition
  } = useSpeechRecognition({ lang: 'ko-KR' });

  const loadUserGroups = async (userId: number) => {
    try {
      const groups = await groupService.getUserGroups(userId);
      setUserGroups(groups);
    } catch (err) {
      console.error('Failed to load user groups:', err);
    }
  };

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
    if (isRetryingVerse && !isListening) {
      startListening();
      setIsRetryingVerse(false);
    }
  }, [isRetryingVerse, isListening, startListening]);

  // Authentication Effect
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      if (user.id) loadUserGroups(user.id);
    }
  }, []);

  // Effect to set default values for ChapterSelector based on user progress
  useEffect(() => {
    if (currentUser && userOverallProgress) {
      const lastReadInfo = userOverallProgress && userOverallProgress.lastReadBook && userOverallProgress.lastReadChapter && userOverallProgress.lastReadVerse
        ? { book: userOverallProgress.lastReadBook, chapter: userOverallProgress.lastReadChapter, verse: userOverallProgress.lastReadVerse }
        : null;
      const nextRead = getNextReadingStart(lastReadInfo);
      if (nextRead) {
        setSelectedBookForSelector(nextRead.book);
        setStartChapterForSelector(nextRead.chapter);
        setEndChapterForSelector(nextRead.chapter);
        setStartVerseForSelector(nextRead.verse);
      } else {
        const firstBook = AVAILABLE_BOOKS[0];
        if (firstBook) {
          setSelectedBookForSelector(firstBook.name);
          setStartChapterForSelector(1);
          setEndChapterForSelector(1);
          setStartVerseForSelector(1);
        }
      }
    } else {
      const firstBook = AVAILABLE_BOOKS[0];
      if (firstBook) {
        setSelectedBookForSelector(firstBook.name);
        setStartChapterForSelector(1);
        setEndChapterForSelector(1);
        setStartVerseForSelector(1);
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
      setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
      resetTranscript();
      setTranscriptBuffer('');
      setMatchedCharCount(0); // 구절 전환 시 리셋
    }
  }, [currentTargetVerseForSession, readingState, currentVerseIndexInSession, sessionTargetVerses, sessionProgress, stopListening, resetTranscript]);

  // --------------- CORE MATCHING LOGIC (KEPT IN APP.TSX) -----------------
  useEffect(() => {
    setTranscriptBuffer(sttTranscript);

    // 점진적 매칭: 현재 구절에서 매칭된 글자 수 업데이트
    if (currentTargetVerseForSession && sttTranscript) {
      const matchedCount = findMatchedPrefixLength(
        currentTargetVerseForSession.text,
        sttTranscript,
        60 // 임계값 60으로 통일하여 정확성 향상
      );
      setMatchedCharCount(matchedCount);
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
    if (showAmenPrompt && hasDifficultWords && transcriptBuffer) {
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

    if (isIOS && isMatch && normalizedTargetVerseText.length > LONG_VERSE_CHAR_COUNT) {
      const targetEnd = normalizedTargetVerseText.slice(-END_PORTION_LENGTH);
      const bufferEnd = bufferPortionToCompare.slice(-END_PORTION_LENGTH);
      const endSimilarity = calculateSimilarity(targetEnd, bufferEnd);

      if (endSimilarity < 60) {
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

        if (isIOS) {
          setTimeout(() => {
            stopListening();
            setIsRetryingVerse(true);
          }, 100);
        }
      }
    }
  }, [transcriptBuffer, readingState, currentTargetVerseForSession, currentUser, sessionTargetVerses, userOverallProgress]);
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (sttError) {
      setAppError(`음성인식 오류: ${sttError}`);
    }
  }, [sttError]);

  // Removed automatic startListening useEffect to comply with mobile browser user gesture requirements.
  // startListening should now be called directly from user-initiated events (buttons).

  const handleSelectChaptersAndStartReading = useCallback((book: string, startCh: number, endCh: number) => {
    const verses = getVersesForSelection(book, startCh, endCh);
    if (verses.length > 0) {
      let initialSkip = 0;
      if (
        book === selectedBookForSelector &&
        startCh === startChapterForSelector &&
        endCh === startChapterForSelector &&
        startVerseForSelector > 1
      ) {
        const firstVerseIndex = verses.findIndex(v => v.verse === startVerseForSelector);
        if (firstVerseIndex !== -1) {
          initialSkip = firstVerseIndex;
        }
      }

      setSessionTargetVerses(verses);
      setReadingState(ReadingState.READING);
      setCurrentVerseIndexInSession(initialSkip);
      setMatchedVersesContentForSession('');
      setTranscriptBuffer('');
      resetTranscript();
      setMatchedCharCount(0); // 세션 시작 시 리셋
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
  }, [selectedBookForSelector, startChapterForSelector, startVerseForSelector, resetTranscript]);

  const handleStopReadingAndSave = useCallback((overrideSessionCompletedCount?: number | React.MouseEvent<HTMLButtonElement>, isNaturalCompletion: boolean = false) => {
    if (!isNaturalCompletion) {
      stopListening();
    }

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

      progressService.saveUserProgress(currentUser.username, updatedUserProgress)
        .then(() => {
          setUserOverallProgress(updatedUserProgress);
          setOverallCompletedChaptersCount(updatedUserProgress.completedChapters?.length || 0);
        })
        .catch(err => console.error(err));

    } else if (versesActuallyReadThisSessionCount <= 0 && !isNaturalCompletion) {
      setSessionCertificationMessage("이번 세션에서 읽은 구절이 없습니다.");
    }

    if (!isNaturalCompletion) {
      setReadingState(ReadingState.IDLE);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }, [stopListening, sessionProgress, sessionTargetVerses, currentUser, userOverallProgress]);

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

    if (readingState === ReadingState.LISTENING && hasDifficult) {
      setVerseStartTime(Date.now());
      const timeoutId = setTimeout(() => {
        setShowAmenPrompt(true);
      }, 15000);
      setVerseTimeoutId(timeoutId);
    }
  }, [currentVerseIndexInSession, readingState]);

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

              {userOverallProgress && (userOverallProgress.lastReadChapter > 0 || userOverallProgress.lastReadVerse > 0) && readingState === ReadingState.IDLE && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-700">
                  마지막 읽은 곳: {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}장 {userOverallProgress.lastReadVerse}절
                  <span className="italic block mt-1 text-xs opacity-70">(아래에서 이어서 읽거나 새로운 범위를 선택하여 읽으세요.)</span>
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
  };

  return (
    <>
      <BrowserRecommendation />
      <div className="container mx-auto p-4 max-w-4xl bg-amber-50 shadow-lg rounded-lg">
        {currentUser && currentUser.must_change_password && showPasswordChangePrompt && (
          <div className="p-4 mb-4 text-sm text-orange-700 bg-orange-100 rounded-lg border border-orange-300 shadow-md" role="alert">
            <h3 className="font-bold text-lg mb-2">비밀번호 변경 필요</h3>
            <p className="mb-1">현재 임시 비밀번호(1234)를 사용하고 있습니다. 보안을 위해 즉시 새 비밀번호를 설정해주세요.</p>
            <form onSubmit={handlePasswordChangeSubmit} className="mt-3 space-y-3">
              <div>
                <label htmlFor="newPassword" className="block text-xs font-medium text-orange-800">새 비밀번호:</label>
                <input type="password" id="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400" placeholder="새 비밀번호 입력" />
              </div>
              <div>
                <label htmlFor="confirmNewPassword" className="block text-xs font-medium text-orange-800">새 비밀번호 확인:</label>
                <input type="password" id="confirmNewPassword" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400" placeholder="새 비밀번호 다시 입력" />
              </div>
              {passwordChangeError && <p className="text-xs text-red-600">{passwordChangeError}</p>}
              {passwordChangeSuccess && <p className="text-xs text-green-600">{passwordChangeSuccess}</p>}
              <div className="flex items-center justify-between">
                <button type="submit" className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-1">비밀번호 변경하기</button>
                <button type="button" onClick={() => { setShowPasswordChangePrompt(false); setPasswordChangeError(null); setPasswordChangeSuccess(null); setNewPassword(''); setConfirmNewPassword(''); }} className="px-3 py-1.5 text-xs font-medium text-orange-700 bg-transparent border border-orange-700 rounded hover:bg-orange-200 focus:ring-2 focus:ring-orange-300">나중에 변경</button>
              </div>
            </form>
          </div>
        )}

        {/* Dashboard View */}
        {readingState === ReadingState.IDLE && (
          <Dashboard
            currentUser={currentUser}
            userOverallProgress={userOverallProgress}
            totalBibleChapters={totalBibleChapters}
            overallCompletedChaptersCount={overallCompletedChaptersCount}
            selectedBookForSelector={selectedBookForSelector}
            startChapterForSelector={startChapterForSelector}
            endChapterForSelector={endChapterForSelector}
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
            onSelectGroup={(id) => setSelectedGroupId(id)}
            onGroupAction={async () => {
              if (currentUser?.id) await loadUserGroups(currentUser.id);
            }}
          />
        )}

        {/* Hall of Fame Modal */}
        {showHallOfFame && (
          <HallOfFame onClose={() => setShowHallOfFame(false)} />
        )}

        {/* Active Reading Session View */}
        {(readingState !== ReadingState.IDLE) && (
          <ActiveReadingSession
            readingState={readingState}
            sessionTargetVerses={sessionTargetVerses}
            currentTargetVerse={currentTargetVerseForSession}
            sessionProgress={sessionProgress}
            transcript={sttTranscript}
            matchedVersesContent={matchedVersesContentForSession}
            showAmenPrompt={showAmenPrompt}
            hasDifficultWords={hasDifficultWords}
            matchedCharCount={matchedCharCount}
            onStopReading={() => handleStopReadingAndSave(undefined, false)}
            onRetryVerse={handleRetryVerse}
            onExitSession={() => {
              setReadingState(ReadingState.IDLE);
              setSessionTargetVerses([]);
              setCurrentVerseIndexInSession(0);
              setMatchedVersesContentForSession('');
              setSessionProgress(initialSessionProgress);
              setSessionCertificationMessage('');
              setTranscriptBuffer('');
            }}
            onStartListening={() => {
              setReadingState(ReadingState.LISTENING);
              // Directly call startListening to satisfy mobile's requirement for user-initiated audio/mic access.
              setTimeout(() => {
                startListening();
              }, 0);
            }}
            sessionCertificationMessage={sessionCertificationMessage}
            onSessionCompleteConfirm={() => {
              setReadingState(ReadingState.IDLE);
              setSessionTargetVerses([]);
              setMatchedVersesContentForSession('');
              setSessionProgress({ totalVersesInSession: 0, sessionCompletedVersesCount: 0, sessionInitialSkipCount: 0 });
              setSessionCertificationMessage('');
              setSessionCount(prev => prev + 1);
            }}
          />
        )}

        <footer className="mt-12 pt-6 border-t border-gray-300 text-center text-xs sm:text-sm text-gray-500">
          <div className="mt-10 text-center text-xs text-gray-400 font-sans select-none">
            <div className="mb-1">포도나무교회 &nbsp;|&nbsp; Dev: 이종림&nbsp;|&nbsp; <a href="mailto:luxual8@gmail.com" className="underline hover:text-amber-700">문의 및 개선사항</a></div>
            <div className="mb-1">Copyright © 2025 이종림 All rights reserved.</div>
            <div className="italic text-[11px] text-gray-300">음성 인식 정확도를 위해 조용한 환경을 권장합니다</div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default App;
