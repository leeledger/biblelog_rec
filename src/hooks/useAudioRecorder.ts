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
    const recordingsRef = useRef<AudioRecording[]>([]);

    // State와 Ref 동기화
    const updateRecordings = useCallback((newRecs: AudioRecording[] | ((prev: AudioRecording[]) => AudioRecording[])) => {
        setRecordings(prev => {
            const next = typeof newRecs === 'function' ? newRecs(prev) : newRecs;
            recordingsRef.current = next;
            return next;
        });
    }, []);

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

            // 기기별 지원 포맷 확인 (WebM 우선, 아이폰은 mp4/aac 등)
            const supportedTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/aac',
                'audio/ogg;codecs=opus'
            ];
            let mimeType = '';
            for (const type of supportedTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    break;
                }
            }

            console.log(`[useAudioRecorder] Selected MIME type: ${mimeType}`);

            const mediaRecorder = new MediaRecorder(streamRef.current, {
                mimeType,
                audioBitsPerSecond: 64000, // 음질 향상을 위해 64kbps로 상향
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
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

            console.log(`[useAudioRecorder] Blob ready: ${blob.size} bytes, duration: ${finalDuration}s, mime: ${recorder.mimeType}`);

            // 0.5초 이상의 유의미한 녹음만 저장 (기존 1초에서 완화)
            if (finalDuration >= 0.5 && blob.size > 0) {
                const newRec = {
                    blob,
                    bookName,
                    chapter,
                    startVerse,
                    endVerse,
                    durationSeconds: finalDuration,
                };

                // Ref를 먼저 업데이트하여 즉시 가용하게 함 (State 업데이트 지연 대비)
                recordingsRef.current = [...recordingsRef.current, newRec];
                setRecordings([...recordingsRef.current]);
                console.log(`[useAudioRecorder] New recording added. Total: ${recordingsRef.current.length}`);

                // 2. 만약 즉시 처리가 필요하다면 콜백 실행 (Ref가 업데이트된 직후)
                if (onFinished) {
                    onFinished(blob, finalDuration);
                }
            } else {
                console.warn(`[useAudioRecorder] Recording too short or empty (${finalDuration}s), discarding.`);
                if (onFinished) {
                    onFinished(blob, finalDuration);
                }
            }

            chunksRef.current = [];
            setIsRecording(false);
        };

        recorder.stop();
    }, [updateRecordings]);

    const uploadAllRecordings = useCallback(async (userId: number, groupId: number | null): Promise<boolean> => {
        const currentRecordings = recordingsRef.current;
        if (currentRecordings.length === 0) return true;

        setIsUploading(true);
        try {
            let successCount = 0;
            const totalToUpload = currentRecordings.length;

            if (totalToUpload === 0) {
                console.log('[useAudioRecorder] No recordings to upload.');
                setIsUploading(false);
                return true;
            }

            const failedIndices: number[] = [];
            for (let i = 0; i < totalToUpload; i++) {
                const rec = currentRecordings[i];
                console.log(`[useAudioRecorder] Uploading recording ${i + 1}/${totalToUpload}: ${rec.bookName} ${rec.chapter}:${rec.startVerse}`);
                setUploadProgress({ current: i + 1, total: totalToUpload });

                try {
                    // 1. Presigned URL 받기 (파일 타입 포맷 전달)
                    const presignRes = await fetch(`${API_BASE_URL}/audio/presign`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            bookName: rec.bookName,
                            chapter: rec.chapter,
                            verse: rec.startVerse,
                            contentType: rec.blob.type, // 실제 Blob 타입 전달
                        }),
                    });

                    if (!presignRes.ok) {
                        const errData = await presignRes.json().catch(() => ({}));
                        throw new Error(`Presigned URL request failed (${presignRes.status}): ${JSON.stringify(errData)}`);
                    }
                    const { uploadUrl, fileKey } = await presignRes.json();

                    // 2. R2에 실제 파일 업로드 (PUT)
                    const uploadRes = await fetch(uploadUrl, {
                        method: 'PUT',
                        body: rec.blob,
                        headers: { 'Content-Type': rec.blob.type },
                    });

                    if (!uploadRes.ok) {
                        throw new Error(`R2 storage upload failed with status ${uploadRes.status}`);
                    }
                    console.log(`[useAudioRecorder] Step 2 Success: File uploaded to R2. Key: ${fileKey}`);

                    // 3. DB에 메타데이터 기록
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

                    if (!recordRes.ok) {
                        const errData = await recordRes.json().catch(() => ({}));
                        throw new Error(`DB record failed (${recordRes.status}): ${JSON.stringify(errData)}`);
                    }

                    successCount++;
                    console.log(`[useAudioRecorder] Step 3 Success: Metadata recorded in DB.`);
                } catch (singleErr) {
                    console.error(`[useAudioRecorder] Failed to upload segment ${i}:`, singleErr);
                    failedIndices.push(i);
                }
            }

            // 오직 성공한 것만 제거하거나, 혹은 전체 성공 시에만 비움
            if (successCount === totalToUpload) {
                updateRecordings([]);
                console.log(`[useAudioRecorder] All ${successCount} files uploaded successfully.`);
                return true;
            } else if (successCount > 0) {
                // 일부 성공한 경우 실패한 것들만 남김
                const remaining = currentRecordings.filter((_, idx) => failedIndices.includes(idx));
                updateRecordings(remaining);
                console.warn(`[useAudioRecorder] Partial success: ${successCount}/${totalToUpload} uploaded.`);
                return true;
            } else {
                console.error(`[useAudioRecorder] Critical failure: 0/${totalToUpload} files uploaded.`);
                return false;
            }
        } catch (err) {
            console.error('[useAudioRecorder] Global upload process error:', err);
            return false;
        } finally {
            setIsUploading(false);
            setUploadProgress(null);
        }
    }, [updateRecordings]);

    const closeStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    const clearRecordings = useCallback(() => {
        updateRecordings([]);
        closeStream();
    }, [closeStream, updateRecordings]);

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
