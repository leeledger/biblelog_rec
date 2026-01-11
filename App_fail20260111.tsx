import React, { useState, useEffect, useMemo, useRef } from 'react';
import { progressService } from './services/progressService';
import { BibleVerse, SessionReadingProgress, ReadingState, User, UserProgress, UserSessionRecord } from './types';
import { AVAILABLE_BOOKS, getVersesForSelection, getNextReadingStart, BOOK_ABBREVIATIONS_MAP, TOTAL_CHAPTERS_IN_BIBLE } from './constants';

import useSpeechRecognition from './hooks/useSpeechRecognition';
import * as authService from './services/authService'; 
import RecognitionDisplay from './components/RecognitionDisplay';
import ProgressBar from './components/ProgressBar';
import AuthForm from './components/AuthForm'; 
import ChapterSelector from './components/ChapterSelector'; 
import Leaderboard from './components/Leaderboard';
import BibleProgressOverview from './components/BibleProgressOverview'; 
import BookCompletionStatus from './components/BookCompletionStatus'; 
import HallOfFame from './components/HallOfFame';
import BrowserRecommendation from './components/BrowserRecommendation';
import { calculateSimilarity, containsDifficultWord } from './utils';
// import { BibleData, BibleBook, BibleChapter } from './types'; // Ensured this is commented out or removed
import rawBibleData from './bible_fixed.json';

// Define the type for the flat Bible data structure from bible_fixed.json
type RawBibleDataType = { [key: string]: string; };

// Make Bible data available globally in this module, cast to our correct local type
const bibleData: RawBibleDataType = rawBibleData as RawBibleDataType;

