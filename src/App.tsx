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
// iOS???몄떇??鍮⑤씪?????꾧꺽??議곌굔 ?곸슜
const FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS = 60; // 50 -> 60 (???믪? ?좎궗???붽뎄)
const MINIMUM_READ_LENGTH_RATIO_IOS = 0.98; // 0.95 -> 0.98 (??留롮씠 ?쎌뼱????
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS = 1; // 2 -> 1 (嫄곗쓽 ?꾩껜瑜??쎌뼱????
const LONG_VERSE_CHAR_COUNT = 30;
const END_PORTION_LENGTH = 15;

const initialSessionProgress: SessionReadingProgress = {
  totalVersesInSession: 0,
  sessionCompletedVersesCount: 0,
  sessionInitialSkipCount: 0,
};

type ViewState = 'IDLE_SETUP' | 'LEADERBOARD';

const App: React.FC = () => {
  // ?뚮옯??媛먯? 濡쒖쭅
  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);

  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [bibleResetLoading, setBibleResetLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => {
    const saved = localStorage.getItem('selectedGroupId');
    return saved ? parseInt(saved, 10) : null;
  }); // null means Private Journey
  const [userOverallProgress, setUserOverallProgress] = useState<UserProgress | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('IDLE_SETUP');
  const [sessionCount, setSessionCount] = useState(0);

  const [sessionTargetVerses, setSessionTargetVerses] = useState<BibleVerse[]>([]);
  const [currentVerseIndexInSession, setCurrentVerseIndexInSession] = useState(0);

  // ?꾨찘 ?⑥뒪 湲곕뒫 愿???곹깭
  const [verseStartTime, setVerseStartTime] = useState<number | null>(null);
  const [showAmenPrompt, setShowAmenPrompt] = useState(false);
  const [verseTimeoutId, setVerseTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [hasDifficultWords, setHasDifficultWords] = useState(false);

  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [matchedVersesContentForSession, setMatchedVersesContentForSession] = useState<string>('');
  const [isRetryingVerse, setIsRetryingVerse] = useState(false);
  const [readingState, setReadingState] = useState<ReadingState>(ReadingState.IDLE);

  // ?먯쭊??留ㅼ묶: ?꾩옱 援ъ젅?먯꽌 留ㅼ묶??湲????  const [matchedCharCount, setMatchedCharCount] = useState(0);

  // ?곗씠??濡쒕뵫 ?곹깭
  const [isProgressLoading, setIsProgressLoading] = useState(true);

  // ?명꽣 ?뱀뀡 ?뺤옣 ?곹깭
  const [footerSupportExpanded, setFooterSupportExpanded] = useState(false);
  const [footerChurchExpanded, setFooterChurchExpanded] = useState(false);


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

  // ?몃? ?대깽???꾪솕 ?섏떊 ?? 媛먯? 諛??먮룞 蹂듦뎄 濡쒖쭅
  useEffect(() => {
    const handleVisibilityOrFocusChange = () => {
      // ?섏씠吏媛 ?ㅼ떆 蹂댁뿬吏嫄곕굹 ?ъ빱?ㅻ? 諛쏆븯????      if (!document.hidden && document.visibilityState === 'visible') {
        // ?꾩옱 '?쎄린 以????곹깭?먯꽌 ?뚯븘?붾떎硫?留덉씠??由ъ뀑???꾪빐 ?덈줈怨좎묠 ?ㅽ뻾
        if (readingState === ReadingState.READING || readingState === ReadingState.LISTENING) {
          console.log('Visibility/Focus regained during reading session. Reloading to reset speech engine...');
          // ?좎떆 吏?????덈줈怨좎묠 (?곗씠????κ낵??異⑸룎 諛⑹?)
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocusChange);
    window.addEventListener('focus', handleVisibilityOrFocusChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocusChange);
      window.removeEventListener('focus', handleVisibilityOrFocusChange);
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
  const [selectedBookForSelector, setSelectedBookForSelector] = useState<string>(AVAILABLE_BOOKS[0]?.name || '');
  const [startChapterForSelector, setStartChapterForSelector] = useState<number>(1);
  const [endChapterForSelector, setEndChapterForSelector] = useState<number>(1);
  const [startVerseForSelector, setStartVerseForSelector] = useState<number>(1);
  const [showBookCompletionStatus, setShowBookCompletionStatus] = useState(false);

  useEffect(() => {
    if (selectedGroupId !== null) {
      localStorage.setItem('selectedGroupId', selectedGroupId.toString());
    } else {
      localStorage.removeItem('selectedGroupId');
    }
  }, [selectedGroupId]);

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

      // 留뚯빟 ?좏깮??洹몃９?????댁긽 紐⑸줉???녿떎硫??덊눜/??젣), 媛쒖씤 ?듬룆?쇰줈 ?꾪솚
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
      const lastReadInfo = userOverallProgress && userOverallProgress.lastReadBook && userOverallProgress.lastReadChapter && (userOverallProgress.lastReadVerse !== undefined && userOverallProgress.lastReadVerse !== null)
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
      setPasswordChangeError('??鍮꾨?踰덊샇媛 ?쇱튂?섏? ?딆뒿?덈떎.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordChangeError('鍮꾨?踰덊샇??理쒖냼 4???댁긽?댁뼱???⑸땲??');
      return;
    }
    if (newPassword === '1234') {
      setPasswordChangeError('??鍮꾨?踰덊샇??湲곕낯 鍮꾨?踰덊샇? ?ㅻⅤ寃??ㅼ젙?댁빞 ?⑸땲??');
      return;
    }

    if (!currentUser || typeof currentUser.id !== 'number') {
      setPasswordChangeError('?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??');
      return;
    }

    try {
      const result = await authService.changePassword(currentUser.id, newPassword);
      if (result && result.user) {
        setPasswordChangeSuccess('鍮꾨?踰덊샇媛 ?깃났?곸쑝濡?蹂寃쎈릺?덉뒿?덈떎!');
        setCurrentUser({ ...currentUser, ...result.user, must_change_password: false });
        setShowPasswordChangePrompt(false);
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordChangeError(result?.message || '鍮꾨?踰덊샇 蹂寃쎌뿉 ?ㅽ뙣?덉뒿?덈떎.');
      }
    } catch (error) {
      setPasswordChangeError('鍮꾨?踰덊샇 蹂寃?以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  const handleAuth = async (username: string, password_provided: string): Promise<boolean> => {
    const user = await authService.loginUser(username, password_provided);
    if (user) {
      setCurrentUser(user);
      if (user.id) loadUserGroups(user.id);
      setShowPasswordChangePrompt(user.must_change_password === true);
      setAppError(null);

      // 濡쒓렇???깃났 ???섏씠吏 理쒖긽?⑥쑝濡??ㅽ겕濡?      window.scrollTo({ top: 0, behavior: 'smooth' });

      return true;
    } else {
      setAppError('鍮꾨?踰덊샇瑜??뺤씤?섏꽭??');
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

    setMatchedVersesContentForSession(prev => prev + `${currentVerse.book} ${currentVerse.chapter}:${currentVerse.verse} - [?⑥뒪] ${currentVerse.text}\n`);

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

      const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}??${firstVerseActuallyReadInSession.verse}??~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}??${lastVerseOfSession.verse}??(珥?${versesReadCountThisSession}?? ?쎄린 ?꾨즺!`;
      setSessionCertificationMessage(certMsg);
      setAppError(null);

      handleStopReadingAndSave(newTotalCompletedInSelection, true);
    } else {
      setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
      resetTranscript();
      setTranscriptBuffer('');
      setMatchedCharCount(0); // 援ъ젅 ?꾪솚 ??由ъ뀑
    }
  }, [currentTargetVerseForSession, readingState, currentVerseIndexInSession, sessionTargetVerses, sessionProgress, stopListening, resetTranscript]);

  // --------------- CORE MATCHING LOGIC (KEPT IN APP.TSX) -----------------
  useEffect(() => {
    setTranscriptBuffer(sttTranscript);

    // ?먯쭊??留ㅼ묶: ?꾩옱 援ъ젅?먯꽌 留ㅼ묶??湲?????낅뜲?댄듃
    if (currentTargetVerseForSession && sttTranscript) {
      const matchedCount = findMatchedPrefixLength(
        currentTargetVerseForSession.text,
        sttTranscript,
        60 // ?꾧퀎媛?60?쇰줈 ?듭씪?섏뿬 ?뺥솗???μ긽
      );
      setMatchedCharCount(matchedCount);
    }

    if (readingState !== ReadingState.LISTENING || !showAmenPrompt) return;

    const normalizedTranscript = normalizeText(sttTranscript.toLowerCase());
    if (normalizedTranscript.includes('?꾨찘')) {
      handleVerseSkip();
    }
  }, [sttTranscript, showAmenPrompt, readingState, handleVerseSkip, currentTargetVerseForSession, isIOS]);

  useEffect(() => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) {
      return;
    }

    // ?꾨찘 ?⑥뒪
    if (showAmenPrompt && hasDifficultWords && transcriptBuffer) {
      const normalizedTranscript = normalizeText(transcriptBuffer.toLowerCase());
      if (normalizedTranscript.includes('?꾨찘')) {
        console.log('[App.tsx] ?꾨찘 ?⑥뒪 媛먯???);
        setShowAmenPrompt(false);
        if (verseTimeoutId) {
          clearTimeout(verseTimeoutId);
          setVerseTimeoutId(null);
        }

        setTimeout(() => {
          setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text} [?꾨찘 ?⑥뒪 ?곸슜]\n`);
          setTranscriptBuffer('');
          setTimeout(() => resetTranscript(), 50);

          if (currentVerseIndexInSession < sessionTargetVerses.length - 1) {
            setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
            setMatchedCharCount(0); // 援ъ젅 ?꾪솚 ??由ъ뀑
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
      const transitionDelay = isIOS ? 600 : 100; // Android??100ms ?뺣룄 ?쒕젅?대? 二쇱뼱 踰꾪띁媛 ?뺣━???쒓컙??以?
      setTimeout(() => {
        setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text}\n`);
        setTranscriptBuffer('');
        setMatchedCharCount(0); // 援ъ젅 ?꾪솚 ??由ъ뀑

        // 援ъ젅 ?꾪솚 ?뚮┝ (?뚯꽦 ?몄떇 ?쇱씠?꾩궗?댄겢 愿由?
        if (markVerseTransition) markVerseTransition();

        // 由ъ뀑 諛??ㅼ쓬 援ъ젅 以鍮?        setTimeout(() => {
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

        const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}??${firstVerseActuallyReadInSession.verse}??~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}??${lastVerseOfSession.verse}??(珥?${versesReadCountThisSession}?? ?쎄린 ?꾨즺!`;
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
        setMatchedCharCount(0); // 援ъ젅 ?꾪솚 ??由ъ뀑

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
      setAppError(`?뚯꽦?몄떇 ?ㅻ쪟: ${sttError}`);
    }
  }, [sttError]);

  // Removed automatic startListening useEffect to comply with mobile browser user gesture requirements.
  // startListening should now be called directly from user-initiated events (buttons).

  const handleSelectChaptersAndStartReading = useCallback((book: string, startCh: number, endCh: number, startVerse?: number) => {
    const verses = getVersesForSelection(book, startCh, endCh);
    if (verses.length > 0) {
      let initialSkip = 0;

      // ?꾨떖諛쏆? startVerse媛 ?덇굅?? selector??湲곕낯媛믪씠 ?덉쑝硫??댁뼱 ?쎄린 ?곸슜
      const actualStartVerse = startVerse || startVerseForSelector;

      if (
        book === selectedBookForSelector &&
        startCh === startChapterForSelector &&
        endCh === startChapterForSelector &&
        actualStartVerse > 1
      ) {
        const firstVerseIndex = verses.findIndex(v => v.verse === actualStartVerse);
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
      setMatchedCharCount(0); // ?몄뀡 ?쒖옉 ??由ъ뀑
      setSessionProgress({
        totalVersesInSession: verses.length,
        sessionCompletedVersesCount: initialSkip,
        sessionInitialSkipCount: initialSkip,
      });
      setSessionCertificationMessage("");
      setAppError(null);
    } else {
      setAppError('?좏깮??踰붿쐞???깃꼍 ?곗씠?곕? 李얠쓣 ???놁뒿?덈떎.');
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
        const certMsg = `${firstEffectivelyReadVerse.book} ${firstEffectivelyReadVerse.chapter}??${firstEffectivelyReadVerse.verse}??~ ${lastEffectivelyReadVerse.book} ${lastEffectivelyReadVerse.chapter}??${lastEffectivelyReadVerse.verse}??(珥?${versesActuallyReadThisSessionCount}?? ?쎌쓬 (?몄뀡 以묐떒).`;
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
          // ?뱀젙 ?μ쓽 留덉?留??덉씠 ?대쾲 ?몄뀡?먯꽌 ?쎌? 援ъ젅 紐⑸줉???ы븿?섏뼱 ?덈뒗吏 ?뺤씤
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
      setSessionCertificationMessage("?대쾲 ?몄뀡?먯꽌 ?쎌? 援ъ젅???놁뒿?덈떎.");
    }

    if (!isNaturalCompletion) {
      setReadingState(ReadingState.IDLE);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [stopListening, sessionProgress, sessionTargetVerses, currentUser, userOverallProgress, selectedGroupId]);

  const handleRetryVerse = useCallback(() => {
    setReadingState(ReadingState.LISTENING);
    setTranscriptBuffer('');
    setAppError(null);
    setMatchedCharCount(0); // ?ㅼ떆 ?쎄린 ??由ъ뀑
    setIsRetryingVerse(true);

    // resetTranscript媛 ?대??곸쑝濡?abort/start ?ъ씠?댁쓣 ?섑뻾?섏뿬 踰꾪띁瑜?源⑤걮??鍮꾩?
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
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-500 drop-shadow-sm">諛붿씠釉붾줈洹?/h2>
                <p className="text-sm text-gray-500 font-medium">BibleLog Journey</p>
              </div>
              <AuthForm onAuth={handleAuth} onRegister={handleRegister} title="濡쒓렇???먮뒗 ?뚯썝?깅줉" />
              {appError && <p className="mt-4 text-red-500 text-center">{appError}</p>}


              {userOverallProgress && (userOverallProgress.lastReadChapter > 0) && readingState === ReadingState.IDLE && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700 text-center font-medium">
                  {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}??{userOverallProgress.lastReadVerse || 1}?덉뿉???댁뼱 ?쎌쑝?????덉뒿?덈떎.
                </div>
              )}

              {!browserSupportsSpeechRecognition && (
                <div className="mt-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-2xl text-sm">
                  <p className="font-semibold">?뚯꽦 ?몄떇 誘몄???/p>
                  <p className="opacity-80">?꾩옱 釉뚮씪?곗??먯꽌???뚯꽦 ?몄떇 湲곕뒫??吏?먰븯吏 ?딆뒿?덈떎. Chrome, Safari 理쒖떊 踰꾩쟾??沅뚯옣?⑸땲??</p>
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
    if (!window.confirm('?뺣쭚 ?ㅼ떆 留먯? ?먯젙???쒖옉?섏떆寃좎뒿?덇퉴?\n?꾨룆 ?잛닔媛 利앷??섍퀬, 紐⑤뱺 吏꾪뻾瑜좎씠 珥덇린?붾맗?덈떎.')) return;
    setBibleResetLoading(true);
    try {
      const res = await fetch('/api/bible-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, groupId: selectedGroupId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`?ㅼ떆 ?쒖옉?섏뿀?듬땲?? (?꾨룆 ?잛닔: ${data.round}??`);
        window.location.reload();
      } else {
        alert('?ㅻ쪟: ' + (data.error || '吏꾪뻾???ㅽ뙣?덉뒿?덈떎.'));
      }
    } catch (e) {
      alert('?쒕쾭 ?ㅻ쪟: ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.');
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
            <h3 className="font-bold text-lg mb-2">鍮꾨?踰덊샇 蹂寃??꾩슂</h3>
            <p className="mb-1">?꾩옱 ?꾩떆 鍮꾨?踰덊샇(1234)瑜??ъ슜?섍퀬 ?덉뒿?덈떎. 蹂댁븞???꾪빐 利됱떆 ??鍮꾨?踰덊샇瑜??ㅼ젙?댁＜?몄슂.</p>
            <form onSubmit={handlePasswordChangeSubmit} className="mt-3 space-y-3">
              <div>
                <label htmlFor="newPassword" className="block text-xs font-medium text-orange-800">??鍮꾨?踰덊샇:</label>
                <input type="password" id="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400" placeholder="??鍮꾨?踰덊샇 ?낅젰" />
              </div>
              <div>
                <label htmlFor="confirmNewPassword" className="block text-xs font-medium text-orange-800">??鍮꾨?踰덊샇 ?뺤씤:</label>
                <input type="password" id="confirmNewPassword" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400" placeholder="??鍮꾨?踰덊샇 ?ㅼ떆 ?낅젰" />
              </div>
              {passwordChangeError && <p className="text-xs text-red-600">{passwordChangeError}</p>}
              {passwordChangeSuccess && <p className="text-xs text-green-600">{passwordChangeSuccess}</p>}
              <div className="flex items-center justify-between">
                <button type="submit" className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-1">鍮꾨?踰덊샇 蹂寃쏀븯湲?/button>
                <button type="button" onClick={() => { setShowPasswordChangePrompt(false); setPasswordChangeError(null); setPasswordChangeSuccess(null); setNewPassword(''); setConfirmNewPassword(''); }} className="px-3 py-1.5 text-xs font-medium text-orange-700 bg-transparent border border-orange-700 rounded hover:bg-orange-200 focus:ring-2 focus:ring-orange-300">?섏쨷??蹂寃?/button>
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
            startVerseForSelector={startVerseForSelector}
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

        {/* Unified Global Footer */}
        {readingState === ReadingState.IDLE && (
          <footer className="mt-16 pb-12 px-4 border-t border-gray-100 pt-12 text-center">
            <div className="max-w-md mx-auto space-y-10">
              {/* Support Section */}
              {currentUser && (
                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl border border-indigo-50 shadow-sm overflow-hidden transition-all duration-300">
                  <button
                    onClick={() => setFooterSupportExpanded(!footerSupportExpanded)}
                    className="w-full p-6 flex items-center justify-between group"
                  >
                    <h4 className="text-indigo-900 font-black flex items-center gap-2">
                      <span className="text-xl">?ㅿ툘</span> 諛붿씠釉붾줈洹몃? ?묒썝??二쇱꽭??                    </h4>
                    <span className={`text-indigo-400 transition-transform duration-300 ${footerSupportExpanded ? 'rotate-180' : ''}`}>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </span>
                  </button>

                  {footerSupportExpanded && (
                    <div className="px-6 pb-8 animate-fade-in-down">
                      <p className="text-sm text-indigo-700 opacity-80 mb-6 leading-relaxed break-keep">
                        ?깅룄?섎뱾???곕쑜???꾩썝? ???섏? 諛붿씠釉붾줈洹??쒕퉬???댁쁺??吏?랁븯?????섏씠 ?⑸땲??
                      </p>

                      <div className="flex flex-col items-center gap-6 mb-6">
                        {/* QR Code Section */}
                        <div className="bg-white p-6 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center shadow-sm w-full max-w-[240px]">
                          <img src="/assets/kakao-qr.png" alt="移댁뭅?ㅽ럹??QR" className="w-40 h-40 object-contain mb-3" />
                          <span className="text-[10px] font-bold text-gray-400">移댁뭅?ㅽ럹???ㅼ틪 ?↔툑</span>
                        </div>

                        {/* Direct Pay Link Button */}
                        <a
                          href="https://qr.kakaopay.com/FPSSoizJo"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full max-w-[240px] py-4 bg-[#FFEB00] text-[#3C1E1E] rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-md shadow-yellow-100"
                        >
                          <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png" alt="" className="w-5 h-5" />
                          移댁뭅?ㅽ럹?대줈 吏湲??↔툑
                        </a>
                      </div>

                      <p className="text-[10px] text-indigo-300 italic text-center">
                        *?꾩썝湲덉? ?쒕퉬??怨좊룄?붿? ?쒕쾭 ?댁쁺鍮꾨줈 ?ъ슜?⑸땲??
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
                    <span className="text-3xl">??/span>
                    <div>
                      <h4 className="text-lg font-black text-gray-900 leading-tight">?곕━ 援먰쉶留뚯쓣 ?꾪븳 <span className="text-indigo-600">?밸퀎???듬룆 ?쒕퉬??/span></h4>
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
                          <strong className="text-sm text-gray-800 block mb-1">援먰쉶??愿由ъ옄 ??쒕낫??/strong>
                          <p className="text-xs text-gray-500 leading-relaxed">???깅룄???듬룆 ?꾪솴???듦퀎濡??쒕늿??愿由ы븯怨??묒?濡??ㅼ슫濡쒕뱶?섏뿬 ?щ갑 諛??묒쑁 ?먮즺濡??쒖슜?섏꽭??</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="text-indigo-500 font-bold">02</span>
                        <div>
                          <strong className="text-sm text-gray-800 block mb-1">?밸퀎 ?듬룆 罹좏럹???⑦궎吏</strong>
                          <p className="text-xs text-gray-500 leading-relaxed">?ъ닚?? ?곕쭚?곗떆 ??二쇱젣蹂?罹좏럹?몄쓣 媛쒖꽕?섍퀬 ?ъ꽦?꾩뿉 ?곕Ⅸ ?먮룞 ?섎즺利?諛쒓툒 ?붾（?섏쓣 ?쒓났?⑸땲??</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="text-indigo-500 font-bold">03</span>
                        <div>
                          <strong className="text-sm text-gray-800 block mb-1">援먰쉶 ?꾩슜 釉뚮옖??諛?而ㅼ뒪?</strong>
                          <p className="text-xs text-gray-500 leading-relaxed">援먰쉶 濡쒓퀬 ?곸슜? 臾쇰줎, 二쇨컙 愿묎퀬? 留먯? ?붿빟???몄텧?섎뒗 ?꾩슜 而ㅻ??덊떚 ?섏씠吏瑜?援ъ꽦???쒕┰?덈떎.</p>
                        </div>
                      </li>
                    </ul>

                    <a
                      href="mailto:luxual8@gmail.com"
                      className="w-full flex items-center justify-center py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 group"
                    >
                      臾몄쓽?섍린 <span className="ml-2 group-hover:translate-x-1 transition-transform">??/span>
                    </a>
                  </div>
                )}
              </div>

              {/* Legal & Credits Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>媛쒖씤?뺣낫 泥섎━諛⑹묠</span>
                  <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                  <span>?댁슜?쎄?</span>
                </div>

                <div className="text-[11px] text-gray-400 leading-relaxed space-y-2 font-medium break-keep">
                  <p>諛붿씠釉붾줈洹몃뒗 ?꾩씠?붿? 鍮꾨?踰덊샇 ?몄쓽 媛쒖씤?뺣낫瑜??섏쭛?섏? ?딆뒿?덈떎.</p>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    <span>?щ룄?섎Т援먰쉶</span>
                    <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                    <span>Dev: ?댁쥌由?/span>
                    <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                    <a href="mailto:luxual8@gmail.com" className="text-indigo-400 underline decoration-indigo-200 hover:text-indigo-600">臾몄쓽 諛?媛쒖꽑</a>
                  </div>
                  <p className="opacity-70 mt-4">Copyright 짤 2026 <span className="font-extrabold text-gray-500">bibleLog.kr</span>. All rights reserved.</p>
                  <p className="italic text-gray-300 text-[10px] mt-2">"?뚯꽦 ?몄떇 ?뺥솗?꾨? ?꾪빐 議곗슜???섍꼍??沅뚯옣?⑸땲??</p>
                </div>
              </div>
            </div>
          </footer>
        )}
      </div>
    </>
  );
};

export default App;
