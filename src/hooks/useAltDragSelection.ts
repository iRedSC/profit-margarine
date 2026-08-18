import { useEffect, useRef, useState } from "react";

interface SelectionBox {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

interface CopiedState {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function useAltDragSelection() {
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [copiedState, setCopiedState] = useState<CopiedState | null>(null);
    const isDraggingRef = useRef(false);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            // Only start if Alt key is pressed
            if (!e.altKey) {
                return;
            }

            // Skip if clicking on input elements or contenteditable elements
            const target = e.target as HTMLElement;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable ||
                    target.closest("input, textarea, [contenteditable='true']"))
            ) {
                return;
            }

            // Prevent default browser behavior (like text selection)
            e.preventDefault();
            e.stopPropagation();

            isDraggingRef.current = true;
            startPosRef.current = { x: e.clientX, y: e.clientY };
            setSelectionBox({
                startX: e.clientX,
                startY: e.clientY,
                endX: e.clientX,
                endY: e.clientY,
            });
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current || !startPosRef.current) {
                return;
            }

            // Update selection box
            setSelectionBox({
                startX: startPosRef.current.x,
                startY: startPosRef.current.y,
                endX: e.clientX,
                endY: e.clientY,
            });
        };

        const finishMouseUp = async (e: MouseEvent) => {
            if (!isDraggingRef.current || !startPosRef.current) {
                return;
            }

            isDraggingRef.current = false;

            // Calculate bounding box
            const box = {
                startX: startPosRef.current.x,
                startY: startPosRef.current.y,
                endX: e.clientX,
                endY: e.clientY,
            };

            // Normalize coordinates (handle drag in any direction)
            const left = Math.min(box.startX, box.endX);
            const right = Math.max(box.startX, box.endX);
            const top = Math.min(box.startY, box.endY);
            const bottom = Math.max(box.startY, box.endY);

            const width = right - left;
            const height = bottom - top;

            // Copy text within bounding box directly to clipboard
            const copied = await copyTextInBoundingBox(left, top, right, bottom);

            // Show copied feedback
            if (copied) {
                setCopiedState({
                    x: left,
                    y: top,
                    width,
                    height,
                });
                
                // Clear copied state after animation
                setTimeout(() => {
                    setCopiedState(null);
                }, 1500);
            }

            // Clear selection box
            setSelectionBox(null);
            startPosRef.current = null;
        };

        const handleMouseUp = (event: MouseEvent) => {
            void finishMouseUp(event);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            // If Alt key is released while dragging, cancel the drag
            if (e.key === "Alt" && isDraggingRef.current) {
                isDraggingRef.current = false;
                setSelectionBox(null);
                startPosRef.current = null;
            }
        };

        // Add event listeners
        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("keyup", handleKeyUp);

        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    return { selectionBox, copiedState };
}

