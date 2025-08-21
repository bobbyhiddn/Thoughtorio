import { writable, derived, get } from 'svelte/store';
import { nodes, connections, nodeActions, nodeDataStore } from './nodes.js';
import { settings } from './settings.js';

// A derived store that creates a key representing the state of all nodes.
// This forces the workflowContainers store to update when a node's properties change.
const nodeStateKey = derived(nodes, ($nodes) => 
    $nodes.map(n => `${n.id}:${n.x}:${n.y}:${n.width}:${n.height}`).join(',')
);

// Workflow containers - groups of connected nodes
export const workflowContainers = derived([nodes, connections, nodeStateKey], ([$nodes, $connections]) => {
    // The nodeStateKey is not used directly, but its inclusion in the dependency
    // array makes this derived store reactive to changes in node properties.
    return detectConnectedComponents($nodes, $connections);
});

/**
 * Detects connected components in the node graph
 * Returns array of workflow containers, each containing connected nodes
 */
function detectConnectedComponents(nodeList, connectionList) {
    if (nodeList.length === 0) return [];
    
    // Build adjacency list for graph traversal
    const adjacency = new Map();
    nodeList.forEach(node => {
        adjacency.set(node.id, new Set());
    });
    
    // Add connections (bidirectional for grouping purposes)
    connectionList.forEach(conn => {
        if (adjacency.has(conn.fromId) && adjacency.has(conn.toId)) {
            adjacency.get(conn.fromId).add(conn.toId);
            adjacency.get(conn.toId).add(conn.fromId);
        }
    });
    
    const visited = new Set();
    const components = [];
    
    // DFS to find connected components
    function dfs(nodeId, component) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        
        const node = nodeList.find(n => n.id === nodeId);
        if (node) {
            component.push(node);
            
            // Visit all connected nodes
            for (const neighbor of adjacency.get(nodeId)) {
                dfs(neighbor, component);
            }
        }
    }
    
    // Find all connected components
    for (const node of nodeList) {
        if (!visited.has(node.id)) {
            const component = [];
            dfs(node.id, component);
            
            if (component.length > 0) {
                components.push(createWorkflowContainer(component, connectionList));
            }
        }
    }
    
    return components;
}

/**
 * Creates a workflow container for a group of connected nodes
 */
function createWorkflowContainer(nodeGroup, connectionList) {
    // Calculate bounding box with padding
    const padding = 20;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    nodeGroup.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    });
    
    // Find connections within this group
    const nodeIds = new Set(nodeGroup.map(n => n.id));
    const internalConnections = connectionList.filter(conn => 
        nodeIds.has(conn.fromId) && nodeIds.has(conn.toId)
    );
    
    // Determine if this is a multi-node workflow (needs play button)
    const isWorkflow = nodeGroup.length > 1 || internalConnections.length > 0;
    
    return {
        id: `workflow-${nodeGroup.map(n => n.id).sort().join('-')}`,
        nodes: nodeGroup,
        connections: internalConnections,
        bounds: {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + (2 * padding),
            height: (maxY - minY) + (2 * padding)
        },
        isWorkflow,
        executionState: 'idle', // 'idle', 'running', 'completed', 'error'
        lastExecuted: null
    };
}

// Workflow execution state
export const executionState = writable({
    activeWorkflows: new Set(),
    activeNodes: new Set(),
    completedNodes: new Set(),
    results: new Map()
});

