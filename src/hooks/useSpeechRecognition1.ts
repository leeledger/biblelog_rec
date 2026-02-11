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
            console.log('[useSpeechRecognition] onstart');
            setIsListening(true);
            setIsStalled(false);
            intentionalStopRef.current = false;
            restartCountRef.current = 0; // 시작되면 카운트 초기화
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

            // 오류 발생 시 마이크가 정상 작동 중이 아님을 즉시 반영
            setIsListening(false);

            if (event.error === 'not-allowed') {
                setError('마이크 권한이 거부되었습니다.');
            } else if (isIOS && (event.error === 'audio-capture' || event.error === 'network')) {
                setIsStalled(true);
            }
        };

        recognition.onend = () => {
            console.log('[useSpeechRecognition] onend');

            // 엔진이 멈추는 즉시 상태 반영 (재시작 시도 전)
            setIsListening(false);

            if (intentionalStopRef.current) {
                return;
            }

            // 자동 재시작 로직
            // 안드로이드: 300ms 지연 후 재시작 (충돌 방지)
            // iOS: 800ms 지연 후 재시작 (리소스 정리 대기)
            setTimeout(() => {
                if (recognitionRef.current && !intentionalStopRef.current) {
                    try {
                        recognitionRef.current.start();
                    } catch (e: any) {
                        // 이미 실행 중인 경우 에러 무시하고 리스닝 상태 유지
                        if (e.message && (e.message.includes('already started') || e.message.includes('already running'))) {
                            setIsListening(true);
                        } else {
                            setIsListening(false);
                        }
                    }
                }
            }, isIOS ? 800 : 300);
        };

        return () => {
            if (recognitionRef.current) {
                intentionalStopRef.current = true;
                recognitionRef.current.abort();
            }
        };
    }, [lang, browserSupportsSpeechRecognition, isIOS]);

    const startListening = useCallback(() => {
        if (!recognitionRef.current) return;
        try {
            intentionalStopRef.current = false;
            setIsStalled(false);
            recognitionRef.current.start();
        } catch (e: any) {
            // 이미 실행 중이라면 상태만 업데이트
            if (e.message && (e.message.includes('already started') || e.message.includes('already running'))) {
                setIsListening(true);
            } else {
                console.error('Start failed', e);
            }
        }
    }, []);

    const stopListening = useCallback(() => {
        if (!recognitionRef.current) return;
        intentionalStopRef.current = true;
        recognitionRef.current.stop();
    }, []);

    const abortListening = useCallback(() => {
        if (!recognitionRef.current) return;
        intentionalStopRef.current = true;
        recognitionRef.current.abort(); // 즉시 중단 및 버퍼 파기
        setTranscript('');
        finalTranscriptRef.current = '';
    }, []);

    const resetTranscript = useCallback(() => {
        setTranscript('');
        finalTranscriptRef.current = '';
        if (isListening && recognitionRef.current) {
            ignoreResultsRef.current = true;
            // 안드로이드 잔상 방지: 구절이 넘어갈 때 0.6초간 이전 소리 무시
            // 아이폰은 0.4초면 충분
            const ignoreDuration = isIOS ? 400 : 600;
            setTimeout(() => { ignoreResultsRef.current = false; }, ignoreDuration);
        }
    }, [isListening, isIOS]);

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
