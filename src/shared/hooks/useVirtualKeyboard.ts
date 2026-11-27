import { useState, useEffect } from 'react';

export interface VisualViewportMetrics {
    isKeyboardOpen: boolean;
    viewportHeight: number;
    keyboardOffsetBottom: number;
}

/**
 * Scroll elemen yang sedang difokuskan ke 1/4 - 1/3 bagian atas area yang terlihat
 * pada parent container terdekat yang memiliki scrollable overflow (misalnya form modal).
 */
export function scrollInputIntoView(target: HTMLElement) {
    let parent: HTMLElement | null = target.parentElement;
    let scrollContainer: HTMLElement | null = null;
    while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
            scrollContainer = parent;
            break;
        }
        parent = parent.parentElement;
    }

    if (scrollContainer) {
        const targetRect = target.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const relativeTop = targetRect.top - containerRect.top;
        const targetVisibleHeight = containerRect.height;
        // Posisikan elemen di 1/4 bagian atas container agar leluasa di atas keyboard
        const desiredOffset = targetVisibleHeight * 0.22;
        scrollContainer.scrollBy({
            top: relativeTop - desiredOffset,
            behavior: 'smooth',
        });
    } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * Hook metrik visual viewport untuk mobile/tablet (iOS & Android).
 */
export function useVisualViewportMetrics(): VisualViewportMetrics {
    const [metrics, setMetrics] = useState<VisualViewportMetrics>(() => {
        if (typeof window === 'undefined') {
            return { isKeyboardOpen: false, viewportHeight: 800, keyboardOffsetBottom: 0 };
        }
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const offset = window.innerHeight - vh;
        const isKb = vh < window.innerHeight * 0.8;
        return { isKeyboardOpen: isKb, viewportHeight: vh, keyboardOffsetBottom: Math.max(0, offset) };
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        let rafId: number | null = null;
        let lastVh = 0;

        const updateMetrics = () => {
            if (rafId !== null) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                if (Math.abs(vh - lastVh) < 3 && lastVh > 0) return;
                lastVh = vh;
                const offset = window.innerHeight - vh;
                const isKb = vh < window.innerHeight * 0.8;
                setMetrics({
                    isKeyboardOpen: isKb,
                    viewportHeight: vh,
                    keyboardOffsetBottom: Math.max(0, offset),
                });

                // Jika keyboard terbuka dan ada elemen input aktif, posisikan di atas keyboard
                if (isKb && document.activeElement) {
                    const el = document.activeElement as HTMLElement;
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                        setTimeout(() => {
                            scrollInputIntoView(el);
                        }, 80);
                    }
                }
            });
        };

        const viewport = window.visualViewport;
        if (viewport) {
            viewport.addEventListener('resize', updateMetrics);
            viewport.addEventListener('scroll', updateMetrics);
        } else {
            window.addEventListener('resize', updateMetrics);
        }

        // Listener global untuk auto-scroll elemen input saat fokus
        const handleFocusIn = (e: FocusEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                setTimeout(() => {
                    scrollInputIntoView(target);
                }, 150);
            }
        };

        document.addEventListener('focusin', handleFocusIn);

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            if (viewport) {
                viewport.removeEventListener('resize', updateMetrics);
                viewport.removeEventListener('scroll', updateMetrics);
            } else {
                window.removeEventListener('resize', updateMetrics);
            }
            document.removeEventListener('focusin', handleFocusIn);
        };
    }, []);

    return metrics;
}

/**
 * Hook boolean backward-compatible untuk mendeteksi software keyboard di mobile (iOS/Android).
 */
export function useVirtualKeyboard(): boolean {
    const { isKeyboardOpen } = useVisualViewportMetrics();
    return isKeyboardOpen;
}