// Helper functions for workflow execution
export const workflowActions = {
    execute: async (workflowId) => {
        console.log('Executing workflow:', workflowId);
        
        executionState.update(state => ({
            ...state,
            activeWorkflows: new Set([...state.activeWorkflows, workflowId]),
            activeNodes: new Set(),
            completedNodes: new Set()
        }));
        
        try {
            // Get the workflow container synchronously
            let container = null;
            const unsubscribe = workflowContainers.subscribe(containers => {
                container = containers.find(c => c.id === workflowId);
            });
            unsubscribe();
            
            if (!container) {
                console.error('Workflow container not found:', workflowId);
                throw new Error('Workflow container not found');
            }
            
            console.log('Found workflow container, executing:', container);
            
            // Execute the workflow
            await executeWorkflow(container);
            
            // Mark as completed
            executionState.update(state => {
                const newActive = new Set(state.activeWorkflows);
                newActive.delete(workflowId);
                return {
                    ...state,
                    activeWorkflows: newActive
                };
            });
        } catch (error) {
            console.error('Error starting workflow execution:', error);
            executionState.update(state => {
                const newActive = new Set(state.activeWorkflows);
                newActive.delete(workflowId);
                return {
                    ...state,
                    activeWorkflows: newActive
                };
            });
        }
    },
    
    stop: (workflowId) => {
        executionState.update(state => {
            const newActive = new Set(state.activeWorkflows);
            newActive.delete(workflowId);
            return {
                ...state,
                activeWorkflows: newActive,
                activeNodes: new Set(),
                completedNodes: new Set()
            };
        });
    },

    setNodeExecuting: (nodeId) => {
        executionState.update(state => ({
            ...state,
            activeNodes: new Set([...state.activeNodes, nodeId])
        }));
    },

    setNodeCompleted: (nodeId) => {
        executionState.update(state => {
            const newActive = new Set(state.activeNodes);
            newActive.delete(nodeId);
            return {
                ...state,
                activeNodes: newActive,
                completedNodes: new Set([...state.completedNodes, nodeId])
            };
        });
    }
};

// Execute a workflow by processing nodes in topological order
async function executeWorkflow(container) {
    console.log('Executing workflow container:', container);
    
    // Get current settings
    const currentSettings = get(settings);
    
    console.log('Current settings for workflow execution:', currentSettings);
    
    // Check if we have the required AI configuration
    if (!currentSettings.activeMode || !currentSettings.story_processing_model_id) {
        throw new Error('AI provider and model must be configured in settings');
    }
    
    // Get API key based on active mode
    let apiKey = '';
    switch (currentSettings.activeMode) {
        case 'openrouter':
        case 'local':
            apiKey = currentSettings.openrouter_api_key;
            break;
        case 'openai':
            apiKey = currentSettings.openai_api_key;
            break;
        case 'gemini':
            apiKey = currentSettings.gemini_api_key;
            break;
    }
    
    if (currentSettings.activeMode !== 'local' && !apiKey) {
        throw new Error(`API key required for ${currentSettings.activeMode} provider`);
    }
    
    // Find all input nodes (nodes with no incoming connections)
    const inputNodes = container.nodes.filter(node => {
        const hasIncomingConnection = container.connections.some(conn => conn.toId === node.id);
        return !hasIncomingConnection && (node.type === 'input' || node.type === 'text');
    });
    
    console.log('Found input nodes:', inputNodes);
    
    // Process each input node and follow its connections
    for (const inputNode of inputNodes) {
        await processNodeChain(inputNode, container, currentSettings, apiKey);
    }
}

// Process a chain of nodes starting from an input node with contextual envelope
async function processNodeChain(startNode, container, settings, apiKey) {
    console.log('Processing node chain from:', startNode);
    
    const visited = new Set();
    const contextEnvelope = createContextEnvelope();
    
    // Add initial context from the start node
    if (startNode.content) {
        contextEnvelope.addStep(startNode.id, startNode.type, startNode.content, 'user_input');
    }
    
    await processNodeWithContext(startNode, container, settings, apiKey, contextEnvelope, visited);
}

// Process a single node with accumulated context
async function processNodeWithContext(currentNode, container, settings, apiKey, contextEnvelope, visited) {
    if (visited.has(currentNode.id)) {
        return;
    }
    visited.add(currentNode.id);
    
    console.log('Processing node with context:', currentNode.id, 'Context steps:', contextEnvelope.steps.length);
    
    // Get YAML backend data
    const nodeData = nodeActions.getNodeData(currentNode.id);
    if (!nodeData) {
        console.error('No YAML data found for node:', currentNode.id);
        return;
    }
    
    // Mark node as executing
    workflowActions.setNodeExecuting(currentNode.id);
    nodeActions.setNodeExecuting(currentNode.id);
    
    // If this is an AI node, process it with YAML context
    if (currentNode.type === 'dynamic') {
        await processAINodeWithYAMLContext(currentNode, nodeData, container, settings, apiKey);
    }
    
    // Mark node as completed
    workflowActions.setNodeCompleted(currentNode.id);
    nodeActions.setNodeCompleted(currentNode.id);
    
    // Find all nodes connected from this one and process them recursively
    const outgoingConnections = container.connections.filter(conn => conn.fromId === currentNode.id);
    for (const connection of outgoingConnections) {
        const nextNode = container.nodes.find(node => node.id === connection.toId);
        if (nextNode && !visited.has(nextNode.id)) {
            // Create a new context branch for this path
            const branchedContext = contextEnvelope.branch();
            
            // Add current node's output to context if it has content
            if (currentNode.content) {
                branchedContext.addStep(currentNode.id, currentNode.type, currentNode.content, 
                    currentNode.type === 'dynamic' ? 'ai_output' : 'user_input');
            }
            
            // Process the next node with the updated context
            await processNodeWithContext(nextNode, container, settings, apiKey, branchedContext, visited);
        }
    }
}

