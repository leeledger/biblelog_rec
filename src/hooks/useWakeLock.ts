import { useState, useEffect, useCallback, useRef } from 'react';

export const useWakeLock = () => {
    const wakeLockRef = useRef<any>(null);

    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                console.log('[WakeLock] 화면 꺼짐 방지가 활성화되었습니다.');

                // 연결이 예기치 않게 끊겼을 때 처리
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('[WakeLock] 화면 꺼짐 방지가 해제되었습니다.');
                });
            } catch (err: any) {
                console.error(`[WakeLock] 활성화 실패: ${err.name}, ${err.message}`);
            }
        } else {
            console.warn('[WakeLock] 이 브라우저는 화면 꺼짐 방지 기능을 지원하지 않습니다.');
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
            } catch (err: any) {
                console.error(`[WakeLock] 해제 실패: ${err.name}, ${err.message}`);
            }
        }
    }, []);

    // 앱이 다시 활성화될 때 (Tab Focus 등) 다시 요청하기 위한 로직
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [requestWakeLock]);

    return { requestWakeLock, releaseWakeLock };
};
