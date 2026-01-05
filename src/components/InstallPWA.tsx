import React, { useState, useEffect } from 'react';

interface InstallState {
    status: 'idle' | 'installing' | 'installed' | 'already-installed';
    platform: 'android' | 'ios' | 'other';
}

const InstallPWA: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [installState, setInstallState] = useState<InstallState>({
        status: 'idle',
        platform: 'other'
    });

    useEffect(() => {
        // 이미 설치된 상태(standalone)인지 확인
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || document.referrer.includes('android-app://');

        // localStorage로 설치 여부 추적 (브라우저 세션 간 유지)
        const wasInstalled = localStorage.getItem('pwa-installed') === 'true';

        if (isStandalone) {
            // 앱에서 직접 열린 경우 - 아무것도 표시하지 않음
            return;
        }

        if (wasInstalled) {
            // 웹에서 접속했지만 이전에 설치한 적 있음
            const userAgent = window.navigator.userAgent.toLowerCase();
            const platform = /iphone|ipad|ipod/.test(userAgent) ? 'ios' :
                /android/.test(userAgent) ? 'android' : 'other';
            setInstallState({ status: 'already-installed', platform });
            return;
        }

        // OS 감지
        const userAgent = window.navigator.userAgent.toLowerCase();
        if (/iphone|ipad|ipod/.test(userAgent)) {
            setInstallState({ status: 'idle', platform: 'ios' });
        } else if (/android/.test(userAgent)) {
            setInstallState({ status: 'idle', platform: 'android' });
        }

        // Android: 설치 프롬프트 이벤트 리스닝
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        // 설치 완료 이벤트 리스닝
        const handleAppInstalled = () => {
            localStorage.setItem('pwa-installed', 'true');
            const platform = /android/.test(userAgent) ? 'android' :
                /iphone|ipad|ipod/.test(userAgent) ? 'ios' : 'other';
            setInstallState({ status: 'installed', platform });
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        setInstallState(prev => ({ ...prev, status: 'installing' }));
        deferredPrompt.prompt();

        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            localStorage.setItem('pwa-installed', 'true');
            setInstallState(prev => ({ ...prev, status: 'installed' }));
        } else {
            setInstallState(prev => ({ ...prev, status: 'idle' }));
        }

        setDeferredPrompt(null);
    };

    // 앱에서 직접 열린 경우 아무것도 표시하지 않음
    if (installState.status === 'idle' && !deferredPrompt && installState.platform !== 'ios') {
        return null;
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-4 mb-6 animate-fade-in">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        {installState.status === 'installing' ? (
                            <svg className="w-6 h-6 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : installState.status === 'installed' || installState.status === 'already-installed' ? (
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        )}
                    </div>
                    <div>
                        {installState.status === 'installing' ? (
                            <>
                                <h3 className="font-bold text-gray-800 text-sm md:text-base">앱 설치 중...</h3>
                                <p className="text-xs text-gray-500">잠시만 기다려주세요</p>
                            </>
                        ) : installState.status === 'installed' ? (
                            <>
                                <h3 className="font-bold text-green-700 text-sm md:text-base">설치 완료!</h3>
                                {installState.platform === 'android' ? (
                                    <p className="text-xs text-gray-600">
                                        앱 메뉴에 추가되었어요!<br />
                                        <span className="text-purple-600 font-medium">홈 화면에 추가하면 더 편해요 ✨</span>
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-600">
                                        설치된 앱에서 로그인해주세요! 📱
                                    </p>
                                )}
                            </>
                        ) : installState.status === 'already-installed' ? (
                            <>
                                <h3 className="font-bold text-green-700 text-sm md:text-base">이미 설치되어 있어요!</h3>
                                {installState.platform === 'android' ? (
                                    <p className="text-xs text-gray-600">
                                        앱 메뉴에서 바이블로그를 찾아보세요 📱
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-600">
                                        홈 화면의 바이블로그 앱에서 로그인하세요 📱
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <h3 className="font-bold text-gray-800 text-sm md:text-base">앱으로 더 간편하게 이용하세요</h3>
                                <p className="text-xs text-gray-500">홈 화면에 추가하여 성경 읽기를 더 편하게 시작하세요</p>
                            </>
                        )}
                    </div>
                </div>

                {installState.status === 'idle' && installState.platform === 'android' && deferredPrompt && (
                    <button
                        onClick={handleInstallClick}
                        className="whitespace-nowrap bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm"
                    >
                        설치하기
                    </button>
                )}

                {installState.status === 'idle' && installState.platform === 'ios' && (
                    <div className="text-right">
                        <p className="text-[10px] md:text-xs text-purple-600 font-medium bg-purple-50 px-3 py-1.5 rounded-lg inline-block leading-tight">
                            공유 아이콘 <span className="inline-block translate-y-0.5">
                                <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-16-4l8-8 8 8m-8-8v16" />
                                </svg>
                            </span> 클릭 후<br />
                            <span className="font-bold">'홈 화면에 추가'</span>를 선택하세요
                        </p>
                    </div>
                )}

                {(installState.status === 'installed' || installState.status === 'already-installed') && (
                    <button
                        onClick={() => setInstallState(prev => ({ ...prev, status: 'idle' }))}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

export default InstallPWA;