async function copyTextInBoundingBox(
    left: number,
    top: number,
    right: number,
    bottom: number
) {

    // Find all text nodes in the document
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip script and style elements
                const parent = node.parentElement;
                if (
                    parent &&
                    (parent.tagName === "SCRIPT" ||
                        parent.tagName === "STYLE" ||
                        parent.tagName === "NOSCRIPT")
                ) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        }
    );

    interface TextNodeRange {
        node: Node;
        startOffset: number;
        endOffset: number;
        range: Range;
    }

    const intersectingNodes: TextNodeRange[] = [];
    let node: Node | null;

    while ((node = walker.nextNode())) {
        if (!node.textContent || !node.parentElement) {
            continue;
        }

        // Get the bounding rect of the text node
        const range = document.createRange();
        try {
            range.selectNodeContents(node);
        } catch {
            continue;
        }

        const rect = range.getBoundingClientRect();

        // Skip if the rect is invalid (zero size and position)
        if (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0) {
            continue;
        }

        // Check if the text node's bounding box intersects with our selection box
        // Use inclusive intersection check
        const intersects =
            rect.right > left &&
            rect.left < right &&
            rect.bottom > top &&
            rect.top < bottom;

        if (intersects) {
            // Determine which portion of this text node intersects with the bounding box
            let nodeStartOffset: number;
            let nodeEndOffset: number;

            // Check if the entire node is within the box
            if (rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom) {
                // Entire node is within the box
                nodeStartOffset = 0;
                nodeEndOffset = node.textContent.length;
            } else {
                // Partial intersection - calculate offsets based on intersection
                // For the start, find the offset closest to the left edge of the selection box
                nodeStartOffset = getOffsetAtPoint(node, Math.max(left, rect.left), Math.max(top, rect.top));
                // For the end, find the offset closest to the right edge of the selection box
                nodeEndOffset = getOffsetAtPoint(node, Math.min(right, rect.right), Math.min(bottom, rect.bottom));
                
                // If the box starts before this node, start from the beginning
                if (left <= rect.left) {
                    nodeStartOffset = 0;
                }
                // If the box ends after this node, end at the end
                if (right >= rect.right) {
                    nodeEndOffset = node.textContent.length;
                }
            }

            // Ensure start is before end
            const actualStart = Math.max(0, Math.min(nodeStartOffset, nodeEndOffset));
            const actualEnd = Math.min(
                node.textContent.length,
                Math.max(nodeStartOffset, nodeEndOffset)
            );

            // Only add if there's actual content to select
            if (actualStart < actualEnd) {
                const textRange = document.createRange();
                try {
                    textRange.setStart(node, actualStart);
                    textRange.setEnd(node, actualEnd);
                    intersectingNodes.push({
                        node,
                        startOffset: actualStart,
                        endOffset: actualEnd,
                        range: textRange,
                    });
                } catch {
                    // If range setting fails, try selecting the entire node
                    try {
                        const fullRange = document.createRange();
                        fullRange.selectNodeContents(node);
                        intersectingNodes.push({
                            node,
                            startOffset: 0,
                            endOffset: node.textContent.length,
                            range: fullRange,
                        });
                    } catch {
                        // Skip this node if we can't create a range
                    }
                }
            }
        }
    }

    if (intersectingNodes.length === 0) {
        return;
    }

    // Sort nodes by visual position (top to bottom, left to right)
    // This helps maintain a logical order when copying text
    intersectingNodes.sort((a, b) => {
        const rectA = a.range.getBoundingClientRect();
        const rectB = b.range.getBoundingClientRect();
        
        // First sort by vertical position (top)
        const topDiff = rectA.top - rectB.top;
        if (Math.abs(topDiff) > 5) { // 5px threshold for "same line"
            return topDiff;
        }
        
        // If roughly on the same line, sort by horizontal position (left)
        return rectA.left - rectB.left;
    });

    // Collect text from each intersecting node, checking character-by-character
    // to ensure we only get text that's actually within the bounding box
    interface TextPart {
        text: string;
        top: number;
        left: number;
        right: number;
        bottom: number;
    }

    const textParts: TextPart[] = [];

    for (const item of intersectingNodes) {
        const textNode = item.node;
        if (!textNode.textContent) continue;

        const nodeRect = item.range.getBoundingClientRect();

        // Extract text character by character to ensure accuracy
        let nodeText = '';
        for (let i = item.startOffset; i < item.endOffset; i++) {
            const charRange = document.createRange();
            try {
                charRange.setStart(textNode, i);
                charRange.setEnd(textNode, i + 1);
            } catch {
                continue;
            }

            const charRect = charRange.getBoundingClientRect();
            
            // Skip zero-width characters
            if (charRect.width === 0 && charRect.height === 0) {
                // Include whitespace characters even if zero-width
                const char = textNode.textContent[i];
                if (char && /\s/.test(char)) {
                    nodeText += char;
                }
                continue;
            }

            // Only include characters whose bounding rect intersects with selection box
            const isInBox =
                charRect.right > left &&
                charRect.left < right &&
                charRect.bottom > top &&
                charRect.top < bottom;

            if (isInBox) {
                nodeText += textNode.textContent[i];
            }
        }

        if (nodeText.length > 0) {
            textParts.push({
                text: nodeText,
                top: nodeRect.top,
                left: nodeRect.left,
                right: nodeRect.right,
                bottom: nodeRect.bottom,
            });
        }
    }

    // Sort by position (top to bottom, then left to right)
    textParts.sort((a, b) => {
        const verticalDiff = a.top - b.top;
        if (Math.abs(verticalDiff) > 5) { // 5px threshold for "same line"
            return verticalDiff;
        }
        return a.left - b.left;
    });

    // Combine text parts, adding newlines for significant vertical gaps and spaces for horizontal gaps
    const combinedTextParts: string[] = [];
    let lastBottom = -Infinity;
    let lastRight = -Infinity;

    for (const part of textParts) {
        // Check if this is a new line (significant vertical gap)
        const isNewLine = part.top > lastBottom + 5;
        if (isNewLine && combinedTextParts.length > 0) {
            combinedTextParts.push('\n');
            lastRight = -Infinity; // Reset horizontal tracking for new line
        } else if (combinedTextParts.length > 0 && !isNewLine) {
            // Same line - check if there's a horizontal gap
            const horizontalGap = part.left - lastRight;
            if (horizontalGap > 3) {
                // Add a space between sections
                combinedTextParts.push(' ');
            }
        }
        
        lastBottom = Math.max(lastBottom, part.bottom);
        lastRight = part.right; // Track the actual right edge
        
        // Add the text part
        combinedTextParts.push(part.text);
    }

    const combinedText = combinedTextParts.join('').trim();

    // Copy to clipboard
    if (combinedText.length > 0) {
        try {
            await navigator.clipboard.writeText(combinedText);
            return true;
        } catch {
            // Fallback for browsers that don't support clipboard API
            // Create a temporary textarea and use execCommand
            const textarea = document.createElement('textarea');
            textarea.value = combinedText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (e) {
                // Clipboard copy failed
                document.body.removeChild(textarea);
                console.error('Failed to copy text to clipboard', e);
                return false;
            }
        }
    }
    return false;
}

function getOffsetAtPoint(node: Node, x: number, y: number): number {
    if (!node.textContent || node.textContent.length === 0) {
        return 0;
    }

    // Use Range.getBoundingClientRect() to find the character position
    const range = document.createRange();
    let bestOffset = 0;
    let minDistance = Infinity;

    // Try each character position to find the closest one
    for (let i = 0; i <= node.textContent.length; i++) {
        try {
            range.setStart(node, i);
            range.setEnd(node, i);

            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                continue;
            }

            // Calculate distance from point to this character position
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = Math.sqrt(
                Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                bestOffset = i;
            }
        } catch {
            // Skip invalid offsets
            continue;
        }
    }

    // If we're looking for a point before the text, return 0
    if (bestOffset === 0 && node.textContent.length > 0) {
        range.setStart(node, 0);
        range.setEnd(node, 0);
        const rect = range.getBoundingClientRect();
        if (x < rect.left || y < rect.top) {
            return 0;
        }
    }

    // If we're looking for a point after the text, return the length
    if (bestOffset === node.textContent.length && node.textContent.length > 0) {
        range.setStart(node, node.textContent.length);
        range.setEnd(node, node.textContent.length);
        const rect = range.getBoundingClientRect();
        if (x > rect.right || y > rect.bottom) {
            return node.textContent.length;
        }
    }

    return bestOffset;
}
