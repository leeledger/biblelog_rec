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
                    // 화면에서 벗어나면 클래스를 제거하여 다시 들어올 때 애니메이션 재실행
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
        <div className="min-h-screen bg-slate-50 font-sans text-gray-900 overflow-x-hidden">
            {/* Hero Section */}
            <section className="relative h-screen flex flex-col items-center justify-center text-center px-4 overflow-hidden">
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                    <img
                        src="/images/landing/hero.png"
                        alt="Bible reading journey background"
                        className="w-full h-full object-cover opacity-100 scale-105 animate-pulse-slow"
                    />
                    <div className="absolute inset-0 bg-black/50"></div>
                </div>

                <div className="relative z-10 max-w-4xl mx-auto space-y-8 animate-fade-in-up">
                    <header className="break-keep">
                        <div className="mb-4 inline-block px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20">
                            <span className="text-amber-400 font-black tracking-widest text-sm uppercase">bibleLog.kr</span>
                        </div>
                        {/* Patent Badge */}
                        <div className="mb-6 flex justify-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-xl rounded-2xl border border-amber-400/30 animate-pulse-slow">
                                <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
                                <span className="text-amber-100 font-bold text-xs md:text-sm">특허 출원 중: 실시간 음성 기반 낭독 진도 관리</span>
                            </div>
                        </div>
                        <h1 className="text-4xl md:text-7xl font-extrabold tracking-tight text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] mb-6 leading-tight">
                            바이블로그 <br className="md:hidden" /> <span className="text-amber-400">함께해요</span>
                        </h1>
                        <p className="text-lg md:text-2xl text-white font-medium drop-shadow-md font-serif leading-relaxed px-2">
                            "말씀이 내 목소리가 되고, <br className="md:hidden" /> 내 목소리가 기록이 되는 시간."
                        </p>
                    </header>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <button
                            onClick={scrollToLogin}
                            className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-bold text-lg shadow-xl shadow-purple-500/30 transition-all hover:scale-105 active:scale-95"
                        >
                            로그인
                        </button>
                        <div className="mt-4 sm:mt-0">
                            <InstallPWA />
                        </div>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-white/60">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7-7-7" />
                    </svg>
                </div>
            </section>

            {/* Value Infographics Section */}
            <section className="py-24 px-4 max-w-6xl mx-auto space-y-20">
                <div className="text-center space-y-4 break-keep reveal-on-scroll">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-800 leading-tight">
                        눈으로만 보던 말씀을 <br /> <span className="text-purple-600 border-b-4 border-purple-200">입술의 고백</span>으로
                    </h2>
                    <p className="text-gray-500 max-w-2xl mx-auto leading-relaxed px-4 break-keep">
                        더 이상 기록의 번거로움 때문에 멈추지 마세요.
                        음성 인식 기술이 당신의 신앙적 여정을 묵묵히 기록합니다.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {/* Card 1: 선포 */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow group relative overflow-hidden reveal-on-scroll delay-100">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                        <div className="relative z-10 space-y-6">
                            <img src="/images/landing/voice_icon.png" alt="Voice icon" className="w-20 h-20 mx-auto" />
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-gray-800 text-center">고백과 선포의 가치</h3>
                                <p className="text-gray-600 text-sm leading-relaxed text-center break-keep">
                                    "눈으로만 보던 말씀을 입술의 고백으로 선포하세요."
                                    당신의 목소리가 들리는 순간, 소중한 고백을 놓치지 않고 기록합니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Card 2: 여정 */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow group relative overflow-hidden reveal-on-scroll delay-300">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                        <div className="relative z-10 space-y-6">
                            <img src="/images/landing/progress_icon.png" alt="Journey icon" className="w-20 h-20 mx-auto" />
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-gray-800 text-center">낭독의 여정</h3>
                                <p className="text-gray-600 text-sm leading-relaxed text-center break-keep">
                                    "당신의 목소리가 머무는 곳마다, 성경 통독의 길에 불이 켜집니다."
                                    막연했던 통독의 과정이 따뜻한 빛의 여정으로 바뀝니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Card 3: 몰입 */}
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow group relative overflow-hidden break-keep reveal-on-scroll delay-500">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110"></div>
                        <div className="relative z-10 space-y-6">
                            <img src="/images/landing/immersion_icon.png" alt="Immersion icon" className="w-20 h-20 mx-auto" />
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-gray-800 text-center">기록과 습관</h3>
                                <p className="text-gray-600 text-sm leading-relaxed text-center break-keep">
                                    "당신의 사모함이 쌓여 흔들리지 않는 습관이 됩니다."
                                    음성 인식은 그저 당신의 성실한 발걸음을 기록해 주는 도구입니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Login / Auth Section */}
            <section ref={loginSectionRef} className="py-24 bg-gradient-to-b from-slate-50 to-white">
                <div className="max-w-md mx-auto px-4 reveal-on-scroll">
                    <div className="text-center mb-10 space-y-2">
                        <h2 className="text-2xl font-bold text-gray-800">함께 시작할까요?</h2>
                        <p className="text-gray-500">당신의 목소리로 말씀의 지도를 그려보세요.</p>
                    </div>

                    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100">
                        {authForm}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-slate-200 text-center space-y-4">
                <div className="flex flex-col items-center gap-1 text-slate-400">
                    <div className="flex justify-center gap-6">
                        <span className="text-xs">포도나무교회</span>
                        <span className="text-xs">Dev: 이종림</span>
                        <a href="mailto:luxual8@gmail.com" className="text-xs underline">문의</a>
                    </div>
                    <div className="mt-4 px-4 py-2 bg-slate-100 rounded-xl inline-block max-w-sm">
                        <p className="text-[10px] text-slate-500 font-medium break-all">
                            <span className="text-purple-600 font-bold">특허 출원 제 10-2026-0002574 호</span><br />
                            실시간 음성 인식 기반의 텍스트 매칭을 이용한 낭독 진도 관리 시스템 및 그 방법
                        </p>
                    </div>
                </div>
                <p className="text-[10px] text-slate-300">Copyright © 2026 이종림 All rights reserved.</p>
            </footer>

            {/* Global CSS for Animations */}
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.08); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .animate-pulse-slow {
          animation: pulse-slow 15s infinite ease-in-out;
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
