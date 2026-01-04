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
  markVerseTransition: () => void; // 구절 전환 시간을 표시하는 함수 추가
}

const useSpeechRecognition = (options?: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn => {
  const SpeechRecognitionAPI = getSpeechRecognition();
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const browserSupportsSpeechRecognition = !!SpeechRecognitionAPI;
  const lang = options?.lang || 'ko-KR';

  // iOS 기기 감지
  const isIOS = useMemo(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }, []);

  // This ref will track if the stop was initiated by the user/app logic.
  const intentionalStopRef = useRef(false);

  // iOS 기기에서만 사용할 최종 트랜스크립트와 이전 임시 결과를 저장할 ref
  const finalTranscriptRef = useRef('');
  const lastInterimRef = useRef('');

  // iOS에서 절 변경 시 늦게 도착하는 인식 결과를 무시하기 위한 플래그
  const ignoreResultsRef = useRef(false);

  // iOS에서 인식 중단 문제를 추적하기 위한 디버그 타임스태프
  const lastRecognitionEventTimeRef = useRef(Date.now());

  // 구절 전환 시간을 추적하여 오래된 결과 무시
  const verseTransitionTimeRef = useRef(Date.now());

  // 마지막으로 처리된 결과의 ID를 추적하여 중복 처리 방지
  const lastProcessedResultIdRef = useRef<string>('');

  // iOS에서 결과 표시에 의도적인 딜레이를 주기 위한 타이머 관리
  const delayedResultTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 지연된 표시를 위한 결과 값 저장
  const pendingFinalResultRef = useRef<string>('');
  const pendingInterimResultRef = useRef<string>('');

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
      console.log('[useSpeechRecognition] onstart event fired');
      setIsListening(true);
      intentionalStopRef.current = false;
      lastRecognitionEventTimeRef.current = Date.now();
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      // 구절 전환 직후의 잔여 결과 무시
      if (ignoreResultsRef.current) return;

      lastRecognitionEventTimeRef.current = Date.now();

      let interimTranscript = '';
      let finalTranscript = '';

      // iOS와 Android의 특성에 맞게 처리 분리
      if (isIOS) {
        // iOS: 결과 인덱스(event.resultIndex)부터의 변화만 감지하여 수동 누적
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
        setTranscript(finalTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : ''));
      } else {
        // Android: 브라우저가 제공하는 전체 결과(0부터)를 매번 합산하여 표시
        // 수동 누적(finalTranscriptRef)을 사용하지 않으므로 중복 증폭 원천 차단
        let totalAndroid = '';
        for (let i = 0; i < event.results.length; i++) {
          totalAndroid += event.results[i][0].transcript;
        }
        setTranscript(totalAndroid);
      }

      setError(null);
    };


    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error, event.message);

      let specificError = `오류: ${event.error}`;
      if (event.error === 'no-speech') specificError = '음성이 감지되지 않았습니다.';
      else if (event.error === 'audio-capture') specificError = '마이크를 찾을 수 없습니다.';
      else if (event.error === 'not-allowed') specificError = '마이크 사용이 차단되었습니다.';
      else if (event.error === 'network') specificError = '네트워크 오류입니다.';

      setError(specificError);
    };

    recognition.onend = () => {
      console.log('[useSpeechRecognition] onend fired');


      // iOS에서 마지막 인식 이벤트와 현재 시간의 차이 계산
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
                // Android는 재시작 시 브라우저 버퍼가 비워지므로 
                // 이전 세션 내용을 finalTranscriptRef에 백업해두고 onresult에서 합쳐야 할 수도 있음.
                // 하지만 현재 중복이 심하므로 일단 Android는 무조건 새로 시작하도록 함.
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
      // 마지막 이벤트 시간 초기화
      lastRecognitionEventTimeRef.current = Date.now();

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
        setError(`마이크 권한 오류: ${permErr.name === 'NotAllowedError' ? '권한이 거부되었습니다. 설정에서 마이크를 허용해주세요.' : permErr.message}`);
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
      setError(`마이크 시작 오류: ${e.message}`);
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
      // iOS 기기에서만 절 변경 시 늦게 도착하는 인식 결과를 무시하기 위해 플래그 설정
      if (isIOS) {
        ignoreResultsRef.current = true;
        console.log('[useSpeechRecognition] iOS - Stopping with ignoreResults=true');
      }
      recognitionRef.current.stop();
      // The onend event will handle setting isListening to false.
    } catch (e: any) {
      console.error('Error stopping speech recognition:', e);
      setError(`마이크 중지 오류: ${e.message}`);
    }
  }, [isListening]);

  // 구절 전환을 표시하는 함수 - iOS에서 지연된 결과 문제 해결용
  const markVerseTransition = useCallback(() => {
    // 구절 전환 시간 업데이트
    const now = Date.now();
    verseTransitionTimeRef.current = now;
    console.log(`[useSpeechRecognition] Verse transition marked at ${new Date(now).toISOString().substr(11, 12)}`);

    // iOS에서 만 특별 처리
    if (isIOS) {
      // 이전 구절에서 지연 응답이 오는 문제를 방지하기 위해 잠시간 무시 플래그 설정
      ignoreResultsRef.current = true;

      // 어떤 상황에서도 0.4초 후에는 무시 해제 보장
      setTimeout(() => {
        ignoreResultsRef.current = false;
        console.log('[useSpeechRecognition] iOS ignoreResults released by safety timeout');
      }, 400);

      // 지연 가능한 모든 인식 결과 상태 초기화
      setTranscript('');
      finalTranscriptRef.current = '';
      pendingFinalResultRef.current = '';
      pendingInterimResultRef.current = '';
      lastInterimRef.current = '';
      lastProcessedResultIdRef.current = '';

      // 음성 인식 재시작 - 기존 인식 중단 및 재시작
      if (recognitionRef.current) {
        try {
          // 중복 재시작을 막기 위해 잠시 의도적 중단으로 설정
          intentionalStopRef.current = true;
          // abort()는 내부 버퍼를 즉시 삭제함
          recognitionRef.current.abort();
          console.log('[useSpeechRecognition] iOS recognition forcefully aborted for reset');
        } catch (e) {
          console.error('[useSpeechRecognition] Error aborting recognition:', e);
        }

        // 재시작을 위한 짧은 지연
        setTimeout(() => {
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

      // 잠시 후 다시 처리 가능하게 (구절 전환 직후 결과만 동작)
      setTimeout(() => {
        ignoreResultsRef.current = false;
        console.log('[useSpeechRecognition] iOS verse transition ignore period ended');
      }, 500); // 지연된 결과가 도착하는 시간을 고려해 500ms로 확장 (이전 250ms)

      // 이전 결과와의 구분을 위해 마지막 처리된 결과 ID 초기화
      lastProcessedResultIdRef.current = '';
    }
  }, [isIOS]);

  // 음성 인식 텍스트를 강제로 초기화하는 함수
  const resetTranscript = useCallback(() => {
    setTranscript('');

    // 모든 기기에서 참조 변수 초기화
    finalTranscriptRef.current = '';
    lastInterimRef.current = '';
    ignoreResultsRef.current = true;

    // 구절 전환 시간 업데이트 (구절 전환으로 간주)
    verseTransitionTimeRef.current = Date.now();
    // 현재 인식이 진행 중이면 잠시 중지하고 다시 시작하여 인식 결과를 초기화
    if (isListening && recognitionRef.current) {
      try {
        console.log('[useSpeechRecognition] Force resetting recognition by abort/start cycle');
        // 강제 중단 시 flag를 true로 두어 onend에서의 자동 재시작 방지
        intentionalStopRef.current = true;
        // 현재 인식 즉시 중단 (버퍼 파괴)
        recognitionRef.current.abort();

        // 텍스트 상태 즉시 초기화
        setTranscript('');
        finalTranscriptRef.current = '';
        lastProcessedResultIdRef.current = '';
        ignoreResultsRef.current = true; // 리셋 중에는 결과 무시

        // 구절 전환 시간 업데이트 (구절 전환으로 간주)
        verseTransitionTimeRef.current = Date.now();

        // 잠시 후 다시 시작
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

          // 리셋 후 결과를 받기 시작할 때까지 충분한 무시 기간 확보
          setTimeout(() => {
            ignoreResultsRef.current = false;
            console.log('[useSpeechRecognition] ignoreResults released after reset');
          }, 400); // 350ms -> 400ms로 상향
        }, 300); // 250ms -> 300ms로 상향하여 엔진 안정화 시간 확보
      } catch (e) {
        console.error('[useSpeechRecognition] Error during force reset:', e);
      }
    } else {
      // 리스닝 중이 아닐 때도 플래그는 해제되어야 함
      setTranscript('');
      finalTranscriptRef.current = '';
      ignoreResultsRef.current = false;
      lastInterimRef.current = ''; // lastInterimRef도 초기화
      lastProcessedResultIdRef.current = ''; // lastProcessedResultIdRef도 초기화
      verseTransitionTimeRef.current = Date.now(); // 구절 전환 시간 업데이트
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
