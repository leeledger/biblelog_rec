import React from 'react';

export const BrowserRecommendation: React.FC = () => {
    const isUnsupportedBrowser = () => {
        const ua = navigator.userAgent;
        // 카카오톡, 네이버 인앱 브라우저 감지
        return /KAKAOTALK|NAVER/i.test(ua);
    };

    if (!isUnsupportedBrowser()) {
        return null;
    }

    return (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
            <p className="font-bold">브라우저 권장 안내</p>
            <p>음성 인식 기능을 사용하려면 Chrome, Safari 또는 Edge 브라우저를 사용해주세요.</p>
        </div>
    );
};
