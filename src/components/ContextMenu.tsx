import { useEffect, useRef } from "react";

type ContextMenuProps = {
    x: number;
    y: number;
    onClose: () => void;
    items: Array<{
        label: string;
        onClick: () => void;
        disabled?: boolean;
    }>;
};

export function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        // Add event listeners
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        // Adjust position if menu would go off screen
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (x + rect.width > viewportWidth) {
                menuRef.current.style.left = `${viewportWidth - rect.width - 10}px`;
            }
            if (y + rect.height > viewportHeight) {
                menuRef.current.style.top = `${viewportHeight - rect.height - 10}px`;
            }
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [x, y, onClose]);

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{
                left: `${x}px`,
                top: `${y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {items.map((item, index) => (
                <button
                    key={index}
                    onClick={() => {
                        item.onClick();
                        onClose();
                    }}
                    disabled={item.disabled}
                    className={`w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed ${
                        index === 0 ? "rounded-t-lg" : ""
                    } ${index === items.length - 1 ? "rounded-b-lg" : ""}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
