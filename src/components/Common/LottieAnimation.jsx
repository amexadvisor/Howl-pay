import React, { useEffect, useRef } from 'react';

export default function LottieAnimation({ path, style = {}, className = '', fallbackIcon = null }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clean up previous animation instance
    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    if (window.lottie) {
      try {
        animRef.current = window.lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: path
        });
      } catch (err) {
        console.warn('Lottie failed to load:', path, err);
      }
    }

    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [path]);

  return (
    <div ref={containerRef} style={style} className={className}>
      {!window.lottie && fallbackIcon && (
        <i className={fallbackIcon}></i>
      )}
    </div>
  );
}
