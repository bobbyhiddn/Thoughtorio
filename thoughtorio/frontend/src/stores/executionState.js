import { writable } from 'svelte/store';

function createExecutionState() {
    const { subscribe, set, update } = writable({
        activeNodes: new Set(),
        completedNodes: new Set(),
        errorNodes: new Set()
    });

    return {
        subscribe,
        startNode: (nodeId) => update(state => {
            state.activeNodes.add(nodeId);
            state.completedNodes.delete(nodeId);
            state.errorNodes.delete(nodeId);
            return state;
        }),
        completeNode: (nodeId) => update(state => {
            state.activeNodes.delete(nodeId);
            state.completedNodes.add(nodeId);
            return state;
        }),
        errorNode: (nodeId) => update(state => {
            state.activeNodes.delete(nodeId);
            state.errorNodes.add(nodeId);
            return state;
        }),
        reset: () => set({ activeNodes: new Set(), completedNodes: new Set(), errorNodes: new Set() })
    };
}

export const executionState = createExecutionState();
