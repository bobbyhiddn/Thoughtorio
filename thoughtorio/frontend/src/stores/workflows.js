import { writable, derived, get } from 'svelte/store';
import { nodes, connections, nodeActions, nodeDataStore } from './nodes.js';
import { settings } from './settings.js';

/**
 * @typedef {import('../lib/NodeData.js').NodeData} NodeData
 * @typedef {import('../lib/NodeData.js').NodeOutput} NodeOutput
 */

/**
 * @typedef {object} Node
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} type
 * @property {string} content
 * @property {string} title
 * @property {string} [purpose]
 */

/**
 * @typedef {object} Connection
 * @property {string} id
 * @property {string} fromId
 * @property {string} toId
 * @property {string} fromSide
 * @property {string} toSide
 * @property {boolean} fromMachine
 */

/**
 * @typedef {object} WorkflowContainer
 * @property {string} id
 * @property {Node[]} nodes
 * @property {Connection[]} connections
 * @property {{x: number, y: number, width: number, height: number}} bounds
 * @property {boolean} isWorkflow
 * @property {boolean} [isFactory]
 * @property {'idle' | 'running' | 'completed' | 'error'} executionState
 * @property {number | null} lastExecuted
 * @property {WorkflowContainer[]} [machines]
 */

/**
 * @typedef {object} FactoryContainer
 * @property {string} id
 * @property {WorkflowContainer[]} machines
 * @property {string[]} nodeIds
 * @property {Connection[]} connections
 * @property {{x: number, y: number, width: number, height: number}} bounds
 * @property {boolean} isFactory
 * @property {boolean} isWorkflow
 * @property {'idle' | 'running' | 'completed' | 'error'} executionState
 * @property {number | null} lastExecuted
 */

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
        executionState: /** @type {'idle'} */ ('idle'),
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
        executionState: /** @type {'idle'} */ ('idle'), // 'idle', 'running', 'completed', 'error'
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
            /** @type {WorkflowContainer | FactoryContainer | undefined} */
            let container;
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

