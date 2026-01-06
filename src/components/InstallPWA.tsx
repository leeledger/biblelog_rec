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
        // 1. 현재 앱 모드(standalone)인지 확인
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || document.referrer.includes('android-app://');

        if (isStandalone) {
            setInstallState({ status: 'already-installed', platform: 'other' }); // 실제 앱 안이므로 초기 상태 설정
            return;
        }

        // 2. 플랫폼 감지
        const userAgent = window.navigator.userAgent.toLowerCase();
        const platform = /iphone|ipad|ipod/.test(userAgent) ? 'ios' :
            /android/.test(userAgent) ? 'android' : 'other';

        // IOS는 beforeinstallprompt 이벤트가 없으므로 localStorage로 가이드 표시 여부 결정
        if (platform === 'ios') {
            const wasInstalled = localStorage.getItem('pwa-installed') === 'true';
            if (!wasInstalled) {
                setInstallState({ status: 'idle', platform: 'ios' });
            } else {
                setInstallState({ status: 'already-installed', platform: 'ios' });
            }
        } else if (platform === 'android') {
            // Android는 이벤트를 기다려야 하므로 일단 idle
            setInstallState({ status: 'idle', platform: 'android' });
        }

        // 3. Android용 설치 프롬프트 이벤트 리스닝
        const handleBeforeInstallPrompt = (e: any) => {
            console.log('[InstallPWA] beforeinstallprompt event fired');
            e.preventDefault();
            setDeferredPrompt(e);
            // 이벤트가 왔다는 건 설치가 가능하다는 뜻이므로 상태 초기화
            setInstallState({ status: 'idle', platform: 'android' });
        };

        // 4. 설치 완료 이벤트 리스닝
        const handleAppInstalled = () => {
            console.log('[InstallPWA] App installed successfully');
            localStorage.setItem('pwa-installed', 'true');
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
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-3xl p-5 mb-8 shadow-2xl shadow-purple-200 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 bg-purple-400/20 rounded-full blur-xl"></div>

            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-5">
                <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="flex-shrink-0 w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner">
                        {installState.status === 'installing' ? (
                            <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (installState.status === 'installed' || installState.status === 'already-installed') ? (
                            <svg className="w-8 h-8 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <img src="/images/pwa-icon.png" alt="App Icon" className="w-10 h-10 object-contain shadow-sm rounded-lg" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg md:text-xl font-black text-white leading-tight">
                            {installState.status === 'installing' ? '앱 설치 중...' :
                                (installState.status === 'installed' || installState.status === 'already-installed')
                                    ? (window.matchMedia('(display-mode: standalone)').matches ? '앱 전용 모드 실행 중' : '이미 설치되어 있습니다')
                                    : '바이블로그 앱 설치'}
                        </h3>
                        <p className="text-sm text-purple-100 font-medium opacity-90">
                            {installState.status === 'installing' ? '잠시만 기다려주세요' :
                                (installState.status === 'installed' || installState.status === 'already-installed')
                                    ? (window.matchMedia('(display-mode: standalone)').matches ? '완전한 전체 화면으로 기도에 집중하세요' : '앱 목록에서 바이블로그를 찾아보세요')
                                    : '삭제하셨다면 지금 다시 설치할 수 있습니다'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* 설치 버튼 (안드로이드 신호가 있을 때 최우선 노출) */}
                    {installState.platform === 'android' && deferredPrompt && (
                        <button
                            onClick={handleInstallClick}
                            className="w-full sm:w-auto bg-white text-purple-700 hover:bg-purple-50 px-8 py-3.5 rounded-2xl text-base font-black transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 group"
                        >
                            지금 앱 설치하기
                            <span className="text-xl group-hover:translate-x-1 transition-transform">✨</span>
                        </button>
                    )}

                    {/* iOS 가이드 (설치 기록이 없을 때만 노출) */}
                    {installState.status === 'idle' && installState.platform === 'ios' && (
                        <div className="bg-white/15 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/20">
                            <p className="text-xs text-white font-bold text-center leading-relaxed">
                                하단 <span className="inline-block translate-y-0.5 mx-1">
                                    <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-16-4l8-8 8 8m-8-8v16" />
                                    </svg>
                                </span> 버튼 터치 후<br />
                                <span className="text-amber-300">'홈 화면에 추가'</span>를 눌러주세요
                            </p>
                        </div>
                    )}

                    {/* 상태 닫기 버튼 */}
                    {(installState.status === 'already-installed' || installState.status === 'installed') && (
                        <button
                            onClick={() => {
                                setInstallState(prev => ({ ...prev, status: 'idle' }));
                                localStorage.removeItem('pwa-installed');
                            }}
                            className="ml-auto p-2 text-white/50 hover:text-white transition-colors"
                            aria-label="안내 닫기"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InstallPWA;
