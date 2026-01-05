import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ISpeechRecognition,
  ISpeechRecognitionEvent,
  ISpeechRecognitionErrorEvent,
  ISpeechRecognitionStatic
} from '../types';

const getSpeechRecognition = (): ISpeechRecognitionStatic | undefined => {
  const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SpeechRecognitionConstructor;
};

interface UseSpeechRecognitionOptions {
  lang?: string;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  browserSupportsSpeechRecognition: boolean;
  resetTranscript: () => void;
  markVerseTransition: () => void; // 援ъ젅 ?꾪솚 ?쒓컙???쒖떆?섎뒗 ?⑥닔 異붽?
}

const useSpeechRecognition = (options?: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn => {
  const SpeechRecognitionAPI = getSpeechRecognition();
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const browserSupportsSpeechRecognition = !!SpeechRecognitionAPI;
  const lang = options?.lang || 'ko-KR';

  // iOS 湲곌린 媛먯?
  const isIOS = useMemo(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }, []);

  // This ref will track if the stop was initiated by the user/app logic.
  const intentionalStopRef = useRef(false);

  // iOS 湲곌린?먯꽌留??ъ슜??理쒖쥌 ?몃옖?ㅽ겕由쏀듃? ?댁쟾 ?꾩떆 寃곌낵瑜???ν븷 ref
  const finalTranscriptRef = useRef('');
  const lastInterimRef = useRef('');

  // iOS?먯꽌 ??蹂寃?????쾶 ?꾩갑?섎뒗 ?몄떇 寃곌낵瑜?臾댁떆?섍린 ?꾪븳 ?뚮옒洹?  const ignoreResultsRef = useRef(false);

  // iOS?먯꽌 ?몄떇 以묐떒 臾몄젣瑜?異붿쟻?섍린 ?꾪븳 ?붾쾭洹???꾩뒪?쒗봽
  const lastRecognitionEventTimeRef = useRef(Date.now());

  // 援ъ젅 ?꾪솚 ?쒓컙??異붿쟻?섏뿬 ?ㅻ옒??寃곌낵 臾댁떆
  const verseTransitionTimeRef = useRef(Date.now());

  // 留덉?留됱쑝濡?泥섎━??寃곌낵??ID瑜?異붿쟻?섏뿬 以묐났 泥섎━ 諛⑹?
  const lastProcessedResultIdRef = useRef<string>('');

  // iOS?먯꽌 寃곌낵 ?쒖떆???섎룄?곸씤 ?쒕젅?대? 二쇨린 ?꾪븳 ??대㉧ 愿由?  const delayedResultTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 吏?곕맂 ?쒖떆瑜??꾪븳 寃곌낵 媛????  const pendingFinalResultRef = useRef<string>('');
  const pendingInterimResultRef = useRef<string>('');

  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setError('??釉뚮씪?곗??먯꽌???뚯꽦 ?몄떇??吏?먰븯吏 ?딆뒿?덈떎.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      console.log('[useSpeechRecognition] onstart event fired');
      setIsListening(true);
      intentionalStopRef.current = false;
      lastRecognitionEventTimeRef.current = Date.now();
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      // 1. 寃곌낵 臾댁떆 ?뚮옒洹?泥댄겕 (援ъ젅 ?꾪솚 吏곹썑 ??
      if (ignoreResultsRef.current) {
        console.log('[useSpeechRecognition] Result ignored');
        return;
      }

      lastRecognitionEventTimeRef.current = Date.now();

      // iOS? Android??泥섎━ 諛⑹떇???꾩쟾??遺꾨━?섏뿬 媛곴컖??釉뚮씪?곗? ?뱀꽦?????      if (isIOS) {
        // iOS Safari: Incremental 寃곌낵瑜??섎룞?쇰줈 ?꾩쟻?댁빞 ??        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (finalTranscript) {
          finalTranscriptRef.current += finalTranscript;
        }

        const totalText = finalTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : '');
        setTranscript(totalText);
      } else {
        // Android Chrome ?? ?遺遺꾩쓽 ??釉뚮씪?곗???event.results???꾩껜 ?몄뀡 ?띿뒪?몃? ?꾩쟻?쇰줈 ?댁븘??以?
        // ?곕씪??紐⑤뱺 ?몃뜳?ㅻ? ?⑹튂硫?以묐났??諛쒖깮??(?섎굹?섏쓽?섎굹?섏쓽...).
        // 媛??留덉?留??몃뜳?ㅼ쓽 ?띿뒪?멸? ?꾩옱源뚯? ?몄떇??"?꾩껜 臾몄옣"??寃쎌슦媛 留롮쑝誘濡??닿쾬留?痍⑦븿.
        if (event.results.length > 0) {
          const lastResultText = event.results[event.results.length - 1][0].transcript;
          setTranscript(lastResultText);
          console.log('[useSpeechRecognition] Android Cumulative Result:', lastResultText);
        }
      }

      setError(null);
    };


    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error, event.message);

      let specificError = `?ㅻ쪟: ${event.error}`;
      if (event.error === 'no-speech') specificError = '?뚯꽦??媛먯??섏? ?딆븯?듬땲??';
      else if (event.error === 'audio-capture') specificError = '留덉씠?щ? 李얠쓣 ???놁뒿?덈떎.';
      else if (event.error === 'not-allowed') specificError = '留덉씠???ъ슜??李⑤떒?섏뿀?듬땲??';
      else if (event.error === 'network') specificError = '?ㅽ듃?뚰겕 ?ㅻ쪟?낅땲??';

      setError(specificError);
    };

    recognition.onend = () => {
      console.log('[useSpeechRecognition] onend fired');


      // iOS?먯꽌 留덉?留??몄떇 ?대깽?몄? ?꾩옱 ?쒓컙??李⑥씠 怨꾩궛
      const timeSinceLastEvent = Date.now() - lastRecognitionEventTimeRef.current;
      console.log(`[useSpeechRecognition] Time since last event: ${timeSinceLastEvent}ms`);

      // Check if the stoppage was intentional.
      if (intentionalStopRef.current) {
        console.log('[useSpeechRecognition] Intentional stop detected, not restarting');
        // Reset the flag for future use.
        intentionalStopRef.current = false;
        // Update the listening state.
        setIsListening(false);
        return;
      }

      if (recognitionRef.current) {
        // If it was NOT intentional (e.g., pause in speech, browser timeout),
        // and we still have a recognition instance, try to restart it.
        console.log('[useSpeechRecognition] Unintentional stop, attempting to restart');

        // Preserve the current transcript before restarting
        const currentTranscript = transcript;

        // Small delay before restarting to prevent rapid restarts
        setTimeout(() => {
          if (recognitionRef.current) {
            try {
              // For both iOS and Android, handle restart
              if (isIOS) {
                finalTranscriptRef.current = currentTranscript;
                console.log('[useSpeechRecognition] iOS - Restarting. Saved:', currentTranscript);
              } else {
                // Android???ъ떆????釉뚮씪?곗? 踰꾪띁媛 鍮꾩썙吏誘濡?
                // ?댁쟾 ?몄뀡 ?댁슜??finalTranscriptRef??諛깆뾽?대몢怨?onresult?먯꽌 ?⑹퀜?????섎룄 ?덉쓬.
                // ?섏?留??꾩옱 以묐났???ы븯誘濡??쇰떒 Android??臾댁“嫄??덈줈 ?쒖옉?섎룄濡???
                finalTranscriptRef.current = '';
              }

              recognitionRef.current.start();

              // For Android, we need to restore the transcript after restart
              if (!isIOS && currentTranscript) {
                setTimeout(() => {
                  setTranscript(currentTranscript);
                  console.log('[useSpeechRecognition] Android - Restored transcript after restart');
                }, 100);
              }

            } catch (e) {
              console.error('Error restarting speech recognition:', e);
              setIsListening(false);
            }
          }
        }, 100); // Small delay to prevent rapid restarts
      }
    };

    // Cleanup function for when the component unmounts.
    return () => {
      if (recognitionRef.current) {
        intentionalStopRef.current = true; // Ensure no restart on unmount
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [lang, browserSupportsSpeechRecognition, SpeechRecognitionAPI]);

  const startListening = useCallback(async () => {
    if (isListening || !recognitionRef.current) {
      console.log('[useSpeechRecognition] Already listening or recognition not initialized');
      return;
    }

    try {
      console.log('[useSpeechRecognition] startListening called');
      // Mark that we are not stopping intentionally.
      intentionalStopRef.current = false;
      // 留덉?留??대깽???쒓컙 珥덇린??      lastRecognitionEventTimeRef.current = Date.now();

      // Ensure Secure Context for Microphone access
      if (window.isSecureContext === false) {
        console.warn('[useSpeechRecognition] Accessing microphone in a non-secure context. This will likely fail on mobile.');
      }

      // Explicitly request microphone permission before starting recognition
      // This is often required for the first interaction on many mobile browsers
      try {
        console.log('[useSpeechRecognition] Requesting microphone permission via getUserMedia');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately release the stream after permission check to let SpeechRecognition take over
        stream.getTracks().forEach(track => track.stop());
        console.log('[useSpeechRecognition] Microphone permission granted');
      } catch (permErr: any) {
        console.error('[useSpeechRecognition] Microphone permission denied or error:', permErr);
        setError(`留덉씠??沅뚰븳 ?ㅻ쪟: ${permErr.name === 'NotAllowedError' ? '沅뚰븳??嫄곕??섏뿀?듬땲?? ?ㅼ젙?먯꽌 留덉씠?щ? ?덉슜?댁＜?몄슂.' : permErr.message}`);
        setIsListening(false);
        return;
      }

      // Start the actual Speech Recognition
      recognitionRef.current.start();
      setIsListening(true);
      setError(null);
      console.log('[useSpeechRecognition] Speech recognition started successfully');

    } catch (e: any) {
      console.error('[useSpeechRecognition] Exception in startListening:', e);
      setError(`留덉씠???쒖옉 ?ㅻ쪟: ${e.message}`);
      setIsListening(false);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!isListening || !recognitionRef.current) {
      return;
    }
    try {
      // Mark that we ARE stopping intentionally.
      intentionalStopRef.current = true;
      // iOS 湲곌린?먯꽌留???蹂寃?????쾶 ?꾩갑?섎뒗 ?몄떇 寃곌낵瑜?臾댁떆?섍린 ?꾪빐 ?뚮옒洹??ㅼ젙
      if (isIOS) {
        ignoreResultsRef.current = true;
        console.log('[useSpeechRecognition] iOS - Stopping with ignoreResults=true');
      }
      recognitionRef.current.stop();
      // The onend event will handle setting isListening to false.
    } catch (e: any) {
      console.error('Error stopping speech recognition:', e);
      setError(`留덉씠??以묒? ?ㅻ쪟: ${e.message}`);
    }
  }, [isListening]);

  // 援ъ젅 ?꾪솚???쒖떆?섎뒗 ?⑥닔 - iOS?먯꽌 吏?곕맂 寃곌낵 臾몄젣 ?닿껐??  const markVerseTransition = useCallback(() => {
    // 援ъ젅 ?꾪솚 ?쒓컙 ?낅뜲?댄듃
    const now = Date.now();
    verseTransitionTimeRef.current = now;
    console.log(`[useSpeechRecognition] Verse transition marked at ${new Date(now).toISOString().substr(11, 12)}`);

    // iOS?먯꽌 留??밸퀎 泥섎━
    if (isIOS) {
      // ?댁쟾 援ъ젅?먯꽌 吏???묐떟???ㅻ뒗 臾몄젣瑜?諛⑹??섍린 ?꾪빐 ?좎떆媛?臾댁떆 ?뚮옒洹??ㅼ젙
      ignoreResultsRef.current = true;

      // ?대뼡 ?곹솴?먯꽌??0.4珥??꾩뿉??臾댁떆 ?댁젣 蹂댁옣
      setTimeout(() => {
        ignoreResultsRef.current = false;
        console.log('[useSpeechRecognition] iOS ignoreResults released by safety timeout');
      }, 400);

      // 吏??媛?ν븳 紐⑤뱺 ?몄떇 寃곌낵 ?곹깭 珥덇린??      setTranscript('');
      finalTranscriptRef.current = '';
      pendingFinalResultRef.current = '';
      pendingInterimResultRef.current = '';
      lastInterimRef.current = '';
      lastProcessedResultIdRef.current = '';

      // ?뚯꽦 ?몄떇 ?ъ떆??- 湲곗〈 ?몄떇 以묐떒 諛??ъ떆??      if (recognitionRef.current) {
        try {
          // 以묐났 ?ъ떆?묒쓣 留됯린 ?꾪빐 ?좎떆 ?섎룄??以묐떒?쇰줈 ?ㅼ젙
          intentionalStopRef.current = true;
          // abort()???대? 踰꾪띁瑜?利됱떆 ??젣??          recognitionRef.current.abort();
          console.log('[useSpeechRecognition] iOS recognition forcefully aborted for reset');
        } catch (e) {
          console.error('[useSpeechRecognition] Error aborting recognition:', e);
        }

        // ?ъ떆?묒쓣 ?꾪븳 吏㏃? 吏??        setTimeout(() => {
          if (isListening && recognitionRef.current) {
            try {
              intentionalStopRef.current = false;
              recognitionRef.current.start();
              console.log('[useSpeechRecognition] iOS recognition restarted after verse transition');
            } catch (error) {
              console.error('[useSpeechRecognition] Error restarting iOS recognition:', error);
            }
          }
        }, 150);
      }

      // ?좎떆 ???ㅼ떆 泥섎━ 媛?ν븯寃?(援ъ젅 ?꾪솚 吏곹썑 寃곌낵留??숈옉)
      setTimeout(() => {
        ignoreResultsRef.current = false;
        console.log('[useSpeechRecognition] ignoreResults released');
      }, 1000); // ?댁쟾 寃곌낵瑜??꾩쟾??踰꾨━湲??꾪빐 1珥덇컙 臾댁떆

      // ?댁쟾 寃곌낵???援щ텇???꾪빐 留덉?留?泥섎━??寃곌낵 ID 珥덇린??      lastProcessedResultIdRef.current = '';
    }
  }, [isIOS]);

  // ?뚯꽦 ?몄떇 ?띿뒪?몃? 媛뺤젣濡?珥덇린?뷀븯???⑥닔
  const resetTranscript = useCallback(() => {
    setTranscript('');

    // 紐⑤뱺 湲곌린?먯꽌 李몄“ 蹂??珥덇린??    finalTranscriptRef.current = '';
    lastInterimRef.current = '';
    ignoreResultsRef.current = true;

    // 援ъ젅 ?꾪솚 ?쒓컙 ?낅뜲?댄듃 (援ъ젅 ?꾪솚?쇰줈 媛꾩＜)
    verseTransitionTimeRef.current = Date.now();
    // ?꾩옱 ?몄떇??吏꾪뻾 以묒씠硫??좎떆 以묒??섍퀬 ?ㅼ떆 ?쒖옉?섏뿬 ?몄떇 寃곌낵瑜?珥덇린??    if (isListening && recognitionRef.current) {
      try {
        console.log('[useSpeechRecognition] Force resetting recognition by abort/start cycle');
        // 媛뺤젣 以묐떒 ??flag瑜?true濡??먯뼱 onend?먯꽌???먮룞 ?ъ떆??諛⑹?
        intentionalStopRef.current = true;
        // ?꾩옱 ?몄떇 利됱떆 以묐떒 (踰꾪띁 ?뚭눼)
        recognitionRef.current.abort();

        // ?띿뒪???곹깭 利됱떆 珥덇린??        setTranscript('');
        finalTranscriptRef.current = '';
        lastProcessedResultIdRef.current = '';
        ignoreResultsRef.current = true; // 由ъ뀑 以묒뿉??寃곌낵 臾댁떆

        // 援ъ젅 ?꾪솚 ?쒓컙 ?낅뜲?댄듃 (援ъ젅 ?꾪솚?쇰줈 媛꾩＜)
        verseTransitionTimeRef.current = Date.now();

        // ?좎떆 ???ㅼ떆 ?쒖옉
        setTimeout(() => {
          if (recognitionRef.current && isListening) {
            intentionalStopRef.current = false;
            try {
              recognitionRef.current.start();
              console.log('[useSpeechRecognition] Recognition restarted after reset');
            } catch (e) {
              console.error('[useSpeechRecognition] Error starting after reset:', e);
              setIsListening(false);
            }
          }

          // 由ъ뀑 ??寃곌낵瑜?諛쏄린 ?쒖옉???뚭퉴吏 異⑸텇??臾댁떆 湲곌컙 ?뺣낫
          setTimeout(() => {
            ignoreResultsRef.current = false;
            console.log('[useSpeechRecognition] ignoreResults released after reset');
          }, 400); // 350ms -> 400ms濡??곹뼢
        }, 300); // 250ms -> 300ms濡??곹뼢?섏뿬 ?붿쭊 ?덉젙???쒓컙 ?뺣낫
      } catch (e) {
        console.error('[useSpeechRecognition] Error during force reset:', e);
      }
    } else {
      // 由ъ뒪??以묒씠 ?꾨땺 ?뚮룄 ?뚮옒洹몃뒗 ?댁젣?섏뼱????      setTranscript('');
      finalTranscriptRef.current = '';
      ignoreResultsRef.current = false;
      lastInterimRef.current = ''; // lastInterimRef??珥덇린??      lastProcessedResultIdRef.current = ''; // lastProcessedResultIdRef??珥덇린??      verseTransitionTimeRef.current = Date.now(); // 援ъ젅 ?꾪솚 ?쒓컙 ?낅뜲?댄듃
      console.log('[useSpeechRecognition] Transcript reset (not listening)');
    }
  }, [isIOS, isListening]);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    resetTranscript,
    markVerseTransition,
  };
};

export default useSpeechRecognition;
