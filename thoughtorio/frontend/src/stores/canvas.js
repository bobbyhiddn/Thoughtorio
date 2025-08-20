import { writable } from 'svelte/store';

// Canvas viewport state
export const viewport = writable({
    x: 0,
    y: 0,
    zoom: 1
});

// Canvas interaction state
export const canvasState = writable({
    mode: 'select', // 'select', 'pan', 'connecting', 'box-selecting'
    selectedNode: null,
    selectedConnection: null,
    selectedNodes: [],
    isDragging: false,
    isConnecting: false,
    connectionStart: null,
    boxSelection: null
});

// Helper functions for viewport operations
export const viewportActions = {
    pan: (deltaX, deltaY) => {
        viewport.update(v => ({
            ...v,
            x: v.x + deltaX,
            y: v.y + deltaY
        }));
    },
    
    zoom: (factor, centerX = 0, centerY = 0) => {
        viewport.update(v => {
            const newZoom = Math.max(0.1, Math.min(3, v.zoom * factor));
            const zoomDelta = newZoom - v.zoom;
            
            return {
                ...v,
                zoom: newZoom,
                x: v.x - (centerX * zoomDelta),
                y: v.y - (centerY * zoomDelta)
            };
        });
    },
    
    reset: () => {
        viewport.set({ x: 0, y: 0, zoom: 1 });
    }
};