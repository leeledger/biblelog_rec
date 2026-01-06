import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { progressService } from './services/progressService';
import { BibleVerse, SessionReadingProgress, ReadingState, User, UserProgress, UserSessionRecord } from './types';
import { getBibleImage, getBibleImageTitle } from './src/img/dore/bibleImageMap';
import { AVAILABLE_BOOKS, getVersesForSelection, getNextReadingStart, BOOK_ABBREVIATIONS_MAP, TOTAL_CHAPTERS_IN_BIBLE, getBookId } from './constants';

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
  
  // 음성 인식 결과에서 자주 발생하는 오류 수정
  let processed = normalized
    // 숫자 인식 오류 수정 (202호 -> 이백요, 22요 -> 이십이요)
    .replace(/202\s*호/g, "이백요")
    .replace(/202\s*요/g, "이백요")
    .replace(/200\s*호/g, "이백요")
    .replace(/200\s*요/g, "이백요")
    .replace(/22\s*호/g, "이십이요")
    .replace(/22\s*요/g, "이십이요")
    .replace(/20\s*호/g, "이십요")
    .replace(/20\s*요/g, "이십요");
  
  // 한글 숫자를 아라비아 숫자로 변환
  processed = processed
    // 한글 숫자 패턴 (일, 이, 삼, ...) 변환
    .replace(/일/g, "1")
    .replace(/이/g, "2")
    .replace(/삼/g, "3")
    .replace(/사/g, "4")
    .replace(/오/g, "5")
    .replace(/육/g, "6")
    .replace(/칠/g, "7")
    .replace(/팔/g, "8")
    .replace(/구/g, "9")
    .replace(/십/g, "10")
    .replace(/백/g, "100")
    .replace(/천/g, "1000")
    .replace(/만/g, "10000");
  
  // 한글 숫자 복합형 처리 (예: 이백이십 -> 220)
  processed = processed
    // 백 단위 처리
    .replace(/(\d+)100(\d+)10(\d+)/g, (_, p1, p2, p3) => String(Number(p1) * 100 + Number(p2) * 10 + Number(p3)))
    .replace(/(\d+)100(\d+)/g, (_, p1, p2) => String(Number(p1) * 100 + Number(p2)))
    .replace(/(\d+)100/g, (_, p1) => String(Number(p1) * 100))
    // 십 단위 처리
    .replace(/(\d+)10(\d+)/g, (_, p1, p2) => String(Number(p1) * 10 + Number(p2)))
    .replace(/(\d+)10/g, (_, p1) => String(Number(p1) * 10));
    
  console.log('[App.tsx] After number normalization:', processed);
    
  // 안드로이드 기기에서 추가 처리
  if (/Android/.test(navigator.userAgent)) {
    // 안드로이드에서 숫자 인식 문제 해결을 위한 추가 처리
    processed = processed
      // 숫자 앞뒤 공백 제거 (안드로이드 음성인식 특성)
      .replace(/(\d+)\s+장/g, "$1장")
      .replace(/(\d+)\s+절/g, "$1절")
      // 숫자 사이 공백 제거 (예: "2 3" -> "23")
      .replace(/(\d+)\s+(\d+)/g, "$1$2")
      // "이십이 장" 형태 처리
      .replace(/이십(\d+)\s*장/g, "2$1장")
      .replace(/삼십(\d+)\s*장/g, "3$1장")
      .replace(/사십(\d+)\s*장/g, "4$1장")
      .replace(/오십(\d+)\s*장/g, "5$1장")
      // "이십이 절" 형태 처리
      .replace(/이십(\d+)\s*절/g, "2$1절")
      .replace(/삼십(\d+)\s*절/g, "3$1절")
      .replace(/사십(\d+)\s*절/g, "4$1절")
      .replace(/오십(\d+)\s*절/g, "5$1절");
      
    console.log(`[App.tsx] Android specific processing for: "${text}" -> "${processed}"`);
  }
  
  return processed
    .toLowerCase()
    // eslint-disable-next-line no-irregular-whitespace
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?　]/g, "") // remove punctuation, including full-width space
    .replace(/\s+/g, ""); // remove all whitespace
};

const FUZZY_MATCH_LOOKBACK_FACTOR = 1.3; // 1.8에서 하향 조정. 이전 절 텍스트가 비교에 포함되는 것을 방지 

// 기본(안드로이드 등) 기기 설정: 약간 너그럽게 설정하여 발음이 어려운 단어 인식률 개선
const FUZZY_MATCH_SIMILARITY_THRESHOLD_DEFAULT = 55;
const MINIMUM_READ_LENGTH_RATIO_DEFAULT = 0.9;
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_DEFAULT = 5;

// iOS 기기 설정: 다 읽기 전에 넘어가는 현상을 방지하기 위해 더 엄격하게 설정
const FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS = 50; // iOS 유사도 기준 완화 (65->50). 인식 오류에 더 너그러워짐.
const MINIMUM_READ_LENGTH_RATIO_IOS = 0.95;
const ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS = 2;

