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

    // 디버그 로그 전송 함수 (iOS 문제 해결용)
    const sendDebugLog = async (event: string, data: any) => {
      try {
        await fetch('/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event,
            data,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          })
        });
      } catch (e) {
        console.error('[Debug log failed]', e);
      }
    };

    recognition.onstart = () => {
      console.log('[useSpeechRecognition] onstart event fired');
      if (isIOS) sendDebugLog('onstart', { isListening: true });
      setIsListening(true);
      intentionalStopRef.current = false;
      lastRecognitionEventTimeRef.current = Date.now();
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      // 현재 타임스탬프
      const currentTime = Date.now();
      lastRecognitionEventTimeRef.current = currentTime;

      // iOS 디버그 로그 전송
      if (isIOS) {
        sendDebugLog('onresult', {
          resultIndex: event.resultIndex,
          resultsLength: event.results?.length,
          firstTranscript: event.results?.[0]?.[0]?.transcript?.substring(0, 50)
        });
      }

      // 이벤트에 대한 고유 ID 생성 (시간 기반)
      const resultId = `${event.timeStamp}-${event.resultIndex}`;

      // 이미 처리된 결과인지 확인 (iOS에서 중복 결과 방지)
      if (isIOS && resultId === lastProcessedResultIdRef.current) {
        console.log('[useSpeechRecognition] iOS - Skipping duplicate result');
        return;
      }

      // iOS에서 ignoreResultsRef가 true면 결과 무시
      if (isIOS && ignoreResultsRef.current) {
        console.log('[useSpeechRecognition] iOS - Ignoring results during transition');
        return;
      }

      // iOS에서 구절 전환 후 MAX_RESULT_DELAY_MS보다 오래된 결과는 무시 (지연된 결과)
      const MAX_RESULT_DELAY_MS = 1500; // 1.5초
      if (isIOS && (currentTime - verseTransitionTimeRef.current < MAX_RESULT_DELAY_MS)) {
        // 구절 전환 직후에는 로그만 남기고 결과 처리는 계속함 (디버깅용)
        console.log(`[useSpeechRecognition] iOS - Processing result after verse transition, ${currentTime - verseTransitionTimeRef.current}ms since transition`);
      }

      // 결과 ID 업데이트
      lastProcessedResultIdRef.current = resultId;

      let interimTranscript = '';
      let finalTranscript = '';
      let hasFinalResult = false;

      // Combine all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += transcript;
          hasFinalResult = true;
        } else {
          interimTranscript += transcript;
        }
      }

      console.log(`[useSpeechRecognition] onresult - hasFinal: ${hasFinalResult}, final: "${finalTranscript}", interim: "${interimTranscript}"`);

      // iOS 기기에 의도적인 딜레이 추가
      if (isIOS) {
        // iOS에서는 특별한 처리가 필요하며, 최종 결과와 중간 결과를 따로 관리

        // 이전 대기 중인 타이머가 있으면 취소
        if (delayedResultTimerRef.current) {
          clearTimeout(delayedResultTimerRef.current);
          delayedResultTimerRef.current = null;
        }

        // 최종 결과가 있으면 이를 기존 최종 결과에 추가
        if (hasFinalResult) {
          finalTranscriptRef.current = (finalTranscriptRef.current || '') + finalTranscript;
          pendingFinalResultRef.current = finalTranscriptRef.current;
        }

        // 중간 결과 저장
        if (interimTranscript && interimTranscript !== lastInterimRef.current) {
          lastInterimRef.current = interimTranscript;
          pendingInterimResultRef.current = interimTranscript;
        }

        // 의도적인 딜레이 후 결과 표시 (안드로이드보다 더 길게 지연)
        const ARTIFICIAL_DELAY_MS = 300; // 0.3초 지연 (실시간 타이핑 표시 개선)

        delayedResultTimerRef.current = setTimeout(() => {
          const finalResult = pendingFinalResultRef.current;
          const interimResult = pendingInterimResultRef.current;

          // 최종 결과 + 중간 결과 표시
          setTranscript(finalResult + (interimResult ? ' ' + interimResult : ''));
          console.log(`[useSpeechRecognition] iOS - Delayed result display after ${ARTIFICIAL_DELAY_MS}ms`);

          delayedResultTimerRef.current = null;
        }, ARTIFICIAL_DELAY_MS);
      }
      // Android 및 기타 플랫폼
      else {
        // 최종 결과와 중간 결과를 함께 표시
        if (hasFinalResult || interimTranscript) {
          const newTranscript = (hasFinalResult ? finalTranscript : '') + (interimTranscript ? ' ' + interimTranscript : '');
          setTranscript(newTranscript);
          console.log('[useSpeechRecognition] Android - Updated transcript:', newTranscript);
        }
      }

      setError(null);
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error, event.message);
      if (isIOS) sendDebugLog('onerror', { error: event.error, message: event.message });
      let specificError = `오류: ${event.error}`;
      if (event.error === 'no-speech') specificError = '음성이 감지되지 않았습니다.';
      else if (event.error === 'audio-capture') specificError = '마이크를 찾을 수 없습니다.';
      else if (event.error === 'not-allowed') specificError = '마이크 사용이 차단되었습니다.';
      else if (event.error === 'network') specificError = '네트워크 오류입니다.';

      setError(specificError);
    };

    recognition.onend = () => {
      console.log('[useSpeechRecognition] onend fired');
      if (isIOS) sendDebugLog('onend', { intentionalStop: intentionalStopRef.current });

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
              // For both iOS and Android, preserve the existing transcript
              if (isIOS) {
                // For iOS, update the final transcript ref
                finalTranscriptRef.current = currentTranscript;
                ignoreResultsRef.current = false;
                console.log('[useSpeechRecognition] iOS - Restarting with preserved transcript:', currentTranscript);
              } else {
                // For Android, we'll set the transcript directly after restart
                console.log('[useSpeechRecognition] Android - Restarting recognition');
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

      // 지언 가능한 모든 인식 결과 상태 초기화
      setTranscript('');
      finalTranscriptRef.current = '';
      pendingFinalResultRef.current = '';
      pendingInterimResultRef.current = '';
      lastInterimRef.current = '';

      // 음성 인식 재시작 - 기존 인식 중단 및 재시작
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current.stop();

        console.log('[useSpeechRecognition] iOS recognition forcefully stopped for reset');

        // 재시작을 위한 짧은 지연
        setTimeout(() => {
          if (isListening && recognitionRef.current) {
            try {
              recognitionRef.current.start();
              console.log('[useSpeechRecognition] iOS recognition restarted after verse transition');
            } catch (error) {
              console.error('[useSpeechRecognition] Error restarting iOS recognition:', error);
            }
          }
        }, 50);
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
        console.log('[useSpeechRecognition] Force resetting recognition by stop/start cycle');
        // 현재 인식 중지
        recognitionRef.current.stop();

        // 잠시 후 다시 시작 (onend 이벤트가 자동으로 호출되며 새로운 인식 세션 시작)
        setTimeout(() => {
          if (recognitionRef.current && isListening) {
            // iOS에서는 의도적인 초기화 시에만 ignoreResultsRef를 true로 유지
            if (isIOS) {
              console.log('[useSpeechRecognition] iOS - Restarting with cleared transcript');
              // 이전 결과와의 구분을 위해 마지막 처리된 결과 ID 초기화
              lastProcessedResultIdRef.current = '';
            }
            recognitionRef.current.start();
            console.log('[useSpeechRecognition] Recognition restarted after reset');
          }
        }, isIOS ? 250 : 100); // iOS에서는 지연 시간을 더 늘려 안정성 확보
      } catch (e) {
        console.error('[useSpeechRecognition] Error during force reset:', e);
      }
    } else {
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
