import React, { useRef, useState, useEffect } from 'react';
import InstallPWA from './InstallPWA';

interface LandingPageProps {
    authForm: React.ReactNode;
}

const LandingPage: React.FC<LandingPageProps> = ({ authForm }) => {
    const loginSectionRef = useRef<HTMLDivElement>(null);
    const [isStandalone, setIsStandalone] = useState(false);

    // PWA standalone 모드 감지 (이미 설치된 앱에서 실행 중인지)
    useEffect(() => {
        const standalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || document.referrer.includes('android-app://');
        setIsStandalone(standalone);
    }, []);

    React.useEffect(() => {
        const observerOptions = {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                } else {
                    entry.target.classList.remove('is-visible');
                }
            });
        }, observerOptions);

        const revealElements = document.querySelectorAll('.reveal-on-scroll');
        revealElements.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, []);

    const scrollToLogin = () => {
        loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div className="min-h-screen bg-slate-900 font-sans text-gray-900 overflow-x-hidden">
            {/* Hero Section - 스플래시 화면용 */}
            <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 overflow-hidden">
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                    <img
                        src="/images/landing/hero.png"
                        alt="Bible reading journey background"
                        className="w-full h-full object-cover opacity-70 scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-slate-900/80"></div>
                </div>

                <div className="relative z-10 max-w-4xl mx-auto space-y-10 animate-fade-in-up px-4">
                    {/* Logo Badge */}
                    <div className="mb-2 inline-block px-5 py-2 bg-white/5 backdrop-blur-md rounded-full border border-white/10">
                        <span className="text-amber-400 font-black tracking-[0.3em] text-sm uppercase">BIBLELOG</span>
                    </div>

                    {/* 메인 카피 */}
                    <header className="break-keep space-y-6">
                        <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight drop-shadow-lg">
                            <span className="block">눈으로 읽는 말씀은</span>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-red-400">50%에 불과합니다</span>
                        </h1>

                        {/* 서브 카피 */}
                        <p className="text-base md:text-xl text-white/90 font-medium leading-relaxed max-w-lg mx-auto break-keep drop-shadow">
                            믿음은 들음에서 나고, 들음은 말씀에서 나옵니다.
                            <span className="block mt-2">바이블로그는 당신의 <span className="text-amber-400 font-bold">'목소리'</span>로</span>
                            <span className="block">나머지 50%를 채웁니다.</span>
                        </p>
                    </header>

                    {/* 핵심 슬로건 */}
                    <div className="py-5 px-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 max-w-md mx-auto">
                        <p className="text-sm md:text-base text-white font-serif italic leading-relaxed break-keep">
                            "입으로 시인하고, 귀로 듣고,<br className="md:hidden" />
                            마음에 새기십시오."
                            <span className="block mt-2 text-amber-300">이것이 우리가 '소리'를 고집하는 이유입니다.</span>
                        </p>
                    </div>

                    {/* Patent Badge */}
                    <div className="flex justify-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 backdrop-blur-xl rounded-full border border-purple-400/30">
                            <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-pulse"></span>
                            <span className="text-purple-200 font-medium text-xs">특허 출원 중: 실시간 음성 기반 낭독 진도 관리</span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
                        <button
                            onClick={scrollToLogin}
                            className="px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-full font-bold text-lg shadow-xl shadow-amber-500/25 transition-all hover:scale-105 active:scale-95"
                        >
                            시작하기
                        </button>
                        <div className="mt-2 sm:mt-0">
                            <InstallPWA />
                        </div>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-white/40">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7-7-7" />
                    </svg>
                </div>
            </section>

            {/* 하가(Hagah) 설명 섹션 */}
            <section className="py-24 px-4 bg-gradient-to-b from-slate-900 to-slate-800">
                <div className="max-w-4xl mx-auto space-y-12">
                    <div className="text-center space-y-4 reveal-on-scroll">
                        <h2 className="text-2xl md:text-4xl font-bold text-white leading-tight">
                            왜 <span className="text-amber-400">'낭독'</span>이어야 할까요?
                        </h2>
                    </div>

                    {/* 하가 설명 카드 */}
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* 유대인의 지혜 */}
                        <div className="bg-slate-800/50 backdrop-blur-md p-8 rounded-3xl border border-slate-700 reveal-on-scroll delay-100">
                            <div className="space-y-4">
                                <div className="inline-block px-3 py-1 bg-amber-500/20 rounded-full">
                                    <span className="text-amber-400 font-bold text-sm">📜 유대인의 천년 지혜</span>
                                </div>
                                <h3 className="text-xl font-bold text-white">하가(Hagah)</h3>
                                <p className="text-slate-300 text-sm leading-relaxed break-keep">
                                    시편 1편의 "주야로 묵상하는도다"에서 <span className="text-amber-400 font-semibold">'묵상'</span>의 히브리어 원어는
                                    <span className="text-amber-400 font-bold"> '하가(Hagah)'</span>,
                                    즉 <span className="italic">'작은 소리로 읊조리다'</span>라는 뜻입니다.
                                </p>
                                <p className="text-slate-400 text-sm leading-relaxed break-keep">
                                    성경적 묵상은 침묵 속에 잠기는 것이 아니라,
                                    사자가 으르렁거리듯 말씀을 입 밖으로 내뱉어 내 영혼에 선포하는 행위입니다.
                                </p>
                            </div>
                        </div>

                        {/* 뇌과학 */}
                        <div className="bg-slate-800/50 backdrop-blur-md p-8 rounded-3xl border border-slate-700 reveal-on-scroll delay-300">
                            <div className="space-y-4">
                                <div className="inline-block px-3 py-1 bg-purple-500/20 rounded-full">
                                    <span className="text-purple-400 font-bold text-sm">🧠 뇌과학적 근거</span>
                                </div>
                                <h3 className="text-xl font-bold text-white">3중 자극 학습법</h3>
                                <p className="text-slate-300 text-sm leading-relaxed break-keep">
                                    뇌과학적으로 눈으로만 보는 것보다 <span className="text-purple-400 font-semibold">소리 내어 읽을 때 전두엽이 훨씬 더 강하게 활성화</span>됩니다.
                                </p>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium">👁️ 눈으로 보고</span>
                                    <span className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-xs font-medium">👄 입으로 말하고</span>
                                    <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-medium">👂 귀로 듣는</span>
                                </div>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    3중 자극을 통해 말씀이 당신의 뇌와 심장에 깊이 각인됩니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 핵심 메시지 */}
                    <div className="text-center py-8 reveal-on-scroll delay-500">
                        <p className="text-lg md:text-xl text-slate-300 font-serif italic leading-relaxed max-w-2xl mx-auto break-keep">
                            "편리하게 훑어보는 <span className="text-slate-400">'눈의 통독'</span>이 아니라,<br />
                            조금 힘들더라도 온몸으로 읽어내는 <span className="text-amber-400 font-bold">'삶의 통독'</span>."
                        </p>
                    </div>
                </div>
            </section>

            {/* Value Cards Section */}
            <section className="py-24 px-4 bg-slate-50">
                <div className="max-w-6xl mx-auto space-y-16">
                    <div className="text-center space-y-4 break-keep reveal-on-scroll">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 leading-tight">
                            눈으로 <span className="text-slate-400">50%</span>, 입으로 <span className="text-amber-500">50%</span><br />
                            <span className="text-purple-600">온전한 100%의 통독</span>
                        </h2>
                        <p className="text-gray-500 max-w-2xl mx-auto leading-relaxed px-4 break-keep">
                            더 이상 기록의 번거로움 때문에 멈추지 마세요.<br />
                            음성 인식 기술이 당신의 신앙적 여정을 묵묵히 기록합니다.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Card 1: 선포 */}
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow group relative overflow-hidden reveal-on-scroll delay-100">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                            <div className="relative z-10 space-y-6">
                                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-3xl">🎙️</span>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-xl font-bold text-gray-800 text-center">입술의 고백</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed text-center break-keep">
                                        "말씀은 눈이 아닌 입술로 완성됩니다."<br />
                                        당신의 목소리가 곧 당신의 신앙 고백입니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: 여정 */}
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow group relative overflow-hidden reveal-on-scroll delay-300">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                            <div className="relative z-10 space-y-6">
                                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-400 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-3xl">📖</span>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-xl font-bold text-gray-800 text-center">낭독의 여정</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed text-center break-keep">
                                        "당신의 목소리가 머무는 곳마다, 성경 통독의 길에 불이 켜집니다."<br />
                                        막연했던 통독이 따뜻한 빛의 여정으로 바뀝니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: 습관 */}
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow group relative overflow-hidden break-keep reveal-on-scroll delay-500">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                            <div className="relative z-10 space-y-6">
                                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-3xl">🌱</span>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-xl font-bold text-gray-800 text-center">거룩한 습관</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed text-center break-keep">
                                        "편안한 눈보다 거룩한 입술을 원합니다."<br />
                                        당신의 사모함이 쌓여 흔들리지 않는 습관이 됩니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Login / Auth Section */}
            <section ref={loginSectionRef} className="py-24 bg-gradient-to-b from-slate-50 to-white">
                <div className="max-w-md mx-auto px-4 reveal-on-scroll">
                    <div className="text-center mb-10 space-y-3">
                        <h2 className="text-2xl font-bold text-gray-800">바이블로그와 함께하세요</h2>
                        <p className="text-gray-500 text-sm">당신의 목소리로 말씀의 지도를 그려보세요.</p>
                    </div>

                    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100">
                        {authForm}
                    </div>

                    {/* 추가 슬로건 */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-400 italic">
                            "당신의 목소리가 곧 당신의 신앙 고백입니다."
                        </p>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 bg-slate-900 border-t border-slate-800 text-center space-y-4">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                    <p className="text-amber-400 font-bold text-sm">BIBLELOG</p>
                    <div className="flex justify-center gap-6">
                        <span className="text-xs">포도나무교회</span>
                        <span className="text-xs">Dev: 이종림</span>
                        <a href="mailto:luxual8@gmail.com" className="text-xs underline hover:text-white transition-colors">문의</a>
                    </div>
                    <div className="mt-4 px-4 py-2 bg-slate-800 rounded-xl inline-block max-w-sm">
                        <p className="text-[10px] text-slate-500 font-medium break-all">
                            <span className="text-purple-400 font-bold">특허 출원 중 (제 10-2026-0002574 호)</span><br />
                            실시간 음성 인식 기반의 텍스트 매칭을 이용한 낭독 진도 관리 시스템 및 그 방법
                        </p>
                    </div>
                </div>
                <p className="text-[10px] text-slate-600">Copyright © 2026 이종림 All rights reserved.</p>
            </footer>

            {/* Global CSS for Animations */}
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        /* Scroll Reveal Styles */
        .reveal-on-scroll {
          opacity: 0;
          transform: translateY(40px);
          transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
          will-change: opacity, transform;
        }
        .reveal-on-scroll.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        
        .delay-100 { transition-delay: 100ms; }
        .delay-300 { transition-delay: 300ms; }
        .delay-500 { transition-delay: 500ms; }
      `}} />
        </div>
    );
};

export default LandingPage;
