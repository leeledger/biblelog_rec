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
  abortListening: () => void; // 추가
  browserSupportsSpeechRecognition: boolean;
  resetTranscript: () => void;
  markVerseTransition: () => void;
  isStalled: boolean; // 추가: iOS에서 마이크가 비정상적으로 멈췄는지 여부
}

const useSpeechRecognition = (options?: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn => {
  const SpeechRecognitionAPI = getSpeechRecognition();
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStalled, setIsStalled] = useState(false); // 추가

  const browserSupportsSpeechRecognition = !!SpeechRecognitionAPI;
  const lang = options?.lang || 'ko-KR';

  const isIOS = useMemo(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }, []);

  const intentionalStopRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const lastRecognitionEventTimeRef = useRef(Date.now());
  const ignoreResultsRef = useRef(false);
  const restartCountRef = useRef(0); // 추가: 무한 루프 방지용
  const isAbortingRef = useRef(false); // 추가: abort으로 인한 onend인지 구분

  const updateTranscript = (newTranscript: string) => {
    setTranscript(newTranscript);
  };

  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setError('이 브라우저에서는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      console.log('[MIC-DEBUG] onstart - 마이크 시작됨');
      setIsListening(true);
      setIsStalled(false);
      intentionalStopRef.current = false;
      restartCountRef.current = 0;
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      if (ignoreResultsRef.current) return;
      lastRecognitionEventTimeRef.current = Date.now();
      setIsStalled(false);

      if (isIOS) {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interimTranscript += result[0].transcript;
        }
        if (finalTranscript) finalTranscriptRef.current += finalTranscript;
        updateTranscript(finalTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : ''));
      } else {
        if (event.results.length > 0) {
          updateTranscript(event.results[event.results.length - 1][0].transcript);
        }
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      console.error('STT Error:', event.error);
      if (intentionalStopRef.current) return;

      if (event.error === 'not-allowed') {
        setError('마이크 권한이 거부되었습니다.');
        setIsListening(false);
      } else if (isIOS && (event.error === 'audio-capture' || event.error === 'network')) {
        // iOS에서 흔히 발생하는 세션 끊김 오류
        setIsStalled(true);
      }
    };

    recognition.onend = () => {
      console.log('[useSpeechRecognition] onend');

      if (intentionalStopRef.current) {
        setIsListening(false);
        return;
      }

      // iOS 자동 재시작 전략: 딱 1번만 시도하고 안되면 유저에게 버튼 보여줌
      if (isIOS) {
        if (restartCountRef.current < 1) {
          restartCountRef.current += 1;
          console.log('[useSpeechRecognition] iOS auto-restart attempt 1');
          setTimeout(() => {
            if (recognitionRef.current && !intentionalStopRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.error('Restart failed', e);
                setIsStalled(true);
                setIsListening(false);
              }
            }
          }, 800); // 충분한 지연시간을 두어 OS가 자원을 정리할 시간을 줌
        } else {
          console.log('[useSpeechRecognition] iOS auto-restart failed once. Waiting for user.');
          setIsStalled(true);
          setIsListening(false);
        }
      } else {
        // Android: abort으로 인한 종료면 자동 재시작 안 함 (App.tsx에서 isRetryingVerse로 관리)
        if (isAbortingRef.current) {
          console.log('[MIC-DEBUG] Android onend - abort으로 인한 종료, 재시작 스킵');
          isAbortingRef.current = false;
          setIsListening(false);
          return;
        }
        // 자연스러운 종료일 때만 부드럽게 재시작
        console.log('[MIC-DEBUG] Android onend - 자연 종료, 100ms 후 재시작 시도');
        setTimeout(() => {
          if (recognitionRef.current && !intentionalStopRef.current) {
            try {
              console.log('[MIC-DEBUG] Android - 자동 재시작 실행');
              recognitionRef.current.start();
            } catch (e) {
              console.error('[MIC-DEBUG] Android - 자동 재시작 실패:', e);
              setIsListening(false);
            }
          }
        }, 100);
      }
    };

    return () => {
      if (recognitionRef.current) {
        intentionalStopRef.current = true;
        recognitionRef.current.abort();
      }
    };
  }, [lang, browserSupportsSpeechRecognition, isIOS]);

  const startListening = useCallback(() => {
    console.log('[MIC-DEBUG] startListening 호출됨');
    if (!recognitionRef.current) {
      console.log('[MIC-DEBUG] startListening - recognitionRef 없음');
      return;
    }
    try {
      intentionalStopRef.current = false;
      isAbortingRef.current = false;
      restartCountRef.current = 0;
      setIsStalled(false);
      console.log('[MIC-DEBUG] startListening - start() 호출 직전');
      recognitionRef.current.start();
      console.log('[MIC-DEBUG] startListening - start() 호출 완료');
    } catch (e) {
      console.error('[MIC-DEBUG] startListening - start() 실패:', e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    intentionalStopRef.current = true;
    recognitionRef.current.stop();
    // setIsListening(false); // Removed: Let onend handle this to avoid race conditions
  }, []);

  const abortListening = useCallback(() => {
    console.log('[MIC-DEBUG] abortListening 호출됨');
    if (!recognitionRef.current) return;
    intentionalStopRef.current = true;
    isAbortingRef.current = true;
    recognitionRef.current.abort();
    console.log('[MIC-DEBUG] abortListening - abort() 호출 완료');
    setTranscript('');
    finalTranscriptRef.current = '';
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    finalTranscriptRef.current = '';
    if (isListening && recognitionRef.current) {
      ignoreResultsRef.current = true;
      setTimeout(() => { ignoreResultsRef.current = false; }, 400);
    }
  }, [isListening]);

  const markVerseTransition = useCallback(() => {
    if (isIOS) {
      ignoreResultsRef.current = true;
      setTimeout(() => { ignoreResultsRef.current = false; }, 800);
    }
  }, [isIOS]);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    abortListening, // 추가
    browserSupportsSpeechRecognition,
    resetTranscript,
    markVerseTransition,
    isStalled // 추가
  };
};

export default useSpeechRecognition;
