import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
    children: React.ReactNode;
    content: React.ReactNode;
    showOnHover?: boolean;
    className?: string;
};

export function Tooltip({
    children,
    content,
    showOnHover = true,
    className = "",
}: TooltipProps) {
    const [showAbove, setShowAbove] = useState(false);
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
    const [caretPosition, setCaretPosition] = useState<{ right: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    const updatePosition = useCallback(() => {
        if (!triggerRef.current || !tooltipRef.current) return;

        const rect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || 300;
        const tooltipHeight = tooltipRect.height || 250;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const spaceRight = window.innerWidth - rect.right;
        const spaceLeft = rect.left;

        // Show above if there's not enough space below but enough space above
        const shouldShowAbove = spaceBelow < tooltipHeight + 8 && spaceAbove > tooltipHeight + 8;
        setShowAbove(shouldShowAbove);

        // Calculate horizontal position - prefer right alignment, but use left if needed
        let right: number;
        if (spaceRight >= tooltipWidth + 8) {
            // Enough space on the right, align to the right edge of trigger
            right = Math.max(8, window.innerWidth - rect.right);
        } else if (spaceLeft >= tooltipWidth + 8) {
            // Not enough space on right, but enough on left - align to left edge
            right = window.innerWidth - rect.left;
        } else {
            // Not enough space on either side, center it
            right = window.innerWidth - rect.left - (rect.width / 2) - (tooltipWidth / 2);
            right = Math.max(8, Math.min(right, window.innerWidth - tooltipWidth - 8));
        }

        const top = shouldShowAbove
            ? rect.top - tooltipHeight - 8
            : rect.bottom + 8;

        setPosition({ top, right });

        // Calculate caret position - align with the center of the trigger element
        // Tooltip right edge is at: window.innerWidth - right
        // Trigger center is at: rect.left + rect.width / 2
        // Distance from tooltip right edge to trigger center: (window.innerWidth - right) - (rect.left + rect.width / 2)
        const tooltipRightEdgeX = window.innerWidth - right;
        const triggerCenterX = rect.left + (rect.width / 2);
        const distanceFromRightEdge = tooltipRightEdgeX - triggerCenterX;
        
        // Clamp caret position to stay within tooltip bounds (with some padding)
        const minCaretRight = 12; // Minimum distance from right edge
        const maxCaretRight = tooltipWidth - 12; // Maximum distance from right edge
        const clampedCaretRight = Math.max(minCaretRight, Math.min(maxCaretRight, distanceFromRightEdge));
        
        setCaretPosition({ right: clampedCaretRight });
    }, []);

    const handleMouseEnter = () => {
        setIsVisible(true);
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
        setPosition(null);
        setCaretPosition(null);
    };

    useEffect(() => {
        if (isVisible) {
            // Use requestAnimationFrame to ensure DOM is updated, then update again after render
            requestAnimationFrame(() => {
                updatePosition();
                // Update again after a short delay to account for content rendering
                setTimeout(() => {
                    updatePosition();
                }, 0);
            });
        }
    }, [isVisible, updatePosition]);

    // Update position on scroll/resize
    useEffect(() => {
        if (!isVisible) return;
        
        const handleUpdate = () => {
            updatePosition();
        };
        
        window.addEventListener('scroll', handleUpdate, true);
        window.addEventListener('resize', handleUpdate);
        
        return () => {
            window.removeEventListener('scroll', handleUpdate, true);
            window.removeEventListener('resize', handleUpdate);
        };
    }, [isVisible, updatePosition]);

    return (
        <>
            <div
                ref={triggerRef}
                className={`group relative ${className}`}
                onMouseEnter={showOnHover ? handleMouseEnter : undefined}
                onMouseLeave={showOnHover ? handleMouseLeave : undefined}
            >
                {children}
            </div>
            {isVisible && createPortal(
                <div
                    ref={tooltipRef}
                    className="fixed bg-popover border rounded-lg shadow-lg py-3 px-4 pointer-events-none text-popover-foreground"
                    style={{
                        top: position ? `${position.top}px` : '-9999px',
                        right: position ? `${position.right}px` : '-9999px',
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        zIndex: 99999,
                        isolation: 'isolate',
                    }}
                >
                    {content}
                    {caretPosition && (
                        <div 
                            className={`absolute ${
                                showAbove ? "-bottom-1.5" : "-top-1.5"
                            }`}
                            style={{
                                right: `${caretPosition.right}px`,
                            }}
                        >
                            <div className={`w-3 h-3 bg-popover border-border transform rotate-45 ${
                                showAbove 
                                    ? "border-r border-b" 
                                    : "border-l border-t"
                            }`}></div>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
