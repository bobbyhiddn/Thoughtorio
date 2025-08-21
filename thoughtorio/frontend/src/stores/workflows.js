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
    
    // First, detect basic node groups (traditional machines)
    const basicComponents = detectBasicNodeComponents(nodeList, connectionList);
    
    // Filter out individual nodes (keep only multi-node machines)
    const actualMachines = basicComponents.filter(container => container.isWorkflow);
    
    // Then, detect factory hierarchies (machine-to-node connections)
    const factoryComponents = detectFactoryComponents(actualMachines, connectionList, nodeList);
    
    return [...basicComponents, ...factoryComponents];
}

function detectBasicNodeComponents(nodeList, connectionList) {
    // Build adjacency list for node-to-node connections only
    const adjacency = new Map();
    nodeList.forEach(node => {
        adjacency.set(node.id, new Set());
    });
    
    // Add only node-to-node connections (bidirectional for grouping purposes)
    connectionList.forEach(conn => {
        const isNodeToNode = adjacency.has(conn.fromId) && adjacency.has(conn.toId);
        if (isNodeToNode) {
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

function detectFactoryComponents(machineContainers, connectionList, nodeList) {
    const factoryComponents = [];
    
    // Find machine-to-node and machine-to-machine connections
    const factoryConnections = connectionList.filter(conn => 
        conn.fromId.startsWith('workflow-') // Connections originating from machines
    );
    
    if (factoryConnections.length === 0) return [];
    
    console.log('Detected factory connections:', factoryConnections);
    
    // Group connected machines and nodes into factories using Union-Find approach
    const factoryAdjacency = new Map();
    
    // Add all machine containers as potential factory components
    machineContainers.forEach(machine => {
        factoryAdjacency.set(machine.id, new Set());
    });
    
    // Process all factory connections (machine-to-node and machine-to-machine)
    factoryConnections.forEach(conn => {
        // Add source machine if it exists
        if (factoryAdjacency.has(conn.fromId)) {
            factoryAdjacency.get(conn.fromId).add(conn.toId);
        }
        
        // Check if target node belongs to a machine
        let targetEntity = conn.toId;
        if (!conn.toId.startsWith('workflow-')) {
            // This is a node, check if it belongs to a machine
            const targetMachine = machineContainers.find(machine => 
                machine.nodes && machine.nodes.some(node => node.id === conn.toId)
            );
            if (targetMachine) {
                console.log(`Node ${conn.toId} belongs to machine ${targetMachine.id}, including entire machine in factory`);
                targetEntity = targetMachine.id;
                // Ensure the target machine is in adjacency
                if (!factoryAdjacency.has(targetEntity)) {
                    factoryAdjacency.set(targetEntity, new Set());
                }
            }
        }
        
        // Add the target (expanded to machine if applicable) to adjacency
        if (!factoryAdjacency.has(targetEntity)) {
            factoryAdjacency.set(targetEntity, new Set());
        }
        factoryAdjacency.get(targetEntity).add(conn.fromId);
        
        // If target is a machine, add bidirectional connection
        if (targetEntity.startsWith('workflow-') && factoryAdjacency.has(conn.fromId)) {
            factoryAdjacency.get(conn.fromId).delete(conn.toId); // Remove the individual node
            factoryAdjacency.get(conn.fromId).add(targetEntity); // Add the machine instead
        }
    });
    
    const visited = new Set();
    
    // DFS to find factory components
    function dfsFactory(entityId, factoryComponent) {
        if (visited.has(entityId)) return;
        visited.add(entityId);
        
        // Add to factory component
        factoryComponent.entities.add(entityId);
        
        // Visit connected entities
        if (factoryAdjacency.has(entityId)) {
            for (const neighbor of factoryAdjacency.get(entityId)) {
                dfsFactory(neighbor, factoryComponent);
            }
        }
    }
    
    // Find factory components
    for (const [entityId] of factoryAdjacency) {
        if (!visited.has(entityId)) {
            const factoryComponent = { entities: new Set() };
            dfsFactory(entityId, factoryComponent);
            
            if (factoryComponent.entities.size > 1) {
                console.log('Creating factory with entities:', Array.from(factoryComponent.entities));
                // Create factory container
                const factory = createFactoryContainer(factoryComponent, machineContainers, connectionList, nodeList);
                if (factory) {
                    console.log('Successfully created factory container:', factory);
                    factoryComponents.push(factory);
                }
            }
        }
    }
    
    return factoryComponents;
}

/**
 * Creates a factory container for machine-to-node hierarchies
 */
function createFactoryContainer(factoryComponent, machineContainers, connectionList, nodeList) {
    const { entities } = factoryComponent;
    
    // Get all machines and nodes in this factory
    const machines = machineContainers.filter(m => entities.has(m.id));
    const nodeIds = Array.from(entities).filter(id => !id.startsWith('workflow-'));
    
    if (machines.length === 0) return null;
    
    // Calculate bounding box that encompasses all machines and nodes
    const padding = 30;
    const playButtonSpace = 50; // Space above container for play button
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Include machine bounds
    machines.forEach(machine => {
        minX = Math.min(minX, machine.bounds.x);
        minY = Math.min(minY, machine.bounds.y);
        maxX = Math.max(maxX, machine.bounds.x + machine.bounds.width);
        maxY = Math.max(maxY, machine.bounds.y + machine.bounds.height);
    });
    
    // Include individual node positions (for nodes connected to machines)
    nodeIds.forEach(nodeId => {
        const node = nodeList.find(n => n.id === nodeId);
        if (node) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        }
    });
    
    // Validate bounds
    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
        console.warn('Invalid factory bounds calculated, skipping factory creation');
        return null;
    }
    
    // Find connections within this factory
    const factoryConnections = connectionList.filter(conn => 
        entities.has(conn.fromId) && entities.has(conn.toId)
    );
    
    return {
        id: `factory-${Array.from(entities).sort().join('-')}`,
        machines: machines,
        nodeIds: nodeIds,
        connections: factoryConnections,
        bounds: {
            x: minX - padding,
            y: minY - padding - playButtonSpace,
            width: (maxX - minX) + (2 * padding),
            height: (maxY - minY) + (2 * padding) + playButtonSpace
        },
        isFactory: true,
        isWorkflow: false,
        executionState: 'idle',
        lastExecuted: null
    };
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
            
            console.log('Found container, executing:', container);
            
            // Execute based on container type
            if (container.isFactory) {
                await executeFactory(container);
            } else {
                await executeWorkflow(container);
            }
            
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

// Execute a factory by processing machines in dependency order
async function executeFactory(factory) {
    console.log('Executing factory container:', factory);
    
    // Get current settings
    const currentSettings = get(settings);
    
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
    
    // Create dependency graph from factory connections
    const machineIds = factory.machines.map(m => m.id);
    const dependencyGraph = new Map();
    const inDegree = new Map();
    
    // Initialize dependency tracking
    machineIds.forEach(id => {
        dependencyGraph.set(id, new Set());
        inDegree.set(id, 0);
    });
    
    // Build dependency graph from machine-to-machine connections
    factory.connections.forEach(conn => {
        if (machineIds.includes(conn.fromId) && machineIds.includes(conn.toId)) {
            dependencyGraph.get(conn.fromId).add(conn.toId);
            inDegree.set(conn.toId, inDegree.get(conn.toId) + 1);
        }
    });
    
    // Topological sort to determine execution order
    const executionQueue = [];
    const readyQueue = [];
    
    // Find machines with no dependencies (in-degree 0)
    inDegree.forEach((degree, machineId) => {
        if (degree === 0) {
            readyQueue.push(machineId);
        }
    });
    
    console.log('Factory dependency analysis:', { dependencyGraph: Array.from(dependencyGraph.entries()), inDegree: Array.from(inDegree.entries()), readyQueue });
    
    // Execute machines in topological order
    while (readyQueue.length > 0) {
        const currentMachineId = readyQueue.shift();
        executionQueue.push(currentMachineId);
        
        // Find the machine container
        const machine = factory.machines.find(m => m.id === currentMachineId);
        if (machine) {
            console.log('Executing machine in factory:', currentMachineId);
            
            // Execute this machine
            await executeWorkflow(machine);
            
            // Transfer outputs to connected machines/nodes
            await transferMachineOutputs(currentMachineId, factory);
            
            // Update dependencies for machines that depend on this one
            if (dependencyGraph.has(currentMachineId)) {
                for (const dependentId of dependencyGraph.get(currentMachineId)) {
                    inDegree.set(dependentId, inDegree.get(dependentId) - 1);
                    if (inDegree.get(dependentId) === 0) {
                        readyQueue.push(dependentId);
                    }
                }
            }
        }
    }
    
    // Check for circular dependencies
    if (executionQueue.length !== machineIds.length) {
        const unprocessed = machineIds.filter(id => !executionQueue.includes(id));
        throw new Error(`Circular dependency detected in factory. Unprocessed machines: ${unprocessed.join(', ')}`);
    }
    
    console.log('Factory execution completed. Execution order was:', executionQueue);
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
    
    // Get YAML backend data, create if missing
    let nodeData = nodeActions.getNodeData(currentNode.id);
    if (!nodeData) {
        console.warn('No YAML data found for node, creating:', currentNode.id);
        // Import NodeData to create missing YAML data
        const { NodeData } = await import('../lib/NodeData.js');
        
        // Create appropriate NodeData based on node type
        switch (currentNode.type) {
            case 'static':
                nodeData = NodeData.createStatic(currentNode.id, currentNode.content || '', currentNode.title || 'Static Node');
                break;
            case 'input':
                nodeData = NodeData.createInput(currentNode.id, currentNode.content || '', currentNode.title || 'Input Node');
                break;
            case 'dynamic':
                nodeData = NodeData.createDynamic(currentNode.id, currentNode.title || 'AI Output');
                break;
            default:
                console.error('Unknown node type for YAML creation:', currentNode.type);
                return;
        }
        
        // Save the created YAML data
        import('../stores/nodes.js').then(({ nodeDataStore }) => {
            nodeDataStore.update(store => {
                const newStore = new Map(store);
                newStore.set(currentNode.id, nodeData);
                return newStore;
            });
        });
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

// Get machine output data (from outmost nodes)
export function getMachineOutput(machineId) {
    // Get machine container from workflow containers
    let machine = null;
    const unsubscribe = workflowContainers.subscribe(containers => {
        machine = containers.find(c => c.id === machineId);
    });
    unsubscribe();

    if (!machine) return null;

    // Find output nodes (nodes with no outgoing connections within the machine)
    const machineNodeIds = new Set(machine.nodes.map(n => n.id));
    const internalConnections = machine.connections;
    
    const outputNodes = machine.nodes.filter(node => {
        const hasOutgoingInternalConnection = internalConnections.some(conn => 
            conn.fromId === node.id && machineNodeIds.has(conn.toId)
        );
        return !hasOutgoingInternalConnection;
    });

    // Combine output from all output nodes
    const outputs = outputNodes.map(node => {
        const nodeData = nodeActions.getNodeData(node.id);
        return nodeData ? nodeData.data.output.value : node.content || '';
    }).filter(Boolean);

    return outputs.length > 0 ? outputs.join('\n\n---\n\n') : '';
}

// Transfer machine outputs to connected entities (machines or nodes)
async function transferMachineOutputs(sourceMachineId, factory) {
    console.log('🔄 Transferring outputs from machine:', sourceMachineId);
    
    // Get the machine output
    const machineOutput = getMachineOutput(sourceMachineId);
    if (!machineOutput) {
        console.log('❌ No output found for machine:', sourceMachineId);
        return;
    }
    
    console.log('📤 Machine output to transfer:', {
        output: machineOutput,
        outputType: typeof machineOutput,
        outputLength: machineOutput?.length || 0
    });
    
    // Get all connections where this machine is the source
    const { connections: allConnections } = await import('./nodes.js');
    let currentConnections = [];
    const unsubscribe = allConnections.subscribe(c => currentConnections = c);
    unsubscribe();
    
    const outgoingConnections = currentConnections.filter(conn => conn.fromId === sourceMachineId);
    console.log('Found outgoing connections:', outgoingConnections);
    
    for (const connection of outgoingConnections) {
        const targetId = connection.toId;
        
        if (targetId.startsWith('workflow-')) {
            // Machine-to-machine connection - transfer to target machine's input nodes
            await transferToMachineInputs(targetId, sourceMachineId, machineOutput);
        } else {
            // Machine-to-node connection - transfer directly to the node
            const { nodeActions } = await import('./nodes.js');
            console.log(`Transferring to node ${targetId}:`, machineOutput);
            // Machine outputs don't have context chains yet, but pass correct parameters
            nodeActions.addInput(targetId, sourceMachineId, machineOutput, 1.0, null, null);
        }
    }
}

// Transfer data to input nodes of a target machine
async function transferToMachineInputs(targetMachineId, sourceMachineId, outputData) {
    console.log(`🔄 Transferring data from machine ${sourceMachineId} to machine ${targetMachineId}`);
    console.log('📥 Data to transfer:', { data: outputData, type: typeof outputData });
    
    // Get the target machine
    let targetMachine = null;
    const unsubscribe = workflowContainers.subscribe(containers => {
        targetMachine = containers.find(c => c.id === targetMachineId);
    });
    unsubscribe();
    
    if (!targetMachine) {
        console.error('❌ Target machine not found:', targetMachineId);
        return;
    }
    
    console.log('🎯 Target machine found:', {
        id: targetMachine.id,
        nodeCount: targetMachine.nodes?.length || 0,
        connectionCount: targetMachine.connections?.length || 0
    });
    
    // Find input nodes in the target machine (nodes with no incoming connections within the machine)
    const machineNodeIds = new Set(targetMachine.nodes.map(n => n.id));
    const internalConnections = targetMachine.connections;
    
    const inputNodes = targetMachine.nodes.filter(node => {
        const hasIncomingInternalConnection = internalConnections.some(conn => 
            conn.toId === node.id && machineNodeIds.has(conn.fromId)
        );
        return !hasIncomingInternalConnection && (node.type === 'input' || node.type === 'static');
    });
    
    console.log(`Found ${inputNodes.length} input nodes in target machine:`, inputNodes.map(n => n.id));
    
    // Transfer data to all input nodes
    const { nodeActions } = await import('./nodes.js');
    for (const inputNode of inputNodes) {
        console.log(`Adding input to node ${inputNode.id}:`, outputData);
        // Machine outputs don't have context chains yet, but pass correct parameters
        nodeActions.addInput(inputNode.id, sourceMachineId, outputData, 1.0, null, null);
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