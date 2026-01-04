import React, { useEffect, useState } from 'react';
import './VerseFadeIn.css';

interface VerseFadeInProps {
  verseText: string;
  className?: string;
  isAndroid?: boolean;
}

const VerseFadeIn: React.FC<VerseFadeInProps> = ({ verseText, className, isAndroid = false }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    // Android: 200ms, iOS: 400ms
    const timeout = setTimeout(() => setVisible(true), isAndroid ? 200 : 400);
    return () => clearTimeout(timeout);
  }, [verseText, isAndroid]);

  return (
    <div className={`fade-in-verse${visible ? ' visible' : ''} ${isAndroid ? ' android-faster' : ''} ${className || ''}`}>
      {verseText}
    </div>
  );
};

export default VerseFadeIn;
