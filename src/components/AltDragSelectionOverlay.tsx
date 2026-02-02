interface AltDragSelectionOverlayProps {
    selectionBox: {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    } | null;
    copiedState: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
}

export function AltDragSelectionOverlay({
    selectionBox,
    copiedState,
}: AltDragSelectionOverlayProps) {
    // Show copied state with orange fade-out animation
    if (copiedState) {
        return (
            <>
                <div
                    className="fixed pointer-events-none z-[9999] border-2 border-orange-500 bg-orange-500/20 animate-fade-out"
                    style={{
                        left: `${copiedState.x}px`,
                        top: `${copiedState.y}px`,
                        width: `${copiedState.width}px`,
                        height: `${copiedState.height}px`,
                    }}
                />
                <div
                    className="fixed pointer-events-none z-[10000] text-orange-500 font-semibold text-lg animate-pop-fade"
                    style={{
                        left: `${copiedState.x + copiedState.width / 2}px`,
                        top: `${copiedState.y + copiedState.height / 2}px`,
                    }}
                >
                    Copied
                </div>
            </>
        );
    }

    // Show normal selection box
    if (!selectionBox) {
        return null;
    }

    // Calculate position and size
    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);

    return (
        <div
            className="fixed pointer-events-none z-[9999] border-2 border-primary bg-primary/10"
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
            }}
        />
    );
}
