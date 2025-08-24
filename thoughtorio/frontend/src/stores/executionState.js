import { writable } from 'svelte/store';

function createExecutionState() {
    const { subscribe, set, update } = writable({
        activeNodes: new Set(),
        completedNodes: new Set(),
        errorNodes: new Set(),
        activeWorkflows: new Set(),
        completedWorkflows: new Set()
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
        startWorkflow: (workflowId) => update(state => {
            state.activeWorkflows.add(workflowId);
            state.completedWorkflows.delete(workflowId);
            return state;
        }),
        completeWorkflow: (workflowId) => update(state => {
            state.activeWorkflows.delete(workflowId);
            state.completedWorkflows.add(workflowId);
            return state;
        }),
        reset: () => set({ 
            activeNodes: new Set(), 
            completedNodes: new Set(), 
            errorNodes: new Set(),
            activeWorkflows: new Set(),
            completedWorkflows: new Set()
        })
    };
}

export const executionState = createExecutionState();