// New Centralized Workflow Executor
async function executeWorkflow(container) {
    console.log('🚀 Starting centralized execution for workflow:', container.id);
    const { nodes: workflowNodes, connections: workflowConnections } = container;

    // 1. Get execution order via topological sort
    const executionOrder = topologicalSort(workflowNodes, workflowConnections);
    console.log('📊 Execution Order:', executionOrder);

    // Get settings for AI calls
    const currentSettings = get(settings);
    if (!currentSettings.activeMode || !currentSettings.story_processing_model_id) {
        throw new Error('AI provider and model must be configured in settings');
    }
    let apiKey = '';
    switch (currentSettings.activeMode) {
        case 'openrouter':
        case 'local':
            apiKey = currentSettings.openrouter_api_key; break;
        case 'openai':
            apiKey = currentSettings.openai_api_key; break;
        case 'gemini':
            apiKey = currentSettings.gemini_api_key; break;
    }
    if (currentSettings.activeMode !== 'local' && !apiKey) {
        throw new Error(`API key required for ${currentSettings.activeMode} provider`);
    }

    // 2. Execute nodes in sequence
    for (const nodeId of executionOrder) {
        const node = workflowNodes.find(n => n.id === nodeId);
        if (!node) continue;

        console.log(`
--- Executing Node: ${node.title || node.id} ---`);
        workflowActions.setNodeExecuting(nodeId);
        nodeActions.setNodeExecuting(nodeId);

        const nodeData = nodeActions.getNodeData(nodeId);
        if (!nodeData) {
            console.error(`Could not find NodeData for ${nodeId}`);
            nodeActions.setNodeError(nodeId, 'NodeData not found');
            continue;
        }

        // 3. Build inputs from parent nodes
        const parentConnections = workflowConnections.filter(c => c.toId === nodeId);
        for (const conn of parentConnections) {
            const parentNodeData = nodeActions.getNodeData(conn.fromId);
            if (parentNodeData && parentNodeData.data.output) {
                console.log(`   - Receiving input from: ${conn.fromId}`);
                const { value, context_chain, sources } = parentNodeData.data.output;
                nodeActions.addInput(nodeId, conn.fromId, value, 1.0, context_chain, sources);
            }
        }

        // 4. Execute node logic (if dynamic)
        if (node.type === 'dynamic') {
            const inputText = nodeData.getProcessedInput();
            if (inputText && inputText.trim()) {
                try {
                    console.log(`   - Calling AI for: ${node.id}`);
                    
                    // Check if Wails runtime is available
                    if (!window.go || !window.go.app || !window.go.app.App) {
                        console.error('Wails runtime check failed. Available paths:', {
                            'window.go': !!window.go,
                            'window.go.main': !!window.go?.main,
                            'window.go.app': !!window.go?.app
                        });
                        throw new Error('Wails runtime not available. Make sure the app is properly initialized.');
                    }
                    
                    const response = await window.go.app.App.GetAICompletion(
                        currentSettings.activeMode,
                        currentSettings.story_processing_model_id,
                        inputText,
                        apiKey
                    );

                    console.log(`   - AI Response:`, response);

                    if (response && response.Content) {
                        nodeActions.setNodeCompleted(nodeId, response.Content);
                    } else {
                        const errorMsg = `AI Error: ${response.Error || 'No content returned'}`;
                        nodeActions.setNodeError(nodeId, new Error(errorMsg));
                    }
                } catch (error) {
                    console.error('AI processing failed:', error);
                    nodeActions.setNodeError(nodeId, error);
                }
            } else {
                console.log(`   - Skipping AI call for ${node.id} (no input).`);
                nodeActions.setNodeCompleted(nodeId, nodeData.data.content);
            }
        } else {
            // For static/input nodes, completion is implicit
            nodeActions.setNodeCompleted(nodeId, nodeData.data.content);
        }

        workflowActions.setNodeCompleted(nodeId);
        console.log(`--- Finished Node: ${node.title || node.id} ---`);
    }
    console.log('✅ Workflow execution completed:', container.id);
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

// Helper for topological sort
function topologicalSort(nodes, connections) {
    const graph = new Map(nodes.map(n => [n.id, []]));
    const inDegree = new Map(nodes.map(n => [n.id, 0]));

    connections.forEach(conn => {
        if (graph.has(conn.fromId) && graph.has(conn.toId)) {
            graph.get(conn.fromId).push(conn.toId);
            inDegree.set(conn.toId, (inDegree.get(conn.toId) || 0) + 1);
        }
    });

    const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
    const sortedOrder = [];

    while (queue.length > 0) {
        const u = queue.shift();
        sortedOrder.push(u);

        if (graph.has(u)) {
            for (const v of graph.get(u)) {
                inDegree.set(v, inDegree.get(v) - 1);
                if (inDegree.get(v) === 0) {
                    queue.push(v);
                }
            }
        }
    }

    if (sortedOrder.length !== nodes.length) {
        const unprocessed = nodes.filter(n => !sortedOrder.includes(n.id)).map(n => n.id);
        console.error(`Cycle detected in workflow graph! Unprocessed nodes: ${unprocessed.join(', ')}`);
        // Return partial sort to allow non-cyclic parts to run
        return sortedOrder; 
    }

    return sortedOrder;
}

/**
 * Get machine output data (from outmost nodes)
 * @param {string} machineId 
 * @returns {NodeOutput | null}
 */
export function getMachineOutput(machineId) {
    /** @type {WorkflowContainer | undefined} */
    let machine;
    const unsubscribe = workflowContainers.subscribe(containers => {
        const container = containers.find(c => c.id === machineId);
        if (container && container.isWorkflow) {
            machine = /** @type {WorkflowContainer} */ (container);
        }
    });
    unsubscribe();

    if (!machine) return null;

    // Find output nodes (nodes with no outgoing connections within the machine)
    const machineNodeIds = new Set(machine.nodes.map(n => n.id));
    const outputNodes = machine.nodes.filter(node => 
        !machine.connections.some(conn => conn.fromId === node.id && machineNodeIds.has(conn.toId))
    );

    if (outputNodes.length === 0) return null;

    // Merge outputs from all output nodes into a single structured payload
    const mergedOutput = {
        type: /** @type {const} */ ('structured_context'),
        value: { facts: [], history: [], task: '' },
        sources: new Set(),
        context_chain: []
    };
    const seenContextItems = new Set();
    const seenFacts = new Set();

    outputNodes.forEach(node => {
        const nodeData = nodeActions.getNodeData(node.id);
        if (!nodeData || !nodeData.data.output || typeof nodeData.data.output.value !== 'object') return;

        const { value, sources, context_chain } = nodeData.data.output;

        // Merge facts, avoiding duplicates
        value.facts.forEach(fact => {
            if (!seenFacts.has(fact)) {
                mergedOutput.value.facts.push(fact);
                seenFacts.add(fact);
            }
        });

        // Merge history
        mergedOutput.value.history.push(...value.history);

        // The last task from any output node wins
        if (value.task) {
            mergedOutput.value.task = value.task;
        }

        // Merge sources
        sources.forEach(sourceId => mergedOutput.sources.add(sourceId));

        // Merge context_chain, avoiding duplicates
        if (context_chain) {
            context_chain.forEach(item => {
                if (!seenContextItems.has(item.node_id)) {
                    mergedOutput.context_chain.push(item);
                    seenContextItems.add(item.node_id);
                }
            });
        }
    });

    const finalOutput = { ...mergedOutput, sources: Array.from(mergedOutput.sources) };

    // Sort history by timestamp if available
    mergedOutput.value.history.sort((a, b) => {
        const timestampA = mergedOutput.context_chain.find(item => item.contribution.content === a)?.timestamp;
        const timestampB = mergedOutput.context_chain.find(item => item.contribution.content === b)?.timestamp;
        if (timestampA && timestampB && !isNaN(new Date(timestampA).getTime()) && !isNaN(new Date(timestampB).getTime())) {
            return new Date(timestampA).getTime() - new Date(timestampB).getTime();
        }
        return 0;
    });

    return finalOutput;
}

// Transfer machine outputs to connected entities (machines or nodes)
async function transferMachineOutputs(sourceMachineId, factory) {
    console.log('🔄 Transferring outputs from machine:', sourceMachineId);
    
    const machineOutput = getMachineOutput(sourceMachineId);
    if (!machineOutput) {
        console.log('❌ No output found for machine:', sourceMachineId);
        return;
    }
    
    console.log('📤 Machine output to transfer:', machineOutput);
    
    const { connections: allConnections } = await import('./nodes.js');
    let currentConnections = [];
    const unsubscribe = allConnections.subscribe(c => currentConnections = c);
    unsubscribe();
    
    const outgoingConnections = currentConnections.filter(conn => conn.fromId === sourceMachineId);
    console.log('Found outgoing connections:', outgoingConnections);
    
    for (const connection of outgoingConnections) {
        const targetId = connection.toId;
        
        if (targetId.startsWith('workflow-')) {
            await transferToMachineInputs(targetId, sourceMachineId, machineOutput);
        } else {
            const { nodeActions } = await import('./nodes.js');
            console.log(`Transferring to node ${targetId}:`, machineOutput);
            nodeActions.addInput(
                targetId, 
                sourceMachineId, 
                machineOutput.value, 
                1.0, 
                machineOutput.context_chain,
                machineOutput.sources
            );
        }
    }
}

/**
 * Transfer data to input nodes of a target machine
 * @param {string} targetMachineId
 * @param {string} sourceMachineId
 * @param {NodeOutput} outputData
 */
async function transferToMachineInputs(targetMachineId, sourceMachineId, outputData) {
    console.log(`🔄 Transferring data from machine ${sourceMachineId} to machine ${targetMachineId}`);
    console.log('📥 Data to transfer:', outputData);
    
    /** @type {WorkflowContainer | undefined} */
    let targetMachine;
    const unsubscribe = workflowContainers.subscribe(containers => {
        const container = containers.find(c => c.id === targetMachineId);
        if (container && container.isWorkflow) {
            targetMachine = /** @type {WorkflowContainer} */ (container);
        }
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
    
    const machineNodeIds = new Set(targetMachine.nodes.map(n => n.id));
    const inputNodes = targetMachine.nodes.filter(node => {
        const hasIncomingInternalConnection = targetMachine.connections.some(conn => 
            conn.toId === node.id && machineNodeIds.has(conn.fromId)
        );
        return !hasIncomingInternalConnection && (node.type === 'input' || node.type === 'static');
    });
    
    console.log(`Found ${inputNodes.length} input nodes in target machine:`, inputNodes.map(n => n.id));
    
    const { nodeActions } = await import('./nodes.js');
    for (const inputNode of inputNodes) {
        console.log(`Adding input to node ${inputNode.id}:`, outputData);
        nodeActions.addInput(
            inputNode.id, 
            sourceMachineId, 
            outputData.value, 
            1.0, 
            outputData.context_chain, 
            outputData.sources
        );
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