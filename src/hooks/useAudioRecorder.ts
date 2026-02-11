import { useState, useRef, useCallback } from 'react';

const API_BASE_URL = '/api';

interface AudioRecording {
    blob: Blob;
    bookName: string;
    chapter: number;
    startVerse: number;
    endVerse: number;
    durationSeconds: number;
}

interface UseAudioRecorderReturn {
    isRecording: boolean;
    recordings: AudioRecording[];
    isUploading: boolean;
    uploadProgress: { current: number; total: number } | null;
    startRecording: () => Promise<void>;
    prepareMic: () => Promise<boolean>;
    stopRecording: (bookName: string, chapter: number, startVerse: number, endVerse: number, onFinished?: (readyBlob: Blob, duration: number) => void) => void;
    uploadAllRecordings: (userId: number, groupId: number | null) => Promise<boolean>;
    clearRecordings: () => void;
    closeStream: () => void;
    recordingCount: number;
}

/**
 * 음성 녹음 훅 - MediaRecorder를 사용하여 브라우저에서 음성을 녹음하고
 * Cloudflare R2에 업로드하는 기능을 제공합니다.
 * 
 * 녹음 데이터는 로컬(메모리)에 보관되며, 사용자가 명시적으로 업로드 버튼을 눌러야 R2에 저장됩니다.
 */
const useAudioRecorder = (): UseAudioRecorderReturn => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordings, setRecordings] = useState<AudioRecording[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startTimeRef = useRef<number>(0);
    const streamRef = useRef<MediaStream | null>(null);

    const prepareMic = useCallback(async () => {
        try {
            if (!streamRef.current || streamRef.current.getTracks().every(t => (t as any).readyState === 'ended')) {
                console.log('[useAudioRecorder] Requesting standard mic stream...');
                streamRef.current = await navigator.mediaDevices.getUserMedia({
                    audio: true
                });
            }
            return true;
        } catch (err) {
            console.error('[useAudioRecorder] prepareMic failed:', err);
            return false;
        }
    }, []);

    const startRecording = useCallback(async () => {
        if (isRecording) {
            console.log('[useAudioRecorder] Already recording, ignoring start request');
            return;
        }

        try {
            console.log('[useAudioRecorder] Initializing MediaRecorder...');
            // 미리 열어둔 스트림이 있는지 확인하고 없으면 여기서라도 요청
            const ok = await prepareMic();
            if (!ok || !streamRef.current) throw new Error('No mic stream available');

            chunksRef.current = [];
            startTimeRef.current = Date.now();

            // WebM이 가장 널리 지원되는 포맷
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            const mediaRecorder = new MediaRecorder(streamRef.current, {
                mimeType,
                audioBitsPerSecond: 32000, // 32kbps로 파일 크기 최소화
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000); // 1초마다 데이터 수집
            setIsRecording(true);
            console.log('[useAudioRecorder] Recording started successfully');
        } catch (err: any) {
            console.error('[useAudioRecorder] Failed to start recording:', err);
            // 사용자에게 알리기 위해 윈도우 객체에 에러 박제 (디버깅용)
            (window as any).lastAudioError = err.message;
        }
    }, [isRecording]);

    const stopRecording = useCallback((bookName: string, chapter: number, startVerse: number, endVerse: number, onFinished?: (readyBlob: Blob, duration: number) => void) => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            console.log('[useAudioRecorder] stopRecording ignored: recorder missing or inactive');
            setIsRecording(false);
            return;
        }

        const recorder = mediaRecorderRef.current;
        console.log('[useAudioRecorder] Stopping recorder, state:', recorder.state);

        recorder.onstop = () => {
            const durationSeconds = (Date.now() - startTimeRef.current) / 1000;
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
            const finalDuration = Math.round(durationSeconds * 10) / 10;

            console.log(`[useAudioRecorder] Blob ready: ${blob.size} bytes, duration: ${finalDuration}s`);

            // 1. 상태 업데이트
            if (finalDuration >= 1 && blob.size > 0) {
                const newRec = {
                    blob,
                    bookName,
                    chapter,
                    startVerse,
                    endVerse,
                    durationSeconds: finalDuration,
                };
                setRecordings(prev => [...prev, newRec]);

                // 2. 만약 즉시 처리가 필요하다면 콜백 실행
                if (onFinished) {
                    onFinished(blob, finalDuration);
                }
            }

            chunksRef.current = [];
            setIsRecording(false);
        };

        recorder.stop();
    }, []);

    const uploadAllRecordings = useCallback(async (userId: number, groupId: number | null): Promise<boolean> => {
        if (recordings.length === 0) return true;

        setIsUploading(true);
        setUploadProgress({ current: 0, total: recordings.length });

        try {
            let successCount = 0;
            for (let i = 0; i < recordings.length; i++) {
                const rec = recordings[i];
                console.log(`[useAudioRecorder] Uploading recording ${i + 1}/${recordings.length}: ${rec.bookName} ${rec.chapter}:${rec.startVerse}`);
                setUploadProgress({ current: i + 1, total: recordings.length });

                // 1단계: Presigned URL 요청
                try {
                    const presignRes = await fetch(`${API_BASE_URL}/audio/presign`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            bookName: rec.bookName,
                            chapter: rec.chapter,
                            verse: rec.startVerse,
                        }),
                    });

                    if (!presignRes.ok) throw new Error('Presigned URL request failed');
                    const { uploadUrl, fileKey } = await presignRes.json();

                    // 2단계: R2에 직접 업로드
                    const uploadRes = await fetch(uploadUrl, {
                        method: 'PUT',
                        body: rec.blob,
                        headers: { 'Content-Type': 'audio/webm' },
                    });

                    if (!uploadRes.ok) throw new Error('R2 upload failed');
                    console.log(`[useAudioRecorder] Success: File uploaded to R2 with key: ${fileKey}`);

                    // 3단계: 메타데이터 DB 저장
                    const recordRes = await fetch(`${API_BASE_URL}/audio/record`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            groupId,
                            fileKey,
                            bookName: rec.bookName,
                            chapter: rec.chapter,
                            verse: rec.startVerse,
                            durationSeconds: rec.durationSeconds,
                            fileSizeBytes: rec.blob.size,
                        }),
                    });

                    if (recordRes.ok) successCount++;
                } catch (singleErr) {
                    console.error(`[useAudioRecorder] Failed to upload segment ${i}:`, singleErr);
                }
            }

            // 업로드 완료 후 로컬 데이터 정리 및 알림
            setRecordings([]);
            if (successCount > 0) {
                alert(`🎉 [성공] ${successCount}개의 오디오 파일이 Cloudflare R2에 안전하게 전송되었습니다.`);
            } else if (recordings.length > 0) {
                alert(`⚠️ [주의] 오디오 업로드에 실패했습니다. 네트워크 상태를 확인해 주세요.`);
            }
            return true;
        } catch (err) {
            console.error('[useAudioRecorder] Upload error:', err);
            return false;
        } finally {
            setIsUploading(false);
            setUploadProgress(null);
        }
    }, [recordings]);

    const closeStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    const clearRecordings = useCallback(() => {
        setRecordings([]);
        closeStream();
    }, [closeStream]);

    return {
        isRecording,
        recordings,
        isUploading,
        uploadProgress,
        startRecording,
        stopRecording,
        prepareMic, // 추가
        uploadAllRecordings,
        clearRecordings,
        closeStream,
        recordingCount: recordings.length,
    };
};

export default useAudioRecorder;