// Create a context envelope to track workflow history
function createContextEnvelope() {
    return {
        steps: [],
        metadata: {
            workflowId: crypto.randomUUID(),
            startTime: Date.now(),
            version: '1.0'
        },
        
        addStep(nodeId, nodeType, content, role) {
            this.steps.push({
                nodeId,
                nodeType,
                content: content.trim(),
                role, // 'user_input', 'ai_output', 'system'
                timestamp: Date.now(),
                stepIndex: this.steps.length
            });
        },
        
        getFullContext() {
            return this.steps.map(step => `[${step.role.toUpperCase()}]: ${step.content}`).join('\n\n');
        },
        
        getContextForAI() {
            // Create a clean, natural conversation history
            const contextParts = [];
            
            this.steps.forEach((step, index) => {
                if (step.role === 'user_input') {
                    contextParts.push(`Human: ${step.content}`);
                } else if (step.role === 'ai_output') {
                    contextParts.push(`Assistant: ${step.content}`);
                }
            });
            
            // Just return the natural conversation format
            return contextParts.join('\n\n');
        },
        
        branch() {
            // Create a copy of this context for parallel processing paths
            return {
                ...this,
                steps: [...this.steps],
                metadata: { ...this.metadata }
            };
        },
        
        getLastUserInput() {
            const userInputs = this.steps.filter(step => step.role === 'user_input');
            return userInputs.length > 0 ? userInputs[userInputs.length - 1].content : '';
        }
    };
}

// Process an AI node with YAML context data
async function processAINodeWithYAMLContext(aiNode, nodeData, container, settings, apiKey) {
    console.log('Processing AI node with YAML context:', aiNode.id);
    console.log('Node YAML data:', nodeData.toYAML());
    
    // Get processed input from YAML backend
    const inputText = nodeData.getProcessedInput();
    
    if (!inputText.trim()) {
        console.log('No input text found for AI node:', aiNode.id);
        return;
    }
    
    console.log('Input text for AI processing:', inputText);
    
    try {
        // Check if Wails runtime is available
        if (!window.go || !window.go.main || !window.go.main.App) {
            console.warn('Wails runtime not available - simulating AI completion');
            const simulatedResponse = `AI processed YAML context: "${inputText.substring(0, 100)}..." - This is a simulated response with YAML backend.`;
            
            // Update the AI node with the result
            nodeActions.setNodeCompleted(aiNode.id, simulatedResponse);
            return;
        }
        
        // Call the AI completion function with YAML context
        const response = await window.go.main.App.GetAICompletion(
            settings.activeMode,
            settings.story_processing_model_id,
            inputText,
            apiKey
        );
        
        console.log('AI completion response:', response);
        
        if (response && response.Content) {
            nodeActions.setNodeCompleted(aiNode.id, response.Content);
        } else if (response && response.Error) {
            const errorMsg = `Error: ${response.Error}`;
            nodeActions.setNodeError(aiNode.id, new Error(errorMsg));
        }
    } catch (error) {
        console.error('AI processing failed:', error);
        nodeActions.setNodeError(aiNode.id, error);
    }
}

