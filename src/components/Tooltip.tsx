import { useState, useRef, useEffect } from "react";

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
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    const updatePosition = () => {
        if (!triggerRef.current || !tooltipRef.current) return;

        const rect = triggerRef.current.getBoundingClientRect();
        const tooltipHeight = tooltipRef.current.offsetHeight || 250;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Show above if there's not enough space below but enough space above
        const shouldShowAbove = spaceBelow < tooltipHeight + 8 && spaceAbove > tooltipHeight + 8;
        setShowAbove(shouldShowAbove);

        // Calculate position using fixed positioning to escape parent containers
        const right = Math.max(8, window.innerWidth - rect.right);
        const top = shouldShowAbove
            ? rect.top - tooltipHeight - 8
            : rect.bottom + 8;

        setPosition({ top, right });
    };

    const handleMouseEnter = () => {
        setIsVisible(true);
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
        setPosition(null);
    };

    useEffect(() => {
        if (isVisible) {
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                updatePosition();
            });
        }
    }, [isVisible]);

    return (
        <>
            <div
                ref={triggerRef}
                className={`group relative ${className}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {children}
            </div>
            {isVisible && (
                <div
                    ref={tooltipRef}
                    className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-3 px-4 pointer-events-none"
                    style={{
                        top: position ? `${position.top}px` : '-9999px',
                        right: position ? `${position.right}px` : '-9999px',
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                    }}
                >
                    {content}
                    <div className={`absolute right-4 ${
                        showAbove ? "-bottom-1.5" : "-top-1.5"
                    }`}>
                        <div className={`w-3 h-3 bg-white border-gray-200 transform rotate-45 ${
                            showAbove 
                                ? "border-r border-b" 
                                : "border-l border-t"
                        }`}></div>
                    </div>
                </div>
            )}
        </>
    );
}