// iOS 긴 구절 끝까지 읽기 검증용 상수
const LONG_VERSE_CHAR_COUNT = 30; // 이 길이 이상이면 '긴 구절'로 간주 
const END_PORTION_LENGTH = 15;    // 구절의 마지막 몇 글자를 비교할지

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
  const [isRestartingForNextVerseOnIOS, setIsRestartingForNextVerseOnIOS] = useState(false);
  const [bibleResetLoading, setBibleResetLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userOverallProgress, setUserOverallProgress] = useState<UserProgress | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('IDLE_SETUP');
  const [sessionCount, setSessionCount] = useState(0); // Key for re-mounting components
  
  const [sessionTargetVerses, setSessionTargetVerses] = useState<BibleVerse[]>([]); // Verses for the current reading session
  const [currentVerseIndexInSession, setCurrentVerseIndexInSession] = useState(0); // Index within sessionTargetVerses
  
  // 아멘 패스키 기능 관련 상태
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
  
  // 성경 이미지 표시 관련 상태
  const [showBibleImage, setShowBibleImage] = useState(true); // 성경 이미지 표시 여부
  const [currentBibleImage, setCurrentBibleImage] = useState<string | null>(null);
  const [currentBibleImageTitle, setCurrentBibleImageTitle] = useState<string | null>(null);

  const [imageLoadStatus, setImageLoadStatus] = useState<'loading' | 'success' | 'error' | null>(null); // 이미지 로딩 상태

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

  /**
   * 현재 성경 구절에 해당하는 이미지를 로드하는 함수
   * @param verse 현재 성경 구절 객체
   */
  /**
   * 현재 성경 구절에 해당하는 이미지를 로드하는 함수
   * @param verse 현재 성경 구절 객체
   */
  function loadBibleImage(verse: BibleVerse | null) {
    console.log('[App.tsx] loadBibleImage 함수 호출됨:', verse);
    setImageLoadStatus('loading');
    
    try {
      if (!verse) {
        console.log('[App.tsx] 이미지 로드 실패: verse 객체가 null입니다.');
        setImageLoadStatus('error');
        setCurrentBibleImage(null);
        setCurrentBibleImageTitle(null);
  
        return;
      }
      
      const bookId = getBookId(verse.book);
      if (!bookId) {
        console.log(`[App.tsx] 이미지 로드 실패: ${verse.book}에 해당하는 bookId 없음`);
        setImageLoadStatus('error');
        setCurrentBibleImage(null);
        setCurrentBibleImageTitle(null);
  
        return;
      }
      
      const imagePath = getBibleImage(bookId, verse.chapter);
      if (!imagePath) {
        console.log(`[App.tsx] 이미지 로드 실패: ${bookId} ${verse.chapter}에 해당하는 이미지 없음`);
        setImageLoadStatus('error');
        setCurrentBibleImage(null);
        setCurrentBibleImageTitle(null);
  
        return;
      }
      
      const imageTitle = getBibleImageTitle(imagePath);
      
      const origin = window.location.origin;
      const baseUrl = process.env.PUBLIC_URL || '';
      
      console.log(`[App.tsx] 이미지 로드 시도: bookId=${bookId}, chapter=${verse.chapter}, imagePath=${imagePath}`);
      console.log(`[App.tsx] 환경 변수: PUBLIC_URL=${process.env.PUBLIC_URL}, origin=${origin}`);
      
      // 다양한 형식의 URL 경로 시도
      const paths = [
        `${origin}/img/dore/images/${imagePath}`,
        `${origin}${baseUrl}/img/dore/images/${imagePath}`,
        `/img/dore/images/${imagePath}`,
        `${baseUrl}/img/dore/images/${imagePath}`
      ];
      
      // 이미지 경로를 첫 번째 형식으로 설정
      setCurrentBibleImage(paths[0]); 
      
      console.log(`[App.tsx] 이미지 경로 타입 및 경로 정보:`, {
        origin,
        baseUrl,
        imagePath,
        paths
      });
      
      setCurrentBibleImageTitle(imageTitle || null);
    } catch (error) {
      console.error('[App.tsx] 이미지 로드 중 오류:', error);
      setCurrentBibleImage(null);
      setCurrentBibleImageTitle(null);

      setImageLoadStatus('error');
    }
  }

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

  // 음성인식 관련 처리를 위한 useRef 추가 - 무한 루프 방지용
  const speechRecognitionInitialized = useRef(false);
  
  // 음성인식 시작하는 함수를 새로 정의
  const handleStartSpeechRecognition = useCallback(() => {
    console.log('[App.tsx] Manual speech recognition start');
    if (!isListening) {
      resetTranscript();
      startListening();
    }
  }, [isListening, resetTranscript, startListening]);
  
  // 음성인식 중지하는 함수를 새로 정의
  const handleStopSpeechRecognition = useCallback(() => {
    console.log('[App.tsx] Manual speech recognition stop');
    if (isListening) {
      stopListening();
    }
  }, [isListening, stopListening]);
  
  // readingState 변경에 따른 음성인식 상태 관리 - useEffect 중지
  // 관련 기능은 handleSelectChaptersAndStartReading에서 직접 관리

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
      setPasswordChangeError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 4) { // Basic validation, align with backend if different
      setPasswordChangeError('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }
    if (newPassword === '1234') {
      setPasswordChangeError('새 비밀번호는 기본 비밀번호와 다르게 설정해야 합니다.');
      return;
    }

    if (!currentUser) {
      setPasswordChangeError('사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    if (typeof currentUser.id !== 'number') {
      setPasswordChangeError('사용자 ID가 유효하지 않습니다. 다시 로그인해주세요.');
      return;
    }

    try {
      const result = await authService.changePassword(currentUser.id, newPassword);
      if (result && result.user) {
        setPasswordChangeSuccess('비밀번호가 성공적으로 변경되었습니다! 이제 이 알림은 닫으셔도 됩니다.');
        setCurrentUser({ ...currentUser, ...result.user, must_change_password: false }); // Update user state from backend response
        setShowPasswordChangePrompt(false); // Hide the prompt/form on success
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordChangeError(result?.message || '비밀번호 변경에 실패했습니다. 서버 응답을 확인해주세요.');
      }
    } catch (error) {
      console.error('Password change failed:', error);
      setPasswordChangeError('비밀번호 변경 중 오류가 발생했습니다. 네트워크 연결 또는 서버 상태를 확인해주세요.');
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
      setAppError('비밀번호를 확인하세요.');
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
    
    // 읽기 상태가 아니거나 아멘 프롬프트가 표시되지 않은 경우 체크하지 않음
    if (readingState !== ReadingState.LISTENING || !showAmenPrompt) return;
    
    // "아멘" 감지 로직
    const normalizedTranscript = normalizeText(sttTranscript.toLowerCase());
    if (normalizedTranscript.includes('아멘')) {
      console.log('[App.tsx] 아멘 단어 감지됨!');
      handleVerseSkip();
    }
  }, [sttTranscript, showAmenPrompt, readingState]);
  
  useEffect(() => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) {
      return;
    }
    
    // 사용자가 "아멘"을 말하면 다음 구절로 넘어가기 (어려운 구절에서만 작동)
    if (showAmenPrompt && hasDifficultWords && transcriptBuffer) {
      const normalizedTranscript = normalizeText(transcriptBuffer.toLowerCase());
      if (normalizedTranscript.includes('아멘')) {
        console.log('[App.tsx] 아멘 패스키 감지됨 - 다음 구절로 이동합니다');
        
        // 아멘 프롬프트 숨기기
        setShowAmenPrompt(false);
        
        // 타이머 제거
        if (verseTimeoutId) {
          clearTimeout(verseTimeoutId);
          setVerseTimeoutId(null);
        }
        
        // 다음 구절로 이동
        setTimeout(() => {
          setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text} [아멘 패스키 사용]\n`);
          setTranscriptBuffer('');
          setTimeout(() => {
            resetTranscript();
          }, 50);
          
          // 마지막 구절인지 확인
          if (currentVerseIndexInSession < sessionTargetVerses.length - 1) {
            setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
          } else {
            // 세션 완료
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

    // 플랫폼별 기준값 선택
    const similarityThreshold = isIOS ? FUZZY_MATCH_SIMILARITY_THRESHOLD_IOS : FUZZY_MATCH_SIMILARITY_THRESHOLD_DEFAULT;
    const minLengthRatio = isIOS ? MINIMUM_READ_LENGTH_RATIO_IOS : MINIMUM_READ_LENGTH_RATIO_DEFAULT;
    const absDiffThreshold = isIOS ? ABSOLUTE_READ_DIFFERENCE_THRESHOLD_IOS : ABSOLUTE_READ_DIFFERENCE_THRESHOLD_DEFAULT;

    const similarity = calculateSimilarity(normalizedTargetVerseText, bufferPortionToCompare);

    // 매칭 성공 시에만 다음 절로 진행
    const isLengthSufficientByRatio = bufferPortionToCompare.length >= normalizedTargetVerseText.length * minLengthRatio;
    const isLengthSufficientByAbsoluteDiff = (normalizedTargetVerseText.length - bufferPortionToCompare.length) <= absDiffThreshold && bufferPortionToCompare.length > 0;

    const platform = isIOS ? 'iOS' : 'Default';
    console.log(`[App.tsx] [${platform}] Matching Details - Sim: ${similarity.toFixed(1)} (>${similarityThreshold}), LenRatio: ${isLengthSufficientByRatio}, AbsDiff: ${isLengthSufficientByAbsoluteDiff}`);
    console.log(`[App.tsx] Comparing Buffer: \"${bufferPortionToCompare}\" with Target: \"${normalizedTargetVerseText}\"`);

    // 구절 전체에 어려운 단어가 포함되어 있는지 확인
    const verseHasDifficultWord = containsDifficultWord(normalizedTargetVerseText);
    
    // 어려운 단어가 포함된 구절은 유사도 기준을 더 낮추어 주기 (특히 외래어가 많은 구절)
    // 유사도 기준을 20% 낮춰서 30% 정도만 되어도 통과할 수 있게 함
    const adjustedSimilarityThreshold = verseHasDifficultWord ? (similarityThreshold - 20) : similarityThreshold;
    
    if (verseHasDifficultWord) {
      console.log(`[App.tsx] Verse contains difficult word(s). Lowering similarity threshold to ${adjustedSimilarityThreshold}.`);
    }
    
    let isMatch = similarity >= adjustedSimilarityThreshold && (isLengthSufficientByRatio || isLengthSufficientByAbsoluteDiff);

    // iOS 긴 구절에 대한 추가 검증 로직
    if (isIOS && isMatch && normalizedTargetVerseText.length > LONG_VERSE_CHAR_COUNT) {
      const targetEnd = normalizedTargetVerseText.slice(-END_PORTION_LENGTH);
      const bufferEnd = bufferPortionToCompare.slice(-END_PORTION_LENGTH);
      const endSimilarity = calculateSimilarity(targetEnd, bufferEnd);

      console.log(`[App.tsx] [iOS Long Verse] End-portion check. Similarity: ${endSimilarity.toFixed(1)}`);

      if (endSimilarity < 60) { // 끝부분 유사도가 60 미만이면, 아직 다 안읽은 것으로 간주
        // 단, 끝부분에 발음이 어려운 단어가 포함된 경우는 예외적으로 통과시켜준다.
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
      
      // iOS에서는 구절 전환 시 딜레이를 적용하여 사용자가 구절을 다 읽을 시간을 주고 이전 구절의 인식 결과가 잘 정리되도록 함
      const transitionDelay = isIOS ? 600 : 0; // iOS에서는 0.6초 딜레이 (최적 밸런스)
      
      if (isIOS) {
        console.log('[App.tsx] iOS detected - adding 0.6 second delay before verse transition');
      }
      
      setTimeout(() => {
        setMatchedVersesContentForSession(prev => prev + `${currentTargetVerseForSession.book} ${currentTargetVerseForSession.chapter}:${currentTargetVerseForSession.verse} - ${currentTargetVerseForSession.text}\n`);
        
        // 구절 일치 시 음성 인식 텍스트 초기화 (특히 iOS에서 이전 인식 결과가 남는 문제 해결)
        console.log('[App.tsx] Starting transcript reset process after verse match');
        setTranscriptBuffer('');
        
        // 음성 인식 초기화를 위해 약간의 지연 후 resetTranscript 호출
        // 이는 현재 진행 중인 인식 처리가 완료되고 다음 구절을 준비할 시간을 주기 위함
        setTimeout(() => {
          resetTranscript();
          console.log('[App.tsx] Forced transcript reset after verse match');
        }, 50);
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

        const certMsg = `${firstVerseActuallyReadInSession.book} ${firstVerseActuallyReadInSession.chapter}장 ${firstVerseActuallyReadInSession.verse}절 ~ ${lastVerseOfSession.book} ${lastVerseOfSession.chapter}장 ${lastVerseOfSession.verse}절 (총 ${versesReadCountThisSession}절) 읽기 완료!`;
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
                
                // 해당 장의 마지막 절을 찾습니다
                const bookInfo = AVAILABLE_BOOKS.find(b => b.name === book);
                if (!bookInfo) return false;
                
                // 해당 장의 마지막 절 번호를 가져옵니다
                const lastVerseNumber = bookInfo.versesPerChapter[chapter - 1] || 0;
                
                // 이 세션에서 읽은 절들 중에 해당 장의 마지막 절이 있는지 확인합니다
                return actuallyReadVersesInSession.some(readVerse => 
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
         // 자동 저장 기능 추가: 한 절을 완료할 때마다 진행 상황 저장
         if (currentUser && userOverallProgress) {
           // 현재까지 읽은 절 정보 저장
           const lastCompletedVerse = sessionTargetVerses[currentVerseIndexInSession];
           
           // 진행 상황 업데이트
           const updatedProgress: UserProgress = {
             ...userOverallProgress,
             lastReadBook: lastCompletedVerse.book,
             lastReadChapter: lastCompletedVerse.chapter,
             lastReadVerse: lastCompletedVerse.verse
           };
           
           // 서버에 저장
           console.log('[App.tsx] Auto-saving progress after completing verse:', 
             `${lastCompletedVerse.book} ${lastCompletedVerse.chapter}:${lastCompletedVerse.verse}`);
           progressService.saveUserProgress(currentUser.username, updatedProgress)
             .then(() => {
               // 로컬 상태 업데이트
               setUserOverallProgress(updatedProgress);
             })
             .catch(err => {
               console.error('[App.tsx] Error auto-saving progress:', err);
             });
         }
                  // 다음 절로 이동 및 음성 인식 초기화를 먼저 수행 (데이터베이스 업데이트와 독립적으로 진행)
          console.log('[App.tsx] Moving to next verse and resetting recognition BEFORE database update completes');
          setCurrentVerseIndexInSession(prevIdx => prevIdx + 1); // 다음 절로 이동
          
          // 음성 인식 초기화를 데이터베이스 업데이트보다 먼저 실행
          // 이는 현재 진행 중인 인식 처리가 완료되고 다음 구절을 준비할 시간을 주기 위함
          setTranscriptBuffer(''); // Clear buffer for next verse
          
          // iOS와 일반 기기에 대한 초기화 로직 개선
          // 음성 인식 초기화를 위한 더 확실한 방법 사용
          console.log('[App.tsx] Forcing recognition reset for next verse');
          resetTranscript(); // 트랜스크립트 초기화 (개선된 resetTranscript 함수 사용)
          
          // iOS에서는 추가적인 조치 필요
          if (isIOS) {
            console.log('[App.tsx] iOS - Additional reset measures for next verse');
            // 잠시 후 다시 시작하는 메커니즘 사용
            setTimeout(() => {
              stopListening(); // 음성 인식 중지
              setIsRetryingVerse(true); // 이 플래그가 useEffect에서 마이크를 다시 켤 수 있도록 함
            }, 100);
          }
      }
    }
    // 매칭 실패 시 인덱스 증가/세션 종료 없음
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptBuffer, readingState, currentTargetVerseForSession, currentUser, sessionTargetVerses, userOverallProgress]);

  useEffect(() => {
    if (sttError) {
      setAppError(`음성인식 오류: ${sttError}`);
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
      setReadingState(ReadingState.LISTENING);
      setCurrentVerseIndexInSession(initialSkip); // Start from the correct verse
      setMatchedVersesContentForSession('');
      setTranscriptBuffer('');
      resetTranscript();
      // startListening 함수는 useEffect에서 호출되도록 변경
      setSessionProgress({
        totalVersesInSession: verses.length,
        sessionCompletedVersesCount: initialSkip, // Pre-mark skipped verses as "completed" for progress bar
        sessionInitialSkipCount: initialSkip,
      });
      setSessionCertificationMessage(""); // Clear previous certification message
      setAppError(null); // Clear previous errors
    } else {
      setAppError('선택한 범위에 대한 성경 데이터를 찾을 수 없습니다.');
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
      const certMsg = `${firstEffectivelyReadVerse.book} ${firstEffectivelyReadVerse.chapter}장 ${firstEffectivelyReadVerse.verse}절 ~ ${lastEffectivelyReadVerse.book} ${lastEffectivelyReadVerse.chapter}장 ${lastEffectivelyReadVerse.verse}절 (총 ${versesActuallyReadThisSessionCount}절) 읽음 (세션 중지).`;
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
        const parts = bibleKey.match(/^(\D+)(\d+):(\d+)$/); // e.g., "창1:1" -> "창", "1", "1"
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
        // 이 장의 가장 큰 절 번호(마지막 절)를 찾습니다
        let lastVerseNumberInChapter = 0;
        for (const canonicalVerse of canonicalVersesForChapter) {
          if (canonicalVerse.verse > lastVerseNumberInChapter) {
            lastVerseNumberInChapter = canonicalVerse.verse;
          }
        }
        
        // 세션에서 읽은 구절 중 이 장의 마지막 절을 읽었는지 확인합니다
        const lastVerseWasRead = versesReadInSession.some(verse => 
          verse.book === chaptersTouchedInSession[chapterKeyFromSession].book && 
          verse.chapter === chaptersTouchedInSession[chapterKeyFromSession].chapterNum && 
          verse.verse === lastVerseNumberInChapter
        );
        
        if (lastVerseWasRead) {
          console.log(`마지막 절이 읽힘: ${chapterKeyFromSession}, 마지막 절: ${lastVerseNumberInChapter}`);
          newCompletedChaptersInSession.add(chapterKeyFromSession); // 장의 마지막 절을 읽었으므로 완료 처리
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
         setSessionCertificationMessage("이번 세션에서 읽은 구절이 없습니다.");
    } else {
        setSessionCertificationMessage("사용자 정보 오류 또는 읽은 구절 기록 오류.");
    }
    
    setReadingState(ReadingState.IDLE); 
    // Do not reset transcriptBuffer or matchedVersesContentForSession here
    // so user can see what they read before session was stopped, if they go back.
    // It will be cleared when a new session starts.
  };

  const handleRetryVerse = () => {
    // The hook now handles the complexities. We just need to signal the intent.
    setReadingState(ReadingState.LISTENING);
    // 지금까지 읽은 내용은 유지 (matchedVersesContentForSession 초기화 제거)
    setTranscriptBuffer(''); // 현재 입력 버퍼만 초기화
    setAppError(null);

    resetTranscript(); // STT 훅 내부의 이전 기록 초기화
    stopListening();
    setIsRetryingVerse(true);
  };

  const handleVerseSkip = () => {
    if (!currentTargetVerseForSession || readingState !== ReadingState.LISTENING) return;

    // 현재 구절 정보 가져오기
    const currentVerse = currentTargetVerseForSession;
    
    // 매치된 구절 목록에 추가 (건너뛰었다는 표시와 함께)
    setMatchedVersesContentForSession(prev => prev + `${currentVerse.book} ${currentVerse.chapter}:${currentVerse.verse} - [패스키] ${currentVerse.text}\n`);
    
    // 세션 진행 상황 업데이트 (완료된 구절 카운트 증가)
    const newTotalCompletedInSelection = currentVerseIndexInSession + 1;
    setSessionProgress(prev => ({
      ...prev,
      sessionCompletedVersesCount: newTotalCompletedInSelection,
    }));

    // 마지막 구절인지 확인
    if (currentVerseIndexInSession >= sessionTargetVerses.length - 1) {
      // 세션 완료 처리
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
      
      // 진행 상황 저장 처리 (handleStopReadingAndSave 호출)
      handleStopReadingAndSave();
    } else {
      // 다음 구절로 이동
      setCurrentVerseIndexInSession(prevIndex => prevIndex + 1);
      
      // 다음 구절에 대한 이미지 로드
      const nextVerseIndex = currentVerseIndexInSession + 1;
      if (nextVerseIndex < sessionTargetVerses.length) {
        const nextVerse = sessionTargetVerses[nextVerseIndex];
        loadBibleImage(nextVerse);
      }
    }
  };

  useEffect(() => {
    console.log(`[App.tsx] Verse index changed to: ${currentVerseIndexInSession}, total verses: ${sessionTargetVerses.length}. Reading session verse change effect`);
    
    // Ignore if not in reading mode
    if (readingState !== ReadingState.LISTENING) return;
    
    // 아멘 프롬프트 초기화 (구절이 바뀔 때마다 초기화)
    setShowAmenPrompt(false);
    console.log('[App.tsx] 구절 전환 - 아멘 프롬프트 초기화');
    
    // 현재 구절에 맞는 성경 이미지 로드
    loadBibleImage(currentTargetVerseForSession);
    
    // Clear any existing timeout to prevent duplicate timeouts
    if (verseTimeoutId) {
      clearTimeout(verseTimeoutId);
      setVerseTimeoutId(null);
    }
    
    // 모든 플랫폼에서 구절 전환 시간 마킹
    markVerseTransition();
    console.log(`[App] Marked verse transition for verse ${currentVerseIndexInSession}`);
    
    // iOS에서는 구절 변경 시 인식 엔진을 명시적으로 재시작하여 이전 구절의 인식 버퍼 초기화
    if (isIOS) {
      // iOS에서만 특별 처리 - 구절 변경 시 인식 중이면 명시적 재시작으로 버퍼 초기화
      console.log(`[App] iOS verse change special handling for verse ${currentVerseIndexInSession}`);
      setIsRestartingForNextVerseOnIOS(true);
      
      // 음성 인식 중인 경우에만 처리
      if (isListening) {
        console.log('[App] iOS is listening, stopping recognition for verse change');
        // 1. 현재 음성 인식 중지
        stopListening();
        
        // 2. 트랜스크립트 초기화
        resetTranscript();
        
        // 3. 300ms 후 음성 인식 재시작 (버퍼가 완전히 지워질 시간 필요)
        const timeoutId = setTimeout(() => {
          console.log('[App] iOS restarting recognition after verse change');
          startListening();
          setIsRestartingForNextVerseOnIOS(false);
        }, 300);
        
        setVerseTimeoutId(timeoutId);
      } else {
        // 듣고 있지 않은 경우 즉시 플래그 해제
        setIsRestartingForNextVerseOnIOS(false);
      }
    } else {
      // iOS가 아닌 경우 단순히 트랜스크립트만 초기화
      resetTranscript();
    }
    
    // 현재 구절에 어려운 단어가 포함되어 있는지 확인하는 함수
  const checkForDifficultWords = (verse: BibleVerse | null) => {
    if (!verse) return false;

    const verseText = verse.text;
    // utils.ts의 containsDifficultWord 함수 사용
    const hasDifficult = containsDifficultWord(verseText);
    if (hasDifficult) {
      console.log(`[App.tsx] 구절에 어려운 단어가 포함되어 있습니다`);
    }
    return hasDifficult;
  };
  
  // 성경 이미지 로드 함수는 파일 상단에 한 번만 정의됨
  
  // 현재 구절이 변경될 때 이미지 로드
  useEffect(() => {
    if (currentTargetVerseForSession) {
      console.log('[App.tsx] 현재 구절이 변경되어 이미지를 로드합니다:', currentTargetVerseForSession);
      loadBibleImage(currentTargetVerseForSession);
      setShowBibleImage(true); // 기본적으로 이미지 표시
    }
  }, [currentTargetVerseForSession]);
  
  // 현재 구절에 어려운 단어가 있는지 확인
  const difficultWordsCheck = checkForDifficultWords(currentTargetVerseForSession);
  
  // 상태 변수 업데이트 (렌더링에 사용되는 상태 변수)
  useEffect(() => {
    setHasDifficultWords(difficultWordsCheck);
    console.log('[App.tsx] 어려운 단어 확인 결과:', difficultWordsCheck);
  }, [currentVerseIndexInSession, difficultWordsCheck]);
    
    // 구절이 시작될 때 타이머 시작 (어려운 단어가 있는 구절에만 타이머 적용)
    if (readingState === ReadingState.LISTENING && difficultWordsCheck) {
      setVerseStartTime(Date.now());
      
      // 15초 후에 아멘 프롬프트 표시
      const timeoutId = setTimeout(() => {
        setShowAmenPrompt(true);
        console.log('[App.tsx] 15초 경과 - 아멘 프롬프트 표시');
      }, 15000); // 15초로 단축
      
      setVerseTimeoutId(timeoutId);
    }
  }, [currentVerseIndexInSession, readingState, isIOS]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 py-8 px-4 flex flex-col items-center justify-center">
        <header className="mb-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-500 drop-shadow-lg mb-2">
            말씀 여정에 함께해요
          </h1>
          <div className="text-base sm:text-lg text-gray-600 font-serif mb-2">Bible Journey Challenge</div>
        </header>
        <AuthForm onAuth={handleAuth} onRegister={handleRegister} title="로그인 또는 사용자 등록" />
        {appError && <p className="mt-4 text-red-500">{appError}</p>}

        {userOverallProgress && (userOverallProgress.lastReadChapter > 0 || userOverallProgress.lastReadVerse > 0) && readingState === ReadingState.IDLE && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
                마지막 읽은 곳: {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}장 {userOverallProgress.lastReadVerse}절.
                <span className="italic ml-2">(아래에서 이어서 읽거나 새로운 범위를 선택하여 읽으세요.)</span>
            </div>
        )}

        {(appError && (readingState === ReadingState.ERROR || readingState === ReadingState.IDLE || readingState === ReadingState.SESSION_COMPLETED || readingState === ReadingState.LISTENING)) && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            <p className="font-semibold">오류 발생:</p>
            <p>{appError}</p>
          </div>
        )}
        
        {!browserSupportsSpeechRecognition && (
             <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md">
                <p className="font-semibold">음성 인식 미지원:</p>
                <p>현재 사용 중인 브라우저에서는 음성 인식 기능을 지원하지 않습니다. Chrome, Edge, Safari 최신 버전을 사용해 주세요.</p>
            </div>
        )}
      </div>
    );
  } // End of if (!currentUser)

  // Main application view when currentUser is defined
  return (
    <div className="container mx-auto p-4 max-w-4xl bg-amber-50 shadow-lg rounded-lg">
      {currentUser && (currentUser as User).must_change_password && showPasswordChangePrompt && (
        // This condition ensures the form only shows if needed and explicitly triggered
        // We might want a separate state like `isPasswordChangeModalOpen` for better control
        // For now, piggybacking on showPasswordChangePrompt for simplicity
        // The password change form JSX starts directly below:
        <div className="p-4 mb-4 text-sm text-orange-700 bg-orange-100 rounded-lg border border-orange-300 shadow-md" role="alert">
          <h3 className="font-bold text-lg mb-2">비밀번호 변경 필요</h3>
          <p className="mb-1">
            현재 임시 비밀번호(1234)를 사용하고 있습니다. 보안을 위해 즉시 새 비밀번호를 설정해주세요.
          </p>
          <form onSubmit={handlePasswordChangeSubmit} className="mt-3 space-y-3">
            <div>
              <label htmlFor="newPassword" className="block text-xs font-medium text-orange-800">새 비밀번호:</label>
              <input 
                type="password" 
                id="newPassword" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400"
                placeholder="새 비밀번호 입력"
              />
            </div>
            <div>
              <label htmlFor="confirmNewPassword" className="block text-xs font-medium text-orange-800">새 비밀번호 확인:</label>
              <input 
                type="password" 
                id="confirmNewPassword" 
                value={confirmNewPassword} 
                onChange={(e) => setConfirmNewPassword(e.target.value)} 
                className="mt-0.5 block w-full px-2 py-1 text-xs text-orange-900 bg-orange-50 border border-orange-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 placeholder-orange-400"
                placeholder="새 비밀번호 다시 입력"
              />
            </div>
            {passwordChangeError && <p className="text-xs text-red-600">{passwordChangeError}</p>}
            {passwordChangeSuccess && <p className="text-xs text-green-600">{passwordChangeSuccess}</p>}
            <div className="flex items-center justify-between">
              <button 
                type="submit" 
                className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
              >
                비밀번호 변경하기
              </button>
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
                나중에 변경
              </button>
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
                <h3 className="text-lg font-semibold text-sky-700 mb-2">성경 전체 완독 진행률</h3>
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
                  {overallCompletedChaptersCount} / {totalBibleChapters} 장 완독
                </p>
              </div>
            )}

            {/* Continue Reading Section */}
            <div className="my-4 p-4 bg-blue-50 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-blue-700">이어 읽기</h3>
              {userOverallProgress && userOverallProgress.lastReadBook ? (
                <p className="text-sm text-gray-600">
                  마지막 읽은 곳: {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}장 {userOverallProgress.lastReadVerse}절.
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  아직 읽기 기록이 없습니다. 아래에서 시작할 부분을 선택하세요.
                </p>
              )}
              {userOverallProgress && userOverallProgress.lastReadBook && selectedBookForSelector && (
                <p className="text-sm text-gray-500 mt-1">
                  추천 시작: {selectedBookForSelector} {startChapterForSelector}장 {startVerseForSelector}절. (아래에서 변경 가능)
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
    {/* 권별 완독 현황 보기 버튼 */}
    {/* 권별 완독 현황 보기 버튼 및 내용 */}
    <button
      onClick={() => setShowBookCompletionStatus(!showBookCompletionStatus)}
      className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-blue-300 to-sky-300 text-white rounded-2xl shadow-lg border border-blue-200 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      <span className="text-2xl mr-1">📚</span>
      {showBookCompletionStatus ? '권별 완독 현황 숨기기' : '권별 완독 현황 보기'}
    </button>
    {currentUser && userOverallProgress && showBookCompletionStatus && (
      <BookCompletionStatus 
        userProgress={userOverallProgress} 
        availableBooks={AVAILABLE_BOOKS} 
      />
    )}

    {/* 함께 걷는 여정 버튼 및 내용 */}
    <button
      onClick={() => setCurrentView(currentView === 'LEADERBOARD' ? 'IDLE_SETUP' : 'LEADERBOARD')}
      className={`w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-purple-500 via-fuchsia-400 to-pink-300 text-white rounded-2xl shadow-lg border border-purple-200 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 ${currentView === 'LEADERBOARD' ? 'ring-2 ring-fuchsia-400' : ''}`}
    >
      <span className="text-2xl mr-1">👣</span>
      {currentView === 'LEADERBOARD' ? '함께 걷는 여정 숨기기' : '함께 걷는 여정 보기'}
    </button>
    {readingState === ReadingState.IDLE && currentView === 'LEADERBOARD' && (
      <div className="my-4 p-4 bg-gray-50 rounded-lg shadow w-full">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">👣 함께 걷는 말씀의 발자취</h3>
        <Leaderboard key={userOverallProgress ? `lb-${userOverallProgress.lastReadBook}-${userOverallProgress.lastReadChapter}-${userOverallProgress.lastReadVerse}` : 'lb-no-progress'} />
      </div>
    )}
    {/* 명예의 전당 전체 보기 버튼 (아래로 이동) */}
    <button
      onClick={() => setShowHallOfFame(true)}
      className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 text-amber-900 rounded-2xl shadow-xl border-2 border-yellow-300 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-300 drop-shadow-glow"
      style={{ boxShadow: '0 0 16px 2px #ffe06655' }}
    >
      <span className="text-2xl mr-1">👑</span>
      명예의 전당
    </button>
    {/* 다시 시작 버튼: 완독자+100%만 노출 */}
    {(currentUser && (currentUser as any).completed_count > 0) && overallCompletedChaptersCount === totalBibleChapters && (
      <button
        disabled={bibleResetLoading}
        onClick={async () => {
          if (!window.confirm('정말로 다시 말씀 여정을 시작하시겠습니까?\n완독 횟수가 증가하고, 모든 진행률이 초기화됩니다.')) return;
          setBibleResetLoading(true);
          try {
            const res = await fetch('/api/bible-reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id }),
            });
            const data = await res.json();
            if (data.success) {
              alert(`다시 시작되었습니다! (완독 횟수: ${data.round})`);
              window.location.reload();
            } else {
              alert('오류: ' + (data.error || '진행에 실패했습니다.'));
            }
          } catch (e) {
            alert('서버 오류: 다시 시도해 주세요.');
          } finally {
            setBibleResetLoading(false);
          }
        }}
        className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-white via-yellow-100 to-yellow-200 text-amber-700 rounded-2xl border-2 border-amber-300 shadow-xl mt-1 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-300 drop-shadow-glow disabled:opacity-60"
        style={{ boxShadow: '0 0 14px 2px #ffe06644' }}
      >
        <span className="text-2xl mr-1">⟳</span>
        {bibleResetLoading ? '⏳ 진행 중...' : '다시 말씀 여정 시작하기'}
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
              <h2 className="text-xl font-bold mb-2">선택한 범위의 성경 본문</h2>
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
                ← 뒤로가기
              </button>
              <button
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
                onClick={() => setReadingState(ReadingState.LISTENING)}
              >
                음성 인식 시작
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
                  <p className="text-sm text-gray-500">다음 구절 읽기:</p>
                  {currentTargetVerseForSession && (
                    <p className="text-md font-semibold text-indigo-700">
                      {currentTargetVerseForSession.book} {currentTargetVerseForSession.chapter}:{currentTargetVerseForSession.verse}
                    </p>
                  )}
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  {/* 성경 이미지와 텍스트 함께 표시 */}
                  <div className="flex flex-col mb-3">
                    {/* 이미지 표시 섹션 */}
                    {currentBibleImage && showBibleImage && (
                      <div className="mb-3">
                        <div className="relative w-full max-h-[300px] overflow-hidden rounded-lg shadow-md mb-2">
                          <img 
                            key={`${currentBibleImage}-${Date.now()}`} 
                            src={currentBibleImage} 
                            alt={currentBibleImageTitle || '성경 이미지'} 
                            className="w-full object-contain"
                            style={{ maxHeight: '300px' }}
                            onError={(e) => {
                              console.error('[App.tsx] 이미지 로드 오류:', e);
                              console.log('이미지 경로:', currentBibleImage);
                              setImageLoadStatus('error');
                            }}
                            onLoad={() => {
                              console.log('[App.tsx] 이미지 성공적으로 로드됨:', currentBibleImage);
                              setImageLoadStatus('success');
                            }}
                          />
                        </div>
                        {currentBibleImageTitle && (
                          <p className="text-xs text-center text-gray-500 italic">{currentBibleImageTitle}</p>
                        )}
                        
                        {/* 이미지 로드 상태 표시 - 로딩중이거나 오류일 때만 표시 */}
                        {(imageLoadStatus === 'loading' || imageLoadStatus === 'error') && (
                          <div className="text-center text-sm mt-2">
                            {imageLoadStatus === 'loading' && <span className="text-blue-500">이미지 로딩 중...</span>}
                            {imageLoadStatus === 'error' && <span className="text-red-500">이미지 로드 실패</span>}
                          </div>
                        )}
                        

                      </div>
                    )}
                    

                    
                    {/* 이미지 표시/숨김 토글 버튼 - 이미지가 있을 때만 표시 */}
                    {currentBibleImage && (
                      <div className="flex justify-end mb-2">
                        <button 
                          onClick={() => setShowBibleImage(!showBibleImage)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-300 transition-colors"
                        >
                          {showBibleImage ? '이미지 숨기기' : '이미지 보기'}
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* 성경 구절 텍스트 */}
                  <p className="text-xl font-semibold text-black leading-loose">
                    {currentTargetVerseForSession ? currentTargetVerseForSession.text : "읽기 목표 없음"}
                  </p>
                  
                  {/* 아멘 프롬프트 */}
                  {showAmenPrompt && hasDifficultWords && (
                    <div className="mt-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-md animate-pulse">
                      <p className="font-bold text-center">인식이 어려워요!</p>
                      <p className="text-sm text-center">"아멘"을 외치시면 다음 구절로 넘어갑니다</p>
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
                    중지
                  </button>
                  <button
                    className="px-8 py-2 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 transition shadow-md"
                    onClick={handleRetryVerse}
                  >
                    다시 읽기
                  </button>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm text-gray-500">인식된 음성:</p>
                <p className="text-md text-gray-700 min-h-[2.5em] p-2 bg-gray-100 rounded-md border">
                  {sttTranscript || <span className="text-gray-400 italic">듣고 있습니다...</span>}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">지금까지 읽은 내용:</p>
                <div className="text-sm text-gray-600 whitespace-pre-wrap p-2 bg-gray-50 rounded-md border max-h-40 overflow-y-auto">
                  {matchedVersesContentForSession || <span className="text-gray-400 italic">아직 읽은 구절이 없습니다.</span>}
                </div>
              </div>
            </div>

            {readingState === ReadingState.LISTENING && (
              <p className="mt-3 text-xs text-center text-gray-600">※ 각 절을 읽을 때마다 자동으로 진행 상황이 저장됩니다. 읽기를 중단하려면 '중지' 버튼을 누르세요.</p>
            )}
            {readingState === ReadingState.SESSION_COMPLETED && (
              <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 text-center p-6 bg-green-100 border-2 border-green-600 rounded-lg shadow-xl max-w-md w-11/12">
                <h2 className="text-2xl font-bold text-green-700 mb-3">이번 세션 읽기 완료!</h2>
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
                  다른 범위 읽기 또는 랭킹 보기
                </button>
              </div>
            )}
          </>
        )}
        
        <footer className="mt-12 pt-6 border-t border-gray-300 text-center text-xs sm:text-sm text-gray-500">
        <div className="mt-10 text-center text-xs text-gray-400 font-sans select-none">
      <div className="mb-1">포도나무교회 &nbsp;|&nbsp; Dev: 이종림 &nbsp;|&nbsp; <a href="mailto:luxual8@gmail.com" className="underline hover:text-amber-700">문의 및 개선사항</a></div>
      <div className="mb-1">Copyright © 2025 이종림. All rights reserved.</div>
      <div className="italic text-[11px] text-gray-300">음성 인식 정확도를 위해 조용한 환경을 권장합니다.</div>
      <div className="italic text-[11px] text-gray-300">iPhone 12 이하: Chrome 브라우저 권장 / iPhone 13 이상: Safari 브라우저 권장</div>
      </div>
        </footer>
      </div>
  );
}; 

export default App;