// Legacy function - Process an AI node with full contextual envelope
async function processAINodeWithContext(aiNode, container, settings, apiKey, contextEnvelope) {
    console.log('Processing AI node with context:', aiNode.id);
    console.log('Context envelope:', contextEnvelope.getFullContext());
    
    // Find all input connections to this AI node
    const inputConnections = container.connections.filter(conn => conn.toId === aiNode.id);
    
    // Gather immediate input text from connected nodes
    let immediateInput = '';
    for (const connection of inputConnections) {
        const inputNode = container.nodes.find(node => node.id === connection.fromId);
        if (inputNode && inputNode.content) {
            immediateInput += inputNode.content + '\n';
        }
    }
    
    // If there's immediate input, add it to context
    if (immediateInput.trim()) {
        contextEnvelope.addStep(aiNode.id + '_input', 'input', immediateInput.trim(), 'user_input');
    }
    
    // Use contextual prompt instead of just immediate input
    const contextualPrompt = contextEnvelope.getContextForAI();
    
    if (!contextualPrompt.trim()) {
        console.log('No context found for AI node:', aiNode.id);
        return;
    }
    
    console.log('Contextual prompt for AI processing:', contextualPrompt);
    
    try {
        // Check if Wails runtime is available
        if (!window.go || !window.go.main || !window.go.main.App) {
            console.warn('Wails runtime not available - simulating AI completion');
            const simulatedResponse = `AI processed with context (${contextEnvelope.steps.length} steps): "${contextEnvelope.getLastUserInput()}" - This is a simulated contextual response.`;
            
            // Update the AI node with the result
            nodeActions.update(aiNode.id, { content: simulatedResponse });
            
            // Add AI response to context envelope
            contextEnvelope.addStep(aiNode.id, aiNode.type, simulatedResponse, 'ai_output');
            return;
        }
        
        // Call the AI completion function with full context
        const response = await window.go.main.App.GetAICompletion(
            settings.activeMode,
            settings.story_processing_model_id,
            contextualPrompt,
            apiKey
        );
        
        console.log('AI completion response:', response);
        
        if (response && response.Content) {
            nodeActions.update(aiNode.id, { content: response.Content });
            // Add AI response to context envelope
            contextEnvelope.addStep(aiNode.id, aiNode.type, response.Content, 'ai_output');
        } else if (response && response.Error) {
            const errorMsg = `Error: ${response.Error}`;
            nodeActions.update(aiNode.id, { content: errorMsg });
            contextEnvelope.addStep(aiNode.id, aiNode.type, errorMsg, 'ai_output');
        }
    } catch (error) {
        console.error('AI processing failed:', error);
        const errorMsg = `Error: ${error.message}`;
        nodeActions.update(aiNode.id, { content: errorMsg });
        contextEnvelope.addStep(aiNode.id, aiNode.type, errorMsg, 'ai_output');
    }
}

// Legacy function for backwards compatibility (not used in new context system)
async function processAINode(aiNode, container, settings, apiKey) {
    console.log('Processing AI node (legacy):', aiNode);
    
    // Find all input connections to this AI node
    const inputConnections = container.connections.filter(conn => conn.toId === aiNode.id);
    
    // Gather input text from connected nodes
    let inputText = '';
    for (const connection of inputConnections) {
        const inputNode = container.nodes.find(node => node.id === connection.fromId);
        if (inputNode && inputNode.content) {
            inputText += inputNode.content + '\n';
        }
    }
    
    if (!inputText.trim()) {
        console.log('No input text found for AI node:', aiNode.id);
        return;
    }
    
    console.log('Input text for AI processing:', inputText);
    
    try {
        // Check if Wails runtime is available
        if (!window.go || !window.go.main || !window.go.main.App) {
            console.warn('Wails runtime not available - simulating AI completion');
            const simulatedResponse = `AI processed: "${inputText.trim()}" - This is a simulated response since Wails runtime is not available.`;
            
            nodeActions.update(aiNode.id, { content: simulatedResponse });
            return;
        }
        
        // Call the AI completion function
        const response = await window.go.main.App.GetAICompletion(
            settings.activeMode,
            settings.story_processing_model_id,
            inputText.trim(),
            apiKey
        );
        
        console.log('AI completion response:', response);
        
        if (response && response.Content) {
            nodeActions.update(aiNode.id, { content: response.Content });
        } else if (response && response.Error) {
            nodeActions.update(aiNode.id, { content: `Error: ${response.Error}` });
        }
    } catch (error) {
        console.error('AI processing failed:', error);
        nodeActions.update(aiNode.id, { content: `Error: ${error.message}` });
    }
}