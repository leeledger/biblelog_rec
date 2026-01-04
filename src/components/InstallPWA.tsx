import React, { useState, useEffect } from 'react';

const InstallPWA: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');

    useEffect(() => {
        // 이미 설치된 상태(standalone)인지 확인
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || document.referrer.includes('android-app://');

        if (isStandalone) {
            return;
        }

        //OS 감지
        const userAgent = window.navigator.userAgent.toLowerCase();
        if (/iphone|ipad|ipod/.test(userAgent)) {
            setPlatform('ios');
            // iOS는 항상 가이드를 보여줄 수 있음 (단, standalone이 아닐 때만)
            setShowInstallBanner(true);
        } else if (/android/.test(userAgent)) {
            setPlatform('android');
        }

        // Android: 설치 프롬프트 이벤트 리스닝
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBanner(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }

        setDeferredPrompt(null);
        setShowInstallBanner(false);
    };

    if (!showInstallBanner) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-4 mb-6 animate-fade-in">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm md:text-base">앱으로 더 간편하게 이용하세요</h3>
                        <p className="text-xs text-gray-500">홈 화면에 추가하여 성경 읽기를 더 편하게 시작하세요</p>
                    </div>
                </div>

                {platform === 'android' ? (
                    <button
                        onClick={handleInstallClick}
                        className="whitespace-nowrap bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm"
                    >
                        설치하기
                    </button>
                ) : platform === 'ios' ? (
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
                ) : (
                    <button
                        onClick={() => setShowInstallBanner(false)}
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