// Helper to normalize text for matching with improved number handling
const normalizeText = (text: string): string => {
  if (!text) return '';

  // 0. Remove null characters that may exist in the source data
  let normalized = text.replace(/\u0000/g, '');

  console.log('[App.tsx] Original text before normalization:', normalized);
  
  // ?Œì„± ?¸ì‹ ê²°ê³¼?ì„œ ?ì£¼ ë°œìƒ?˜ëŠ” ?¤ë¥˜ ?˜ì •
  let processed = normalized
    // ?«ì ?¸ì‹ ?¤ë¥˜ ?˜ì • (202??-> ?´ë°±?? 22??-> ?´ì‹­?´ìš”)
    .replace(/202\s*??g, "?´ë°±??)
    .replace(/202\s*??g, "?´ë°±??)
    .replace(/200\s*??g, "?´ë°±??)
    .replace(/200\s*??g, "?´ë°±??)
    .replace(/22\s*??g, "?´ì‹­?´ìš”")
    .replace(/22\s*??g, "?´ì‹­?´ìš”")
    .replace(/20\s*??g, "?´ì‹­??)
    .replace(/20\s*??g, "?´ì‹­??);
  
  // ?œê? ?«ìë¥??„ë¼ë¹„ì•„ ?«ìë¡?ë³€??  processed = processed
    // ?œê? ?«ì ?¨í„´ (?? ?? ?? ...) ë³€??    .replace(/??g, "1")
    .replace(/??g, "2")
    .replace(/??g, "3")
    .replace(/??g, "4")
    .replace(/??g, "5")
    .replace(/??g, "6")
    .replace(/ì¹?g, "7")
    .replace(/??g, "8")
    .replace(/êµ?g, "9")
    .replace(/??g, "10")
    .replace(/ë°?g, "100")
    .replace(/ì²?g, "1000")
    .replace(/ë§?g, "10000");
  
  // ?œê? ?«ì ë³µí•©??ì²˜ë¦¬ (?? ?´ë°±?´ì‹­ -> 220)
  processed = processed
    // ë°??¨ìœ„ ì²˜ë¦¬
    .replace(/(\d+)100(\d+)10(\d+)/g, (_, p1, p2, p3) => String(Number(p1) * 100 + Number(p2) * 10 + Number(p3)))
    .replace(/(\d+)100(\d+)/g, (_, p1, p2) => String(Number(p1) * 100 + Number(p2)))
    .replace(/(\d+)100/g, (_, p1) => String(Number(p1) * 100))
    // ???¨ìœ„ ì²˜ë¦¬
    .replace(/(\d+)10(\d+)/g, (_, p1, p2) => String(Number(p1) * 10 + Number(p2)))
    .replace(/(\d+)10/g, (_, p1) => String(Number(p1) * 10));
    
  console.log('[App.tsx] After number normalization:', processed);
    
  // ?ˆë“œë¡œì´??ê¸°ê¸°?ì„œ ì¶”ê? ì²˜ë¦¬
  if (/Android/.test(navigator.userAgent)) {
    // ?ˆë“œë¡œì´?œì—???«ì ?¸ì‹ ë¬¸ì œ ?´ê²°???„í•œ ì¶”ê? ì²˜ë¦¬
    processed = processed
      // ?«ì ?ë’¤ ê³µë°± ?œê±° (?ˆë“œë¡œì´???Œì„±?¸ì‹ ?¹ì„±)
      .replace(/(\d+)\s+??g, "$1??)
      .replace(/(\d+)\s+??g, "$1??)
      // ?«ì ?¬ì´ ê³µë°± ?œê±° (?? "2 3" -> "23")
      .replace(/(\d+)\s+(\d+)/g, "$1$2")
      // "?´ì‹­???? ?•íƒœ ì²˜ë¦¬
      .replace(/?´ì‹­(\d+)\s*??g, "2$1??)
      .replace(/?¼ì‹­(\d+)\s*??g, "3$1??)
      .replace(/?¬ì‹­(\d+)\s*??g, "4$1??)
      .replace(/?¤ì‹­(\d+)\s*??g, "5$1??)
      // "?´ì‹­???? ?•íƒœ ì²˜ë¦¬
      .replace(/?´ì‹­(\d+)\s*??g, "2$1??)
      .replace(/?¼ì‹­(\d+)\s*??g, "3$1??)
      .replace(/?¬ì‹­(\d+)\s*??g, "4$1??)
      .replace(/?¤ì‹­(\d+)\s*??g, "5$1??);
      
    console.log(`[App.tsx] Android specific processing for: "${text}" -> "${processed}"`);
  }
  
  return processed
    .toLowerCase()
    // eslint-disable-next-line no-irregular-whitespace
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()??€]/g, "") // remove punctuation, including full-width space
    .replace(/\s+/g, ""); // remove all whitespace
};

const FUZZY_MATCH_LOOKBACK_FACTOR = 1.3; // 1.8?ì„œ ?˜í–¥ ì¡°ì •. ?´ì „ ???ìŠ¤?¸ê? ë¹„êµ???¬í•¨?˜ëŠ” ê²ƒì„ ë°©ì? 

// ê¸°ë³¸(?ˆë“œë¡œì´???? ê¸°ê¸° ?¤ì •: ?½ê°„ ?ˆê·¸?½ê²Œ ?¤ì •?˜ì—¬ ë°œìŒ???´ë ¤???¨ì–´ ?¸ì‹ë¥?ê°œì„ 
const FUZZY_MATCH_SIMILARITY_THRESHOLD_DEFAULT = 55;
const MINIMUM_READ_LENGTH_RATIO_DEFAULT = 0.9;
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_DEFAULT = 5;

// iOS ê¸°ê¸° ?¤ì •: ???½ê¸° ?„ì— ?˜ì–´ê°€???„ìƒ??ë°©ì??˜ê¸° ?„í•´ ???„ê²©?˜ê²Œ ?¤ì •
const FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS = 50; // iOS ? ì‚¬??ê¸°ì? ?„í™” (65->50). ?¸ì‹ ?¤ë¥˜?????ˆê·¸?¬ì›Œì§?
const MINIMUM_READ_LENGTH_RATIO_IOS = 0.95;
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS = 2;

// iOS ê¸?êµ¬ì ˆ ?ê¹Œì§€ ?½ê¸° ê²€ì¦ìš© ?ìˆ˜
const LONG_VERSE_CHAR_COUNT = 30; // ??ê¸¸ì´ ?´ìƒ?´ë©´ 'ê¸?êµ¬ì ˆ'ë¡?ê°„ì£¼ 
const END_PORTION_LENGTH = 15;    // êµ¬ì ˆ??ë§ˆì?ë§?ëª?ê¸€?ë? ë¹„êµ? ì?

const initialSessionProgress: SessionReadingProgress = {
  totalVersesInSession: 0,
  sessionCompletedVersesCount: 0,
  sessionInitialSkipCount: 0,
};

type ViewState = 'IDLE_SETUP' | 'LEADERBOARD';

const App: React.FC = () => {
  // ?Œë«??ê°ì? ë¡œì§
  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);

  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [isRestartingForNextVerseOnIOS, setIsRestartingForNextVerseOnIOS] = useState(false);
  const [bibleResetLoading, setBibleResetLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userOverallProgress, setUserOverallProgress] = useState<UserProgress | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('IDLE_SETUP');
  const [sessionCount, setSessionCount] = useState(0); // Key for re-mounting components
  
  const [sessionTargetVerses, setSessionTargetVerses] = useState<BibleVerse[]>([]); // Verses for the current reading session
  const [currentVerseIndexInSession, setCurrentVerseIndexInSession] = useState(0); // Index within sessionTargetVerses
  
  // ?„ë©˜ ?¨ìŠ¤??ê¸°ëŠ¥ ê´€???íƒœ
  const [verseStartTime, setVerseStartTime] = useState<number | null>(null);
  const [showAmenPrompt, setShowAmenPrompt] = useState(false);
  const [verseTimeoutId, setVerseTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [hasDifficultWords, setHasDifficultWords] = useState(false);
  
  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [matchedVersesContentForSession, setMatchedVersesContentForSession] = useState<string>(''); // Accumulated for current session display
  const [isRetryingVerse, setIsRetryingVerse] = useState(false);
  const [readingState, setReadingState] = useState<ReadingState>(ReadingState.IDLE);

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
    return (
    <>
      <BrowserRecommendation />) => {
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

  // Overall Bible Progress Effect (for initialization, total chapters, and FULL user progress)
  useEffect(() => {
    console.log('[Overall Progress Effect - Revised] Triggered. currentUser:', currentUser ? currentUser.username : 'null');
    
    const fetchAndSetFullProgress = async () => {
      if (currentUser && currentUser.username) {
        console.log('[Overall Progress Effect - Revised] User found. Fetching full progress for:', currentUser.username);
        setTotalBibleChapters(TOTAL_CHAPTERS_IN_BIBLE); // Using imported constant
        try {
          const progressData = await progressService.loadUserProgress(currentUser.username);
          console.log(`[Overall Progress Effect - Revised] Fetched progressData. Raw: ${JSON.stringify(progressData)}. Completed chapters count: ${progressData?.completedChapters?.length ?? 'N/A'}`);
          setUserOverallProgress(progressData);
          console.log('[Overall Progress Effect - Revised] setUserOverallProgress CALLED. Data passed:', progressData ? 'object' : String(progressData));
          setOverallCompletedChaptersCount(progressData?.completedChapters?.length || 0);
        } catch (error) {
          console.error('[Overall Progress Effect - Revised] Error fetching full user progress:', error);
          setUserOverallProgress(null);
          setOverallCompletedChaptersCount(0);
        }
      } else {
        console.log('[Overall Progress Effect - Revised] No currentUser, resetting progress states.');
        setUserOverallProgress(null);
        setOverallCompletedChaptersCount(0);
        setTotalBibleChapters(0); 
      }
    };

    fetchAndSetFullProgress();

    // Handle password change prompt visibility
    if (currentUser && currentUser.must_change_password) {
      setShowPasswordChangePrompt(true);
    } else {
      setShowPasswordChangePrompt(false);
    }
  }, [currentUser]);

  // Effect to handle retrying a verse after STT has fully stopped
  useEffect(() => {
    if (isRetryingVerse && !isListening) {
      startListening();
      setIsRetryingVerse(false);
    }
  }, [isRetryingVerse, isListening, startListening]);

  // Authentication Effect (runs once on mount)
  useEffect(() => {
    console.log('[AuthEffect - Revised] Running on mount.');
    const user = authService.getCurrentUser();
    if (user) {
      console.log('[AuthEffect - Revised] User found in authService. Setting currentUser:', user.username);
      setCurrentUser(user);
      // The useEffect dependent on 'currentUser' (Overall Progress Effect - Revised) 
      // will now handle loading the progress.
    } else {
      console.log('[AuthEffect - Revised] No user found in authService on mount.');
    }
  }, []); // Empty dependency array - runs once on mount

  // Effect to set default values for ChapterSelector based on user progress
  useEffect(() => {
    console.log('[ChapterSelectorDefaultsEffect] Triggered. currentUser:', currentUser ? currentUser.username : 'null', 'userOverallProgress:', userOverallProgress ? 'exists' : 'null');
    if (currentUser && userOverallProgress) {
      const lastReadInfo = userOverallProgress && userOverallProgress.lastReadBook && userOverallProgress.lastReadChapter && userOverallProgress.lastReadVerse
        ? { book: userOverallProgress.lastReadBook, chapter: userOverallProgress.lastReadChapter, verse: userOverallProgress.lastReadVerse }
        : null;
      const nextRead = getNextReadingStart(lastReadInfo);
      if (nextRead) {
        console.log('[ChapterSelectorDefaultsEffect] User has progress. Next read:', nextRead);
        setSelectedBookForSelector(nextRead.book);
        setStartChapterForSelector(nextRead.chapter);
        setEndChapterForSelector(nextRead.chapter); // For "continue reading", start and end chapter are the same
        setStartVerseForSelector(nextRead.verse);
      } else {
        // End of Bible or no specific next read, default to first book/chapter
        console.log('[ChapterSelectorDefaultsEffect] User has progress, but no specific nextRead. Defaulting.');
        const firstBook = AVAILABLE_BOOKS[0];
        if (firstBook) {
          setSelectedBookForSelector(firstBook.name);
          setStartChapterForSelector(1);
          setEndChapterForSelector(1);
          setStartVerseForSelector(1);
        }
      }
    } else {
      // No user logged in or no progress, default to Genesis 1 or first available book
      console.log('[ChapterSelectorDefaultsEffect] No user or no progress. Defaulting.');
      const firstBook = AVAILABLE_BOOKS[0];
      if (firstBook) {
        setSelectedBookForSelector(firstBook.name);
        setStartChapterForSelector(1);
        setEndChapterForSelector(1);
        setStartVerseForSelector(1);
      }
    }
  }, [userOverallProgress, currentUser]);

  useEffect(() => {
    console.log('[App.tsx userOverallProgress Monitor useEffect] userOverallProgress CHANGED to:', userOverallProgress ? 'set with ' + (userOverallProgress.completedChapters?.length || 0) + ' completed chapters' : 'null', userOverallProgress?.completedChapters ? JSON.stringify(userOverallProgress.completedChapters) : '');
  }, [userOverallProgress]);

  const handleRegister = async (username: string, password_provided: string): Promise<{ success: boolean; message: string; user?: User }> => {
    console.log(`App.tsx handleRegister called for ${username}`);
    const result = await authService.registerUser(username, password_provided);
    if (result.success) {
      // Optionally, you could auto-login the user here or prompt them to login
      setAppError(null); // Clear any previous login errors
    } else {
      setAppError(result.message || "Registration failed from App.tsx");
    }
    return result; // Return the full result object to AuthForm
  };

  const handlePasswordChangeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordChangeError(''); // Clear previous errors
    setPasswordChangeSuccess('');

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('??ë¹„ë?ë²ˆí˜¸ê°€ ?¼ì¹˜?˜ì? ?ŠìŠµ?ˆë‹¤.');
      return;
    }
    if (newPassword.length < 4) { // Basic validation, align with backend if different
      setPasswordChangeError('ë¹„ë?ë²ˆí˜¸??ìµœì†Œ 4???´ìƒ?´ì–´???©ë‹ˆ??');
      return;
    }
    if (newPassword === '1234') {
      setPasswordChangeError('??ë¹„ë?ë²ˆí˜¸??ê¸°ë³¸ ë¹„ë?ë²ˆí˜¸?€ ?¤ë¥´ê²??¤ì •?´ì•¼ ?©ë‹ˆ??');
      return;
    }

    if (!currentUser) {
      setPasswordChangeError('?¬ìš©???•ë³´ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤. ?¤ì‹œ ë¡œê·¸?¸í•´ì£¼ì„¸??');
      return;
    }

    if (typeof currentUser.id !== 'number') {
      setPasswordChangeError('?¬ìš©??IDê°€ ? íš¨?˜ì? ?ŠìŠµ?ˆë‹¤. ?¤ì‹œ ë¡œê·¸?¸í•´ì£¼ì„¸??');
      return;
    }

    try {
      const result = await authService.changePassword(currentUser.id, newPassword);
      if (result && result.user) {
        setPasswordChangeSuccess('ë¹„ë?ë²ˆí˜¸ê°€ ?±ê³µ?ìœ¼ë¡?ë³€ê²½ë˜?ˆìŠµ?ˆë‹¤! ?´ì œ ???Œë¦¼?€ ?«ìœ¼?”ë„ ?©ë‹ˆ??');
        setCurrentUser({ ...currentUser, ...result.user, must_change_password: false }); // Update user state from backend response
        setShowPasswordChangePrompt(false); // Hide the prompt/form on success
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordChangeError(result?.message || 'ë¹„ë?ë²ˆí˜¸ ë³€ê²½ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤. ?œë²„ ?‘ë‹µ???•ì¸?´ì£¼?¸ìš”.');
      }
    } catch (error) {
      console.error('Password change failed:', error);
      setPasswordChangeError('ë¹„ë?ë²ˆí˜¸ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤. ?¤íŠ¸?Œí¬ ?°ê²° ?ëŠ” ?œë²„ ?íƒœë¥??•ì¸?´ì£¼?¸ìš”.');
    }
  };

  const handleAuth = async (username: string, password_provided: string): Promise<boolean> => {
    const user = await authService.loginUser(username, password_provided);
    if (user) {
      setCurrentUser(user);
      setShowPasswordChangePrompt(user.must_change_password === true);
      setAppError(null);
      return true;
    } else {
      setAppError('ë¹„ë?ë²ˆí˜¸ë¥??•ì¸?˜ì„¸??');
      return false;
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

  const currentTargetVerseForSession = useMemo(() => {
    if (currentVerseIndexInSession < sessionTargetVerses.length) {
      return sessionTargetVerses[currentVerseIndexInSession];
    }
    return null;
  }, [currentVerseIndexInSession, sessionTargetVerses]);

  useEffect(() => {
    // Always update transcriptBuffer with the latest sttTranscript,
    // including when sttTranscript becomes empty after a reset.
    setTranscriptBuffer(sttTranscript);
    
    // ?½ê¸° ?íƒœê°€ ?„ë‹ˆê±°ë‚˜ ?„ë©˜ ?„ë¡¬?„íŠ¸ê°€ ?œì‹œ?˜ì? ?Šì? ê²½ìš° ì²´í¬?˜ì? ?ŠìŒ
    if (readingState !== ReadingState.LISTENING || !showAmenPrompt) return;
    
    // "?„ë©˜" ê°ì? ë¡œì§
    const normalizedTranscript = normalizeText(sttTranscript.toLowerCase());
    if (normalizedTranscript.includes('?„ë©˜')) {
      console.log('[App.tsx] ?„ë©˜ ?¨ì–´ ê°ì???');
      handleVerseSkip();
    }
  }, [sttTranscript, showAmenPrompt, readingState]);
  
  useEffect(() => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) {
      return;
    }
    
    // ?¬ìš©?ê? "?„ë©˜"??ë§í•˜ë©??¤ìŒ êµ¬ì ˆë¡??˜ì–´ê°€ê¸?(?´ë ¤??êµ¬ì ˆ?ì„œë§??‘ë™)
    if (showAmenPrompt && hasDifficultWords && transcriptBuffer) {
      const normalizedTranscript = normalizeText(transcriptBuffer.toLowerCase());
      if (normalizedTranscript.includes('?„ë©˜')) {
        console.log('[App.tsx] ?„ë©˜ ?¨ìŠ¤??ê°ì???- ?¤ìŒ êµ¬ì ˆë¡??´ë™?©ë‹ˆ??);
        
        // ?„ë©˜ ?„ë¡¬?„íŠ¸ ?¨ê¸°ê¸?        setShowAmenPrompt(false);
        
        // ?€?´ë¨¸ ?œê±°
        if (verseTimeoutId) {
          clearTimeout(verseTimeoutId);
          setVerseTimeoutId(null);
        }
        
        // ?¤ìŒ êµ¬ì ˆë¡??´ë™
        setTimeout(() => {
          setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text} [?„ë©˜ ?¨ìŠ¤???¬ìš©]\n`);
          setTranscriptBuffer('');
          setTimeout(() => {
            resetTranscript();
          }, 50);
          
          // ë§ˆì?ë§?êµ¬ì ˆ?¸ì? ?•ì¸
          if (currentVerseIndexInSession < sessionTargetVerses.length - 1) {
            setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
          } else {
            // ?¸ì…˜ ?„ë£Œ
            handleStopReadingAndSave();
          }
        }, isIOS ? 500 : 0);
        
        return;
      }
    }
    
    if (transcriptBuffer.length === 0) {
      return;
    }

    const normalizedTargetVerseText = normalizeText(currentTargetVerseForSession.text);
    const normalizedBuffer = normalizeText(transcriptBuffer);

    if (normalizedTargetVerseText.length === 0) return;

    const lookbackWindowSize = Math.floor(normalizedTargetVerseText.length * FUZZY_MATCH_LOOKBACK_FACTOR);
    const bufferPortionToCompare = normalizedBuffer.substring(
      Math.max(0, normalizedBuffer.length - lookbackWindowSize)
    );

    // ?Œë«?¼ë³„ ê¸°ì?ê°?? íƒ
    const similarityThreshold = isIOS ? FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS : FUZZY_MATCH_SIMILARITY_THRESHOLD_DEFAULT;
    const minLengthRatio = isIOS ? MINIMUM_READ_LENGTH_RATIO_IOS : MINIMUM_READ_LENGTH_RATIO_DEFAULT;
    const absDiffThreshold = isIOS ? ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS : ABSOLUTE_READ_DIFFERENCE_THRESHOLD_DEFAULT;

    const similarity = calculateSimilarity(normalizedTargetVerseText, bufferPortionToCompare);

    // ë§¤ì¹­ ?±ê³µ ?œì—ë§??¤ìŒ ?ˆë¡œ ì§„í–‰
    const isLengthSufficientByRatio = bufferPortionToCompare.length >= normalizedTargetVerseText.length * minLengthRatio;
    const isLengthSufficientByAbsoluteDiff = (normalizedTargetVerseText.length - bufferPortionToCompare.length) <= absDiffThreshold && bufferPortionToCompare.length > 0;

    const platform = isIOS ? 'iOS' : 'Default';
    console.log(`[App.tsx] [${platform}] Matching Details - Sim: ${similarity.toFixed(1)} (>${similarityThreshold}), LenRatio: ${isLengthSufficientByRatio}, AbsDiff: ${isLengthSufficientByAbsoluteDiff}`);
    console.log(`[App.tsx] Comparing Buffer: \"${bufferPortionToCompare}\" with Target: \"${normalizedTargetVerseText}\"`);

    // êµ¬ì ˆ ?„ì²´???´ë ¤???¨ì–´ê°€ ?¬í•¨?˜ì–´ ?ˆëŠ”ì§€ ?•ì¸
    const verseHasDifficultWord = containsDifficultWord(normalizedTargetVerseText);
    
    // ?´ë ¤???¨ì–´ê°€ ?¬í•¨??êµ¬ì ˆ?€ ? ì‚¬??ê¸°ì???????¶”??ì£¼ê¸° (?¹íˆ ?¸ë˜?´ê? ë§ì? êµ¬ì ˆ)
    // ? ì‚¬??ê¸°ì???20% ??¶°??30% ?•ë„ë§??˜ì–´???µê³¼?????ˆê²Œ ??    const adjustedSimilarityThreshold = verseHasDifficultWord ? (similarityThreshold - 20) : similarityThreshold;
    
    if (verseHasDifficultWord) {
      console.log(`[App.tsx] Verse contains difficult word(s). Lowering similarity threshold to ${adjustedSimilarityThreshold}.`);
    }
    
    let isMatch = similarity >= adjustedSimilarityThreshold && (isLengthSufficientByRatio || isLengthSufficientByAbsoluteDiff);

    // iOS ê¸?êµ¬ì ˆ???€??ì¶”ê? ê²€ì¦?ë¡œì§
    if (isIOS && isMatch && normalizedTargetVerseText.length > LONG_VERSE_CHAR_COUNT) {
      const targetEnd = normalizedTargetVerseText.slice(-END_PORTION_LENGTH);
      const bufferEnd = bufferPortionToCompare.slice(-END_PORTION_LENGTH);
      const endSimilarity = calculateSimilarity(targetEnd, bufferEnd);

      console.log(`[App.tsx] [iOS Long Verse] End-portion check. Similarity: ${endSimilarity.toFixed(1)}`);

      if (endSimilarity < 60) { // ?ë?ë¶?? ì‚¬?„ê? 60 ë¯¸ë§Œ?´ë©´, ?„ì§ ???ˆì½?€ ê²ƒìœ¼ë¡?ê°„ì£¼
        // ?? ?ë?ë¶„ì— ë°œìŒ???´ë ¤???¨ì–´ê°€ ?¬í•¨??ê²½ìš°???ˆì™¸?ìœ¼ë¡??µê³¼?œì¼œì¤€??
        const endPortionHasDifficultWord = containsDifficultWord(targetEnd);

        if (endPortionHasDifficultWord) {
          console.log(`[App.tsx] iOS Long Verse Check: OVERRIDE. End portion contains difficult word. Allowing match despite low end similarity (${endSimilarity.toFixed(1)}).`);
        } else {
          isMatch = false;
          console.log(`[App.tsx] iOS Long Verse Check: FAIL. End similarity ${endSimilarity.toFixed(1)} is below threshold and no difficult words found.`);
        }
      } else {
        console.log(`[App.tsx] iOS Long Verse Check: PASS. End similarity is ${endSimilarity.toFixed(1)}.`);
      }
    }

    if (isMatch) {
      console.log(`[App.tsx] Verse matched! Index: ${currentVerseIndexInSession}, Target length: ${sessionTargetVerses.length}`);
      
      // iOS?ì„œ??êµ¬ì ˆ ?„í™˜ ???œë ˆ?´ë? ?ìš©?˜ì—¬ ?¬ìš©?ê? êµ¬ì ˆ?????½d???œê°„??ì£¼ê³  ?´ì „ êµ¬ì ˆ???¸ì‹ ê²°ê³¼ê°€ ???•ë¦¬?˜ë„ë¡???      const transitionDelay = isIOS ? 600 : 0; // iOS?ì„œ??1ì´??œë ˆ?´ë¡œ ì¦ê? (0.5ì´ˆâ†’1ì´?
      
      if (isIOS) {
        console.log('[App.tsx] iOS detected - adding 1.0 second delay before verse transition');
      }
      
      setTimeout(() => {
        setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text}\n`);
        
        // êµ¬ì ˆ ?¼ì¹˜ ???Œì„± ?¸ì‹ ?ìŠ¤??ì´ˆê¸°??(?¹íˆ iOS?ì„œ ?´ì „ ?¸ì‹ ê²°ê³¼ê°€ ?¨ëŠ” ë¬¸ì œ ?´ê²°)
        console.log('[App.tsx] Starting transcript reset process after verse match');
        setTranscriptBuffer('');
        
        // iOS?ì„œ????ì² ì???ì´ˆê¸°?”ë? ?„í•´ ?Œì„±?¸ì‹ ì¤‘ì? ???¬ì‹œ??        if (isIOS && isListening) {
          console.log('[App.tsx] iOS - Stopping and restarting speech recognition for thorough reset');
          stopListening();
          
          // ?Œì„±?¸ì‹ ê´€??ëª¨ë“  ?íƒœ ì°¸ì¡°ë¥?ëª…ì‹œ?ìœ¼ë¡?ì´ˆê¸°??          if (markVerseTransition) {
            console.log('[App.tsx] iOS - Marking verse transition to reset internal buffers');
            markVerseTransition();
          }
        }
        // ?Œì„± ?¸ì‹ ì´ˆê¸°?”ë? ?„í•´ ?½ê°„??ì§€????resetTranscript ?¸ì¶œ
        // ?´ëŠ” ?„ì¬ ì§„í–‰ ì¤‘ì¸ ?¸ì‹ ì²˜ë¦¬ê°€ ?„ë£Œ?˜ê³  ?¤ìŒ êµ¬ì ˆ??ì¤€ë¹„í•  ?œê°„??ì£¼ê¸° ?„í•¨
        setTimeout(() => {
          resetTranscript();
          console.log('[App.tsx] Forced transcript reset after verse match');
          
          // iOS ?Œì„±?¸ì‹ ?¬ì‹œ??- ?„ì „ ì´ˆê¸°?????ˆë¡œ???íƒœë¡??œì‘
          if (isIOS && !isListening) {
            console.log('[App.tsx] iOS - Restarting speech recognition with clean state');
            setTimeout(() => {
              startListening();
              console.log('[App.tsx] iOS - Speech recognition restarted after verse transition');
            }, 150); // ?¸ëœ?¤í¬ë¦½íŠ¸ ë¦¬ì…‹ ???½ê°„??ì¶”ê? ì§€??          }
        }, 100); // ì§€???œê°„ ì¦ê? (50ms ??100ms)
      }, transitionDelay);
      
      const newTotalCompletedInSelection = currentVerseIndexInSession + 1; // Count from start of selection array
      
      let fullyCompletedChaptersInSession = 0;
      const chaptersEncountered = new Set<string>();
      for(let i = 0; i < newTotalCompletedInSelection; i++) {
        const verse = sessionTargetVerses[i];
        const chapterKey = `${verse.book}-${verse.chapter}`;
        chaptersEncountered.add(chapterKey);
      }
      setSessionProgress(prev => ({
        ...prev,
        sessionCompletedVersesCount: newTotalCompletedInSelection,
      }));

      // We check against the current index. If it's the last one, the session is complete.
      if (currentVerseIndexInSession >= sessionTargetVerses.length - 1) { 
        setReadingState(ReadingState.SESSION_COMPLETED);
        stopListening();
        resetTranscript(); 
        setTranscriptBuffer(''); 

        const firstVerseActuallyReadInSession = sessionTargetVerses[sessionProgress.sessionInitialSkipCount] || sessionTargetVerses[0];
        const lastVerseOfSession = sessionTargetVerses[sessionTargetVerses.length - 1];
        const versesReadCountThisSession = sessionTargetVerses.length - sessionProgress.sessionInitialSkipCount;

        const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}??${firstVerseActuallyReadInSession.verse}??~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}??${lastVerseOfSession.verse}??(ì´?${versesReadCountThisSession}?? ?½ê¸° ?„ë£Œ!`;
        setSessionCertificationMessage(certMsg);
        setAppError(null);
        
        if (currentUser && versesReadCountThisSession > 0) {
            const historyEntry: UserSessionRecord = {
                date: new Date().toISOString(),
                book: firstVerseActuallyReadInSession.book,
                startChapter: firstVerseActuallyReadInSession.chapter,
                startVerse: firstVerseActuallyReadInSession.verse,
                endChapter: lastVerseOfSession.chapter,
                endVerse: lastVerseOfSession.verse,
                versesRead: versesReadCountThisSession
            };
            const newOverallProgress: UserProgress = {
                lastReadBook: lastVerseOfSession.book,
                lastReadChapter: lastVerseOfSession.chapter,
                lastReadVerse: lastVerseOfSession.verse,
                totalSkips: userOverallProgress?.totalSkips || sessionProgress.sessionInitialSkipCount,
                history: userOverallProgress?.history ? [...userOverallProgress.history, historyEntry] : [historyEntry]
            };
            // Calculate newly completed chapters from this session
            const actuallyReadVersesInSession = sessionTargetVerses.slice(sessionProgress.sessionInitialSkipCount);
            const uniqueChaptersTargeted = [...new Set(actuallyReadVersesInSession.map(v => `${v.book}:${v.chapter}`))];            
            const chaptersToMarkAsComplete = uniqueChaptersTargeted.filter(chapterKey => {
                const [book, chapterStr] = chapterKey.split(':');
                const chapter = parseInt(chapterStr, 10);
                
                // ?´ë‹¹ ?¥ì˜ ë§ˆì?ë§??ˆì„ ì°¾ìŠµ?ˆë‹¤
                const bookInfo = AVAILABLE_BOOKS.find(b => b.name === book);
                if (!bookInfo) return false;
                
                // ?´ë‹¹ ?¥ì˜ ë§ˆì?ë§???ë²ˆí˜¸ë¥?ê°€?¸ì˜µ?ˆë‹¤
                const lastVerseNumber = bookInfo.versesPerChapter[chapter - 1] || 0;
                
                // ???¸ì…˜?ì„œ ?½ì? ?ˆë“¤ ì¤‘ì— ?´ë‹¹ ?¥ì˜ ë§ˆì?ë§??ˆì´ ?ˆëŠ”ì§€ ?•ì¸?©ë‹ˆ??                return actuallyReadVersesInSession.some(readVerse => 
                    readVerse.book === book && 
                    readVerse.chapter === chapter &&
                    readVerse.verse === lastVerseNumber
                );
            });
            
            // Merge with existing completed chapters
            const existingCompletedSet = new Set(userOverallProgress?.completedChapters || []);
            chaptersToMarkAsComplete.forEach(chKey => existingCompletedSet.add(chKey));
            const updatedCompletedChapters = Array.from(existingCompletedSet);

            const updatedUserProgress: UserProgress = {
              ...newOverallProgress, // This already has lastRead and history updated
              completedChapters: updatedCompletedChapters,
            };

            console.log('[App.tsx] Preparing to save user progress. Full data:', JSON.stringify(updatedUserProgress, null, 2));
            progressService.saveUserProgress(currentUser.username, updatedUserProgress)
              .then(() => {
                console.log('[App.tsx] Successfully saved updated user progress.');
                setUserOverallProgress(updatedUserProgress);
                setOverallCompletedChaptersCount(updatedUserProgress.completedChapters?.length || 0);
              })
              .catch(error => {
                console.error('[App.tsx] Error saving updated user progress:', error);
              });
        } // This closes: if (currentUser && versesReadCountThisSession > 0)
      } else { // This is the 'else' for: if (newTotalCompletedInSelection >= sessionTargetVerses.length)
         // ?ë™ ?€??ê¸°ëŠ¥ ì¶”ê?: ???ˆì„ ?„ë£Œ???Œë§ˆ??ì§„í–‰ ?í™© ?€??         if (currentUser && userOverallProgress) {
           // ?„ì¬ê¹Œì? ?½ì? ???•ë³´ ?€??           const lastCompletedVerse = sessionTargetVerses[currentVerseIndexInSession];
           
           // ì§„í–‰ ?í™© ?…ë°?´íŠ¸
           const updatedProgress: UserProgress = {
             ...userOverallProgress,
             lastReadBook: lastCompletedVerse.book,
             lastReadChapter: lastCompletedVerse.chapter,
             lastReadVerse: lastCompletedVerse.verse
           };
           
           // ?œë²„???€??           console.log('[App.tsx] Auto-saving progress after completing verse:', 
             `${lastCompletedVerse.book} ${lastCompletedVerse.chapter}:${lastCompletedVerse.verse}`);
           progressService.saveUserProgress(currentUser.username, updatedProgress)
             .then(() => {
               // ë¡œì»¬ ?íƒœ ?…ë°?´íŠ¸
               setUserOverallProgress(updatedProgress);
             })
             .catch(err => {
               console.error('[App.tsx] Error auto-saving progress:', err);
             });
         }
                  // ?¤ìŒ ?ˆë¡œ ?´ë™ ë°??Œì„± ?¸ì‹ ì´ˆê¸°?”ë? ë¨¼ì? ?˜í–‰ (?°ì´?°ë² ?´ìŠ¤ ?…ë°?´íŠ¸?€ ?…ë¦½?ìœ¼ë¡?ì§„í–‰)
          console.log('[App.tsx] Moving to next verse and resetting recognition BEFORE database update completes');
          setCurrentVerseIndexInSession(prevIdx => prevIdx + 1); // ?¤ìŒ ?ˆë¡œ ?´ë™
          
          // ?Œì„± ?¸ì‹ ì´ˆê¸°?”ë? ?°ì´?°ë² ?´ìŠ¤ ?…ë°?´íŠ¸ë³´ë‹¤ ë¨¼ì? ?¤í–‰
          // ?´ëŠ” ?„ì¬ ì§„í–‰ ì¤‘ì¸ ?¸ì‹ ì²˜ë¦¬ê°€ ?„ë£Œ?˜ê³  ?¤ìŒ êµ¬ì ˆ??ì¤€ë¹„í•  ?œê°„??ì£¼ê¸° ?„í•¨
          setTranscriptBuffer(''); // Clear buffer for next verse
          
          // iOS?€ ?¼ë°˜ ê¸°ê¸°???€??ì´ˆê¸°??ë¡œì§ ê°œì„ 
          // ?Œì„± ?¸ì‹ ì´ˆê¸°?”ë? ?„í•œ ???•ì‹¤??ë°©ë²• ?¬ìš©
          console.log('[App.tsx] Forcing recognition reset for next verse');
          resetTranscript(); // ?¸ëœ?¤í¬ë¦½íŠ¸ ì´ˆê¸°??(ê°œì„ ??resetTranscript ?¨ìˆ˜ ?¬ìš©)
          
          // iOS?ì„œ??ì¶”ê??ì¸ ì¡°ì¹˜ ?„ìš”
          if (isIOS) {
            console.log('[App.tsx] iOS - Additional reset measures for next verse');
            // ? ì‹œ ???¤ì‹œ ?œì‘?˜ëŠ” ë©”ì»¤?ˆì¦˜ ?¬ìš©
            setTimeout(() => {
              stopListening(); // ?Œì„± ?¸ì‹ ì¤‘ì?
              setIsRetryingVerse(true); // ???Œë˜ê·¸ê? useEffect?ì„œ ë§ˆì´?¬ë? ?¤ì‹œ ì¼????ˆë„ë¡???            }, 100);
          }
      }
    }
    // ë§¤ì¹­ ?¤íŒ¨ ???¸ë±??ì¦ê?/?¸ì…˜ ì¢…ë£Œ ?†ìŒ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptBuffer, readingState, currentTargetVerseForSession, currentUser, sessionTargetVerses, userOverallProgress]);

  useEffect(() => {
    if (sttError) {
      setAppError(`?Œì„±?¸ì‹ ?¤ë¥˜: ${sttError}`);
      // Consider stopping listening here or letting the user retry.
      // stopListening(); // Potentially stop if error is critical
    }
  }, [sttError]);

  useEffect(() => {
    if (readingState === ReadingState.LISTENING && browserSupportsSpeechRecognition) {
      startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingState]);

  const handleSelectChaptersAndStartReading = (book: string, startCh: number, endCh: number) => {
    const verses = getVersesForSelection(book, startCh, endCh);
    if (verses.length > 0) {
      let initialSkip = 0;
      // Check if this is a "continue reading" session for the recommended chapter
      if (
        book === selectedBookForSelector &&
        startCh === startChapterForSelector &&
        endCh === startChapterForSelector && // Continue reading is always a single chapter
        startVerseForSelector > 1
      ) {
        // Find the index of the first verse to read.
        // The verse number is 1-based, array index is 0-based.
        const firstVerseIndex = verses.findIndex(v => v.verse === startVerseForSelector);
        if (firstVerseIndex !== -1) {
          initialSkip = firstVerseIndex;
        }
      }

      // Reset session-related states before starting
      setSessionTargetVerses(verses);
      setReadingState(ReadingState.READING);
      setCurrentVerseIndexInSession(initialSkip); // Start from the correct verse
      setMatchedVersesContentForSession('');
      setTranscriptBuffer('');
      resetTranscript();
      setSessionProgress({
        totalVersesInSession: verses.length,
        sessionCompletedVersesCount: initialSkip, // Pre-mark skipped verses as "completed" for progress bar
        sessionInitialSkipCount: initialSkip,
      });
      setSessionCertificationMessage(""); // Clear previous certification message
      setAppError(null); // Clear previous errors
    } else {
      setAppError('? íƒ??ë²”ìœ„???€???±ê²½ ?°ì´?°ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.');
    }
  };

  const handleStopReadingAndSave = () => {
    stopListening(); 
    
    // sessionProgress.sessionCompletedVersesCount is the total count of verses "done" from start of sessionTargetVerses
    // sessionProgress.sessionInitialSkipCount is how many were skipped at the start
    const versesActuallyReadThisSessionCount = sessionProgress.sessionCompletedVersesCount - sessionProgress.sessionInitialSkipCount;
    
    let firstEffectivelyReadVerse: BibleVerse | null = null;
    if (versesActuallyReadThisSessionCount > 0 && sessionTargetVerses.length > sessionProgress.sessionInitialSkipCount) {
        firstEffectivelyReadVerse = sessionTargetVerses[sessionProgress.sessionInitialSkipCount];
    }
    
    let lastEffectivelyReadVerse: BibleVerse | null = null;
    if (versesActuallyReadThisSessionCount > 0 && sessionProgress.sessionCompletedVersesCount > 0) {
        lastEffectivelyReadVerse = sessionTargetVerses[sessionProgress.sessionCompletedVersesCount - 1];
    }


    if (currentUser && lastEffectivelyReadVerse && firstEffectivelyReadVerse && versesActuallyReadThisSessionCount > 0) {
      const certMsg = `${firstEffectivelyReadVerse.book} ${firstEffectivelyReadVerse.chapter}??${firstEffectivelyReadVerse.verse}??~ ${lastEffectivelyReadVerse.book} ${lastEffectivelyReadVerse.chapter}??${lastEffectivelyReadVerse.verse}??(ì´?${versesActuallyReadThisSessionCount}?? ?½ìŒ (?¸ì…˜ ì¤‘ì?).`;
      setSessionCertificationMessage(certMsg);

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

    // Determine newly completed chapters in this session
    const versesReadInSession = sessionTargetVerses.slice(
      sessionProgress.sessionInitialSkipCount,
      sessionProgress.sessionCompletedVersesCount
    );

    const chaptersTouchedInSession: { [key: string]: { count: number, book: string, chapterNum: number } } = {};

    for (const verse of versesReadInSession) {
      const chapterKey = `${verse.book}:${verse.chapter}`;
      if (!chaptersTouchedInSession[chapterKey]) {
        chaptersTouchedInSession[chapterKey] = { count: 0, book: verse.book, chapterNum: verse.chapter };
      }
      chaptersTouchedInSession[chapterKey].count++;
    }

    for (const chapterKeyFromSession in chaptersTouchedInSession) {
      const { book, chapterNum } = chaptersTouchedInSession[chapterKeyFromSession];

      // Find the abbreviation for the book, which is used as the key in bibleData
      const bookAbbr = Object.keys(BOOK_ABBREVIATIONS_MAP).find(key => BOOK_ABBREVIATIONS_MAP[key] === book);

      if (!bookAbbr) {
        console.error(`Could not find abbreviation for book: ${book}`);
        continue; // Skip to the next chapter if no abbreviation found
      }

      // Get all canonical verses for this chapter from the flat bibleData
      const canonicalVersesForChapter: BibleVerse[] = [];
      for (const bibleKey in bibleData) {
        const parts = bibleKey.match(/^(\D+)(\d+):(\d+)$/); // e.g., "ì°?:1" -> "ì°?, "1", "1"
        if (parts && parts[1] === bookAbbr && parseInt(parts[2], 10) === chapterNum) {
          canonicalVersesForChapter.push({
            book: book, // Use the original full book name for matching against sessionTargetVerses
            chapter: parseInt(parts[2], 10),
            verse: parseInt(parts[3], 10),
            text: bibleData[bibleKey]
          });
        }
      }

      if (canonicalVersesForChapter.length > 0) {
        // Check if all canonical verses of this chapter were part of the session's target and were read/skipped.
        let allCanonicalChapterVersesReadOrSkipped = true;
        for (const canonicalVerse of canonicalVersesForChapter) {
          const indexInSessionTarget = sessionTargetVerses.findIndex(
            sv => sv.book === canonicalVerse.book && 
                  sv.chapter === canonicalVerse.chapter && 
                  sv.verse === canonicalVerse.verse
          );

          if (indexInSessionTarget === -1) {
            // A canonical verse of this chapter was not even targeted in the session.
            allCanonicalChapterVersesReadOrSkipped = false;
            break;
          }

          // Check if this targeted verse (at indexInSessionTarget) was covered by the session's progress.
          if (indexInSessionTarget >= sessionProgress.sessionCompletedVersesCount) {
            allCanonicalChapterVersesReadOrSkipped = false;
            break;
          }
        }

        if (allCanonicalChapterVersesReadOrSkipped) {
          newCompletedChaptersInSession.add(chapterKeyFromSession); // Use the original chapterKey e.g. "BookName:ChapterNum"
        }
      }
    }

    const newOverallProgress: UserProgress = {
        lastReadBook: lastEffectivelyReadVerse.book,
        lastReadChapter: lastEffectivelyReadVerse.chapter,
        lastReadVerse: lastEffectivelyReadVerse.verse,
        totalSkips: userOverallProgress?.totalSkips || 0,
        history: userOverallProgress?.history ? [...userOverallProgress.history, historyEntry] : [historyEntry],
        completedChapters: Array.from(newCompletedChaptersInSession)
    };
    progressService.saveUserProgress(currentUser.username, newOverallProgress);
    setUserOverallProgress(newOverallProgress);
      
    } else if (versesActuallyReadThisSessionCount <=0) {
         setSessionCertificationMessage("?´ë²ˆ ?¸ì…˜?ì„œ ?½ì? êµ¬ì ˆ???†ìŠµ?ˆë‹¤.");
    } else {
        setSessionCertificationMessage("?¬ìš©???•ë³´ ?¤ë¥˜ ?ëŠ” ?½ì? êµ¬ì ˆ ê¸°ë¡ ?¤ë¥˜.");
    }
    
    setReadingState(ReadingState.IDLE); 
    // Do not reset transcriptBuffer or matchedVersesContentForSession here
    // so user can see what they read before session was stopped, if they go back.
    // It will be cleared when a new session starts.
    
    // ? ì‹œ ???”ë©´ ë¦¬í”„?ˆì‹œ
    setTimeout(() => {
      window.location.reload();
    }, 1000); // 1ì´??„ì— ?”ë©´ ë¦¬í”„?ˆì‹œ
  };

  const handleRetryVerse = () => {
    // The hook now handles the complexities. We just need to signal the intent.
    setReadingState(ReadingState.LISTENING);
    // ?´ì „???½ì? êµ¬ì ˆ ?´ìš©?€ ? ì??˜ê³  ?„ì¬ ?Œì„± ?¸ì‹ ê²°ê³¼ë§?ì´ˆê¸°??    // setMatchedVersesContentForSession(''); <- ??ì¤??œê±°: ?´ì „???½ì? ?´ìš© ? ì?
    setTranscriptBuffer(''); // ?„ì¬ ?Œì„±?¸ì‹ ë²„í¼ë§?ì´ˆê¸°??    setAppError(null);

    resetTranscript(); // STT ???´ë????´ì „ ê¸°ë¡ ì´ˆê¸°??    stopListening();
    setIsRetryingVerse(true);
  };

  const handleVerseSkip = () => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) return;

    // ?„ì¬ êµ¬ì ˆ ?•ë³´ ê°€?¸ì˜¤ê¸?    const currentVerse = currentTargetVerseForSession;
    
    // ë§¤ì¹˜??êµ¬ì ˆ ëª©ë¡??ì¶”ê? (ê±´ë„ˆ?°ì—ˆ?¤ëŠ” ?œì‹œ?€ ?¨ê»˜)
    setMatchedVersesContentForSession(prev => prev + `${currentVerse.book} ${currentVerse.chapter}:${currentVerse.verse} - [?¨ìŠ¤?? ${currentVerse.text}\n`);
    
    // ?¸ì…˜ ì§„í–‰ ?í™© ?…ë°?´íŠ¸ (?„ë£Œ??êµ¬ì ˆ ì¹´ìš´??ì¦ê?)
    const newTotalCompletedInSelection = currentVerseIndexInSession + 1;
    setSessionProgress(prev => ({
      ...prev,
      sessionCompletedVersesCount: newTotalCompletedInSelection,
    }));

    // ë§ˆì?ë§?êµ¬ì ˆ?¸ì? ?•ì¸
    if (currentVerseIndexInSession >= sessionTargetVerses.length - 1) {
      // ?¸ì…˜ ?„ë£Œ ì²˜ë¦¬
      setReadingState(ReadingState.SESSION_COMPLETED);
      stopListening();
      resetTranscript();
      setTranscriptBuffer('');

      const firstVerseActuallyReadInSession = sessionTargetVerses[sessionProgress.sessionInitialSkipCount] || sessionTargetVerses[0];
      const lastVerseOfSession = sessionTargetVerses[sessionTargetVerses.length - 1];
      const versesReadCountThisSession = sessionTargetVerses.length - sessionProgress.sessionInitialSkipCount;

      const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}??${firstVerseActuallyReadInSession.verse}??~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}??${lastVerseOfSession.verse}??(ì´?${versesReadCountThisSession}?? ?½ê¸° ?„ë£Œ!`;
      setSessionCertificationMessage(certMsg);
      setAppError(null);
      
      // ì§„í–‰ ?í™© ?€??ì²˜ë¦¬ (handleStopReadingAndSave ?¸ì¶œ)
      handleStopReadingAndSave();
    } else {
      // ?¤ìŒ êµ¬ì ˆë¡??´ë™
      setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
      resetTranscript();
      setTranscriptBuffer('');
    }
  };

  // ?„ì¬ êµ¬ì ˆ???´ë ¤???¨ì–´ê°€ ?¬í•¨?˜ì–´ ?ˆëŠ”ì§€ ?•ì¸?˜ëŠ” ?¨ìˆ˜
  const checkForDifficultWords = (verse: BibleVerse | null) => {
    if (!verse) return false;
    
    const verseText = verse.text;
    // utils.ts??containsDifficultWord ?¨ìˆ˜ ?¬ìš©
    const hasDifficult = containsDifficultWord(verseText);
    if (hasDifficult) {
      console.log(`[App.tsx] êµ¬ì ˆ???´ë ¤???¨ì–´ê°€ ?¬í•¨?˜ì–´ ?ˆìŠµ?ˆë‹¤`);
    }
    return hasDifficult;
  };

  useEffect(() => {
    console.log(`[App.tsx] Verse index changed to: ${currentVerseIndexInSession}, total verses: ${sessionTargetVerses.length}. Reading state: ${readingState}`);
    
    // ?„ë©˜ ?„ë¡¬?„íŠ¸ ì´ˆê¸°??    setShowAmenPrompt(false);
    
    // ??êµ¬ì ˆë¡??˜ì–´ê°”ì„ ???€?´ë¨¸ ì´ˆê¸°??    if (verseTimeoutId) {
      clearTimeout(verseTimeoutId);
      setVerseTimeoutId(null);
    }
    
    // ?„ì¬ êµ¬ì ˆ???´ë ¤???¨ì–´ê°€ ?ˆëŠ”ì§€ ?•ì¸
    const hasDifficult = checkForDifficultWords(currentTargetVerseForSession);
    setHasDifficultWords(hasDifficult);
    console.log(`[App.tsx] ?´ë ¤???¨ì–´ ?¬í•¨ ?¬ë?: ${hasDifficult}`);
    
    // êµ¬ì ˆ???œì‘?????€?´ë¨¸ ?œì‘ (?´ë ¤???¨ì–´ê°€ ?ˆëŠ” êµ¬ì ˆ?ë§Œ ?€?´ë¨¸ ?ìš©)
    if (readingState === ReadingState.LISTENING && hasDifficult) {
      setVerseStartTime(Date.now());
      
      // 15ì´??„ì— ?„ë©˜ ?„ë¡¬?„íŠ¸ ?œì‹œ
      const timeoutId = setTimeout(() => {
        setShowAmenPrompt(true);
        console.log('[App.tsx] 15ì´?ê²½ê³¼ - ?„ë©˜ ?„ë¡¬?„íŠ¸ ?œì‹œ');
      }, 15000); // 15ì´ˆë¡œ ?¨ì¶•
      
      setVerseTimeoutId(timeoutId);
    }
  }, [currentVerseIndexInSession, readingState]);

  if (!currentUser) {
    return (
    <>
      <BrowserRecommendation />
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 py-8 px-4 flex flex-col items-center justify-center">
        <header className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-500 drop-shadow-lg mb-2">
            ë§ì? ?¬ì •???¨ê»˜?´ìš”
          </h1>
          <div className="text-base sm:text-lg text-gray-600 font-serif mb-2">Bible Journey Challenge</div>
        </header>
        <AuthForm onAuth={handleAuth} onRegister={handleRegister} title="ë¡œê·¸???ëŠ” ?¬ìš©???±ë¡" />
        {appError && <p className="mt-4 text-red-500">{appError}</p>}

        {userOverallProgress && (userOverallProgress.lastReadChapter > 0 || userOverallProgress.lastReadVerse > 0) && readingState === ReadingState.IDLE && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
                ë§ˆì?ë§??½ì? ê³? {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}??{userOverallProgress.lastReadVerse}??
                <span className="italic ml-2">(?„ë˜?ì„œ ?´ì–´???½ê±°???ˆë¡œ??ë²”ìœ„ë¥?? íƒ?˜ì—¬ ?½ìœ¼?¸ìš”.)</span>
            </div>
        )}

        {(appError && (readingState === ReadingState.ERROR || readingState === ReadingState.IDLE || readingState === ReadingState.SESSION_COMPLETED || readingState === ReadingState.LISTENING)) && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            <p className="font-semibold">?¤ë¥˜ ë°œìƒ:</p>
            <p>{appError}</p>
          </div>
        )}
        
        {!browserSupportsSpeechRecognition && (
             <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md">
                <p className="font-semibold">?Œì„± ?¸ì‹ ë¯¸ì???</p>
                <p>?„ì¬ ?¬ìš© ì¤‘ì¸ ë¸Œë¼?°ì??ì„œ???Œì„± ?¸ì‹ ê¸°ëŠ¥??ì§€?í•˜ì§€ ?ŠìŠµ?ˆë‹¤. Chrome, Edge, Safari ìµœì‹  ë²„ì „???¬ìš©??ì£¼ì„¸??</p>
            </div>
        )}
      </div>
    );
  } // End of if (!currentUser)

  // Main application view when currentUser is defined
  return (
    <>
      <BrowserRecommendation />
    <div className="container mx-auto p-4 max-w-4xl bg-amber-50 shadow-lg rounded-lg">
      {currentUser && (currentUser as User).must_change_password && showPasswordChangePrompt && (
        // This condition ensures the form only shows if needed and explicitly triggered
        // We might want a separate state like `isPasswordChangeModalOpen` for better control
        // For now, piggybacking on showPasswordChangePrompt for simplicity
        // The password change form JSX starts directly below:
        <div className="p-4 mb-4 text-sm text-orange-700 bg-orange-100 rounded-lg border border-orange-300 shadow-md" role="alert">
          <h3 className="font-bold text-lg mb-2">ë¹„ë?ë²ˆí˜¸ ë³€ê²??„ìš”</h3>
          <p className="mb-1">
            ?„ì¬ ?„ì‹œ ë¹„ë?ë²ˆí˜¸(1234)ë¥??¬ìš©?˜ê³  ?ˆìŠµ?ˆë‹¤. ë³´ì•ˆ???„í•´ ì¦‰ì‹œ ??ë¹„ë?ë²ˆí˜¸ë¥??¤ì •?´ì£¼?¸ìš”.
          </p>
          <form onSubmit={handlePasswordChangeSubmit} className="mt-3 space-y-3">
            <div>
              <label htmlFor="newPassword" className="block text-xs font-medium text-orange-800">??ë¹„ë?ë²ˆí˜¸:</label>
              <input 
                type="password" 
                id="newPassword" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400"
                placeholder="??ë¹„ë?ë²ˆí˜¸ ?…ë ¥"
              />
            </div>
            <div>
              <label htmlFor="confirmNewPassword" className="block text-xs font-medium text-orange-800">??ë¹„ë?ë²ˆí˜¸ ?•ì¸:</label>
              <input 
                type="password" 
                id="confirmNewPassword" 
                value={confirmNewPassword} 
                onChange={(e) => setConfirmNewPassword(e.target.value)} 
                className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400"
                placeholder="??ë¹„ë?ë²ˆí˜¸ ?¤ì‹œ ?…ë ¥"
              />
            </div>
            {passwordChangeError && <p className="text-xs text-red-600">{passwordChangeError}</p>}
            {passwordChangeSuccess && <p className="text-xs text-green-600">{passwordChangeSuccess}</p>}
            <div className="flex items-center justify-between">
              <button 
                type="submit" 
                className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
              >
                ë¹„ë?ë²ˆí˜¸ ë³€ê²½í•˜ê¸?              </button>
              <button 
                type="button"
                onClick={() => {
                  setShowPasswordChangePrompt(false);
                  setPasswordChangeError(null);
                  setPasswordChangeSuccess(null);
                  setNewPassword('');
                  setConfirmNewPassword('');
                }} 
                className="px-3 py-1.5 text-xs font-medium text-orange-700 bg-transparent border border-orange-700 rounded hover:bg-orange-200 focus:ring-2 focus:ring-orange-300"
              >
                ?˜ì¤‘??ë³€ê²?              </button>
            </div>
          </form>
        </div>
      )}
      {/* TODO: Consider adding a header here for authenticated users, e.g., user display and logout button */}
      {/* TODO: Consider adding a header here for authenticated users, e.g., user display and logout button */}
      {/* The following JSX was previously misplaced and is now part of the main authenticated view */}
      {readingState === ReadingState.IDLE && (
          <>
            {/* Overall Bible Progress Display */}
            {currentUser && totalBibleChapters > 0 && (
              <div className="my-4 p-4 bg-sky-50 border border-sky-200 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-sky-700 mb-2">?±ê²½ ?„ì²´ ?„ë… ì§„í–‰ë¥?/h3>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-sky-500 h-4 rounded-full transition-all duration-300 ease-out relative"
                    style={{ width: `${totalBibleChapters > 0 ? (overallCompletedChaptersCount / totalBibleChapters) * 100 : 0}%` }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                      {totalBibleChapters > 0 ? ((overallCompletedChaptersCount / totalBibleChapters) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1.5 text-right">
                  {overallCompletedChaptersCount} / {totalBibleChapters} ???„ë…
                </p>
              </div>
            )}

            {/* Continue Reading Section */}
            <div className="my-4 p-4 bg-blue-50 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-blue-700">?´ì–´ ?½ê¸°</h3>
              {userOverallProgress && userOverallProgress.lastReadBook ? (
                <p className="text-sm text-gray-600">
                  ë§ˆì?ë§??½ì? ê³? {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}??{userOverallProgress.lastReadVerse}??
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  ?„ì§ ?½ê¸° ê¸°ë¡???†ìŠµ?ˆë‹¤. ?„ë˜?ì„œ ?œì‘??ë¶€ë¶„ì„ ? íƒ?˜ì„¸??
                </p>
              )}
              {userOverallProgress && userOverallProgress.lastReadBook && selectedBookForSelector && (
                <p className="text-sm text-gray-500 mt-1">
                  ì¶”ì²œ ?œì‘: {selectedBookForSelector} {startChapterForSelector}??{startVerseForSelector}?? (?„ë˜?ì„œ ë³€ê²?ê°€??
                </p>
              )}
            </div>

            <ChapterSelector
              key={`session-${sessionCount}`}
              onStartReading={handleSelectChaptersAndStartReading}
              defaultBook={selectedBookForSelector}
              defaultStartChapter={startChapterForSelector}
              defaultEndChapter={startChapterForSelector}
              completedChapters={userOverallProgress?.completedChapters}
            />

            {/* Toggle Button for Book Completion Status - MOVED HERE */}
            {currentUser && userOverallProgress && (
  <div className="my-8 flex flex-col gap-3 items-center w-full max-w-md mx-auto">
    {/* ê¶Œë³„ ?„ë… ?„í™© ë³´ê¸° ë²„íŠ¼ */}
    {/* ê¶Œë³„ ?„ë… ?„í™© ë³´ê¸° ë²„íŠ¼ ë°??´ìš© */}
    <button
      onClick={() => setShowBookCompletionStatus(!showBookCompletionStatus)}
      className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-blue-300 to-sky-300 text-white rounded-2xl shadow-lg border border-blue-200 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      <span className="text-2xl mr-1">?“š</span>
      {showBookCompletionStatus ? 'ê¶Œë³„ ?„ë… ?„í™© ?¨ê¸°ê¸? : 'ê¶Œë³„ ?„ë… ?„í™© ë³´ê¸°'}
    </button>
    {currentUser && userOverallProgress && showBookCompletionStatus && (
      <BookCompletionStatus 
        userProgress={userOverallProgress} 
        availableBooks={AVAILABLE_BOOKS} 
      />
    )}

    {/* ?¨ê»˜ ê±·ëŠ” ?¬ì • ë²„íŠ¼ ë°??´ìš© */}
    <button
      onClick={() => setCurrentView(currentView === 'LEADERBOARD' ? 'IDLE_SETUP' : 'LEADERBOARD')}
      className={`w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-purple-500 via-fuchsia-400 to-pink-300 text-white rounded-2xl shadow-lg border border-purple-200 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 ${currentView === 'LEADERBOARD' ? 'ring-2 ring-fuchsia-400' : ''}`}
    >
      <span className="text-2xl mr-1">?‘£</span>
      {currentView === 'LEADERBOARD' ? '?¨ê»˜ ê±·ëŠ” ?¬ì • ?¨ê¸°ê¸? : '?¨ê»˜ ê±·ëŠ” ?¬ì • ë³´ê¸°'}
    </button>
    {readingState === ReadingState.IDLE && currentView === 'LEADERBOARD' && (
      <div className="my-4 p-4 bg-gray-50 rounded-lg shadow w-full">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">?‘£ ?¨ê»˜ ê±·ëŠ” ë§ì???ë°œìì·?/h3>
        <Leaderboard key={userOverallProgress ? `lb-${userOverallProgress.lastReadBook}-${userOverallProgress.lastReadChapter}-${userOverallProgress.lastReadVerse}` : 'lb-no-progress'} />
      </div>
    )}
    {/* ëª…ì˜ˆ???„ë‹¹ ?„ì²´ ë³´ê¸° ë²„íŠ¼ (?„ë˜ë¡??´ë™) */}
    <button
      onClick={() => setShowHallOfFame(true)}
      className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 text-amber-900 rounded-2xl shadow-xl border-2 border-yellow-300 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-300 drop-shadow-glow"
      style={{ boxShadow: '0 0 16px 2px #ffe06655' }}
    >
      <span className="text-2xl mr-1">?‘‘</span>
      ëª…ì˜ˆ???„ë‹¹
    </button>
    {/* ?¤ì‹œ ?œì‘ ë²„íŠ¼: ?„ë…??100%ë§??¸ì¶œ */}
    {(currentUser && (currentUser as any).completed_count > 0) && overallCompletedChaptersCount === totalBibleChapters && (
      <button
        disabled={bibleResetLoading}
        onClick={async () => {
          if (!window.confirm('?•ë§ë¡??¤ì‹œ ë§ì? ?¬ì •???œì‘?˜ì‹œê² ìŠµ?ˆê¹Œ?\n?„ë… ?Ÿìˆ˜ê°€ ì¦ê??˜ê³ , ëª¨ë“  ì§„í–‰ë¥ ì´ ì´ˆê¸°?”ë©?ˆë‹¤.')) return;
          setBibleResetLoading(true);
          try {
            const res = await fetch('/api/bible-reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id }),
            });
            const data = await res.json();
            if (data.success) {
              alert(`?¤ì‹œ ?œì‘?˜ì—ˆ?µë‹ˆ?? (?„ë… ?Ÿìˆ˜: ${data.round})`);
              window.location.reload();
            } else {
              alert('?¤ë¥˜: ' + (data.error || 'ì§„í–‰???¤íŒ¨?ˆìŠµ?ˆë‹¤.'));
            }
          } catch (e) {
            alert('?œë²„ ?¤ë¥˜: ?¤ì‹œ ?œë„??ì£¼ì„¸??');
          } finally {
            setBibleResetLoading(false);
          }
        }}
        className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-white via-yellow-100 to-yellow-200 text-amber-700 rounded-2xl border-2 border-amber-300 shadow-xl mt-1 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-300 drop-shadow-glow disabled:opacity-60"
        style={{ boxShadow: '0 0 14px 2px #ffe06644' }}
      >
        <span className="text-2xl mr-1">??/span>
        {bibleResetLoading ? '??ì§„í–‰ ì¤?..' : '?¤ì‹œ ë§ì? ?¬ì • ?œì‘?˜ê¸°'}
      </button>
    )}
  </div>
)}




          </>
        )}

        {/* Hall of Fame Modal */}
        {showHallOfFame && (
          <HallOfFame onClose={() => setShowHallOfFame(false)} />
        )}



        {readingState === ReadingState.READING && sessionTargetVerses.length > 0 && (
          <>
            <div className="my-6">
              <h2 className="text-xl font-bold mb-2">? íƒ??ë²”ìœ„???±ê²½ ë³¸ë¬¸</h2>
              <div className="bg-gray-50 border rounded-md p-4 max-h-96 overflow-y-auto">
                {sessionTargetVerses.map((v) => (
                  <div key={`${v.book}-${v.chapter}-${v.verse}`} className="py-1 border-b last:border-b-0">
                    <span className="font-semibold">{v.book} {v.chapter}:{v.verse}</span> <span>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4 mt-4">
              <button
                className="px-6 py-2 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500 transition"
                onClick={() => {
                  // Reset session-specific state and go back to setup
                  setReadingState(ReadingState.IDLE);
                  setSessionTargetVerses([]);
                  setCurrentVerseIndexInSession(0);
                  setMatchedVersesContentForSession('');
                  setSessionProgress(initialSessionProgress);
                  setSessionCertificationMessage('');
                  setTranscriptBuffer('');
                }}
              >
                ???¤ë¡œê°€ê¸?              </button>
              <button
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
                onClick={() => setReadingState(ReadingState.LISTENING)}
              >
                ?Œì„± ?¸ì‹ ?œì‘
              </button>
            </div>
          </>
        )}

        {(readingState === ReadingState.LISTENING || readingState === ReadingState.SESSION_COMPLETED) && sessionTargetVerses.length > 0 && (
          <>
            <ProgressBar progress={sessionProgress} />
            {/* RecognitionDisplay component's content inlined here for layout change */}
            <div className="my-4 p-4 bg-white rounded-lg shadow-md">
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-sm text-gray-500">?¤ìŒ êµ¬ì ˆ ?½ê¸°:</p>
                  {currentTargetVerseForSession && (
                    <p className="text-md font-semibold text-indigo-700">
                      {currentTargetVerseForSession.book} {currentTargetVerseForSession.chapter}:{currentTargetVerseForSession.verse}
                    </p>
                  )}
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  <p className="text-xl font-semibold text-black leading-loose">
                    {currentTargetVerseForSession ? currentTargetVerseForSession.text : "?½ê¸° ëª©í‘œ ?†ìŒ"}
                  </p>
                  {showAmenPrompt && hasDifficultWords && (
                    <div className="mt-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-md animate-pulse">
                      <p className="font-bold text-center">?¸ì‹???´ë ¤?Œìš”!</p>
                      <p className="text-sm text-center">"?„ë©˜"???¸ì¹˜?œë©´ ?¤ìŒ êµ¬ì ˆë¡??˜ì–´ê°‘ë‹ˆ??/p>
                    </div>
                  )}
                </div>
              </div>

              {readingState === ReadingState.LISTENING && (
                <div className="flex justify-center gap-4 my-4">
                  <button
                    className="px-8 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition shadow-md"
                    onClick={handleStopReadingAndSave}
                  >
                    ì¤‘ì?
                  </button>
                  <button
                    className="px-8 py-2 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 transition shadow-md"
                    onClick={handleRetryVerse}
                  >
                    ?¤ì‹œ ?½ê¸°
                  </button>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm text-gray-500">?¸ì‹???Œì„±:</p>
                <p className="text-md text-gray-700 min-h-[2.5em] p-2 bg-gray-100 rounded-md border">
                  {sttTranscript || <span className="text-gray-400 italic">?£ê³  ?ˆìŠµ?ˆë‹¤...</span>}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">ì§€ê¸ˆê¹Œì§€ ?½ì? ?´ìš©:</p>
                <div className="text-sm text-gray-600 whitespace-pre-wrap p-2 bg-gray-50 rounded-md border max-h-40 overflow-y-auto">
                  {matchedVersesContentForSession || <span className="text-gray-400 italic">?„ì§ ?½ì? êµ¬ì ˆ???†ìŠµ?ˆë‹¤.</span>}
                </div>
              </div>
            </div>

            {readingState === ReadingState.LISTENING && (
              <p className="mt-3 text-xs text-center text-gray-600">??ê°??ˆì„ ?½ì„ ?Œë§ˆ???ë™?¼ë¡œ ì§„í–‰ ?í™©???€?¥ë©?ˆë‹¤. ?½ê¸°ë¥?ì¤‘ë‹¨?˜ë ¤ë©?'ì¤‘ì?' ë²„íŠ¼???„ë¥´?¸ìš”.</p>
            )}
            {readingState === ReadingState.SESSION_COMPLETED && (
              <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 text-center p-6 bg-green-100 border-2 border-green-600 rounded-lg shadow-xl max-w-md w-11/12">
                <h2 className="text-2xl font-bold text-green-700 mb-3">?´ë²ˆ ?¸ì…˜ ?½ê¸° ?„ë£Œ!</h2>
                <p className="text-lg text-gray-700 mb-4 whitespace-pre-wrap">{sessionCertificationMessage}</p>
                <button 
                  onClick={() => {
                      // Reset all session-related state for a clean start
                      setReadingState(ReadingState.IDLE);
                      setSessionTargetVerses([]);
                      setMatchedVersesContentForSession('');
                      setSessionProgress({ totalVersesInSession: 0, sessionCompletedVersesCount: 0, sessionInitialSkipCount: 0 });
                      setSessionCertificationMessage('');
                      setSessionCount(prev => prev + 1); // Increment to force re-mount
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg shadow transition duration-150 ease-in-out"
                >
                  ?¤ë¥¸ ë²”ìœ„ ?½ê¸° ?ëŠ” ??‚¹ ë³´ê¸°
                </button>
              </div>
            )}
          </>
        )}
        
        <footer className="mt-12 pt-6 border-t border-gray-300 text-center text-xs sm:text-sm text-gray-500">
        <div className="mt-10 text-center text-xs text-gray-400 font-sans select-none">
      <div className="mb-1">?¬ë„?˜ë¬´êµíšŒ &nbsp;|&nbsp; Dev: ?´ì¢…ë¦?&nbsp;|&nbsp; <a href="mailto:luxual8@gmail.com" className="underline hover:text-amber-700">ë¬¸ì˜ ë°?ê°œì„ ?¬í•­</a></div>
      <div className="mb-1">Copyright Â© 2025 ?´ì¢…ë¦? All rights reserved.</div>
      <div className="italic text-[11px] text-gray-300">?Œì„± ?¸ì‹ ?•í™•?„ë? ?„í•´ ì¡°ìš©???˜ê²½??ê¶Œì¥?©ë‹ˆ??</div>
      </div>
        </footer>
      </div>
  );
}; 

export default App;
