import { writable, get, derived } from 'svelte/store';
import { nodeActions, nodeDataStore, nodes, connections } from './nodes.js';
import { ContextEngine } from '../lib/ContextEngine.js';
import { settings } from './settings.js';

// Canvas-based counters that reset on new canvas
export const machineCounter = writable(0);
export const factoryCounter = writable(0);
export const networkCounter = writable(0);

// Track created container IDs to avoid duplicates during reactive recomputation
const createdContainerIds = new Set();

// Helper functions for generating container IDs
export function getNextMachineId(nodeGroup) {
    // Create a stable signature for this container based on its nodes
    const signature = nodeGroup.map(n => n.id).sort().join('-');
    
    // If we've already created a container for this exact set of nodes, reuse the ID
    for (const id of createdContainerIds) {
        if (id.includes(signature)) {
            const machineId = id.split('-')[0] + '-' + id.split('-')[1]; // Extract just "machine-N"
            console.log('🔄 REUSING machine ID for signature:', signature, 'ID:', machineId);
            return machineId;
        }
    }
    
    // This is a truly new container, increment counter
    const currentValue = get(machineCounter);
    console.log('🔢 BEFORE machineCounter increment - current value:', currentValue);
    machineCounter.update(n => n + 1);
    const newValue = get(machineCounter);
    const newId = `machine-${newValue}`;
    console.log('🔢 NEW machine ID created:', newId, 'for signature:', signature);
    
    // Remember this container
    createdContainerIds.add(`${newId}-${signature}`);
    
    return newId;
}

export function getNextFactoryId(entityGroup) {
    // Create a stable signature for this factory based on its entities
    const signature = entityGroup ? Array.from(entityGroup).sort().join('-') : '';
    
    // If we've already created a container for this exact set of entities, reuse the ID
    for (const id of createdContainerIds) {
        if (id.includes(signature) && id.startsWith('factory-')) {
            const factoryId = id.split('-')[0] + '-' + id.split('-')[1];
            console.log('🔄 Reusing existing factory ID:', factoryId, 'for signature:', signature);
            return factoryId;
        }
    }
    
    // This is a truly new container, increment counter
    factoryCounter.update(n => n + 1);
    const newId = `factory-${get(factoryCounter)}`;
    createdContainerIds.add(`${newId}-${signature}`);
    console.log('✨ Created new factory ID:', newId, 'for signature:', signature);
    return newId;
}

export function getNextNetworkId(entityGroup) {
    // Create a stable signature for this network based on its entities
    const signature = entityGroup ? Array.from(entityGroup).sort().join('-') : '';
    
    // If we've already created a container for this exact set of entities, reuse the ID
    for (const id of createdContainerIds) {
        if (id.includes(signature) && id.startsWith('network-')) {
            const networkId = id.split('-')[0] + '-' + id.split('-')[1];
            console.log('🔄 Reusing existing network ID:', networkId, 'for signature:', signature);
            return networkId;
        }
    }
    
    // This is a truly new container, increment counter
    networkCounter.update(n => n + 1);
    const newId = `network-${get(networkCounter)}`;
    createdContainerIds.add(`${newId}-${signature}`);
    console.log('✨ Created new network ID:', newId, 'for signature:', signature);
    return newId;
}

// Reset all counters (called by New Canvas)
export function resetContainerCounters() {
    console.log('🔄 RESETTING all container counters to 0');
    machineCounter.set(0);
    factoryCounter.set(0);
    networkCounter.set(0);
    createdContainerIds.clear();
    console.log('🔄 RESET complete - counters should be 0');
}

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
 * @property {boolean} [isMachine]
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

/**
 * @typedef {object} NetworkContainer
 * @property {string} id
 * @property {FactoryContainer[]} factories
 * @property {string[]} nodeIds
 * @property {Connection[]} connections
 * @property {{x: number, y: number, width: number, height: number}} bounds
 * @property {boolean} isNetwork
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
    if ($nodes.length === 0) return [];
    
    // 1. Detect all components at each level, passing existing containers for ID generation
    let existingContainers = [];
    
    const allMachines = detectBasicNodeComponents($nodes, $connections, existingContainers);
    existingContainers = [...existingContainers, ...allMachines];
    
    const multiNodeMachines = allMachines.filter(c => c.isWorkflow);
    const allFactories = detectFactoryComponents(multiNodeMachines, $connections, $nodes, existingContainers);
    existingContainers = [...existingContainers, ...allFactories];
    
    const allNetworks = detectNetworkComponents(allFactories, $connections, $nodes, multiNodeMachines, existingContainers);
    
    // 2. Return ALL detected containers. This makes every container, even nested ones,
    // available to the UI for individual interaction and execution.
    // The visual hierarchy will be managed by z-index in the component's CSS.
    return [...allNetworks, ...allFactories, ...allMachines];
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
    
    // Finally, detect network hierarchies (factory-to-node connections)
    const networkComponents = detectNetworkComponents(factoryComponents, connectionList, nodeList, actualMachines);
    
    return [...basicComponents, ...factoryComponents, ...networkComponents];
}

function detectBasicNodeComponents(nodeList, connectionList, existingContainers = []) {
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
            
            if (component.length > 1) {  // Only create containers for multi-node components
                const container = createWorkflowContainer(component, connectionList, existingContainers);
                components.push(container);
                existingContainers.push(container);
            }
        }
    }
    
    return components;
}

function detectFactoryComponents(machineContainers, connectionList, nodeList, existingContainers = []) {
    const factoryComponents = [];
    
    // Find machine-to-node and machine-to-machine connections
    const factoryConnections = connectionList.filter(conn => 
        conn.fromId.startsWith('machine-') // Connections originating from machines
    );
    
    if (factoryConnections.length === 0) return [];
    
    console.log('🏭 Detected factory connections:', factoryConnections);
    console.log('🏭 All connections:', connectionList);
    console.log('🏭 Available machines:', machineContainers.map(m => m.id));
    
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
        if (!conn.toId.startsWith('machine-')) {
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
        if (targetEntity.startsWith('machine-') && factoryAdjacency.has(conn.fromId)) {
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
                const factory = createFactoryContainer(factoryComponent, machineContainers, connectionList, nodeList, existingContainers);
                if (factory) {
                    console.log('Successfully created factory container:', factory);
                    factoryComponents.push(factory);
                    existingContainers.push(factory);
                }
            }
        }
    }
    
    return factoryComponents;
}

function detectNetworkComponents(factoryContainers, connectionList, nodeList, machineContainers, existingContainers = []) {
    const networkComponents = [];
    
    // Find factory-to-node and factory-to-factory connections
    const networkConnections = connectionList.filter(conn => 
        conn.fromId.startsWith('factory-') // Connections originating from factories
    );
    
    if (networkConnections.length === 0) return [];
    
    console.log('Detected potential network connections:', networkConnections);
    
    // Group connected factories and nodes into networks using Union-Find approach
    const networkAdjacency = new Map();
    
    // Add all factory containers as potential network components
    factoryContainers.forEach(factory => {
        if (!networkAdjacency.has(factory.id)) {
            networkAdjacency.set(factory.id, new Set());
        }
    });
    
    // Process all network connections (factory-to-node and factory-to-factory)
    networkConnections.forEach(conn => {        
        // Check what the target is FIRST before adding anything to adjacency
        let targetEntity = conn.toId;
        
        // Case 1: Target is a standalone node (not part of any machine or factory)
        const isInMachine = machineContainers.some(machine => 
            machine.nodes && machine.nodes.some(node => node.id === conn.toId)
        );
        const isInFactory = factoryContainers.some(factory => 
            (factory.machines && factory.machines.some(machine => 
                machine.nodes && machine.nodes.some(node => node.id === conn.toId)
            )) || 
            (factory.nodeIds && factory.nodeIds.includes(conn.toId))
        );
        
        if (!isInMachine && !isInFactory) {
            // Case 1: Standalone node - add to network
            targetEntity = conn.toId; // Keep as node ID
            if (!networkAdjacency.has(targetEntity)) {
                networkAdjacency.set(targetEntity, new Set());
            }
            networkAdjacency.get(targetEntity).add(conn.fromId);
            networkAdjacency.get(conn.fromId).add(targetEntity);
            console.log(`Factory-to-standalone-node connection: ${conn.fromId} -> ${targetEntity}`);
        } else if (isInFactory) {
            // Case 2: Target is a node in another factory - connect the factories (NOT the node)
            const targetFactory = factoryContainers.find(factory => 
                (factory.machines && factory.machines.some(machine => 
                    machine.nodes && machine.nodes.some(node => node.id === conn.toId)
                )) || 
                (factory.nodeIds && factory.nodeIds.includes(conn.toId))
            );
            
            if (targetFactory && targetFactory.id !== conn.fromId) {
                // Connect the two factories, NOT the individual node
                targetEntity = targetFactory.id;
                if (!networkAdjacency.has(targetEntity)) {
                    networkAdjacency.set(targetEntity, new Set());
                }
                networkAdjacency.get(targetEntity).add(conn.fromId);
                networkAdjacency.get(conn.fromId).add(targetEntity);
                console.log(`Factory-to-factory connection: ${conn.fromId} -> ${targetEntity} (node ${conn.toId} stays in factory)`);
            }
        } else if (isInMachine && !isInFactory) {
            // Case 3: Target is a node in a machine (not in a factory) - connect factory to machine (NOT the node)
            const targetMachine = machineContainers.find(machine => 
                machine.nodes && machine.nodes.some(node => node.id === conn.toId)
            );
            
            if (targetMachine) {
                targetEntity = targetMachine.id;
                if (!networkAdjacency.has(targetEntity)) {
                    networkAdjacency.set(targetEntity, new Set());
                }
                networkAdjacency.get(targetEntity).add(conn.fromId);
                networkAdjacency.get(conn.fromId).add(targetEntity);
                console.log(`Factory-to-machine connection: ${conn.fromId} -> ${targetEntity} (node ${conn.toId} stays in machine)`);
            }
        }
    });
    
    const visited = new Set();
    
    // DFS to find network components
    function dfsNetwork(entityId, networkComponent) {
        if (visited.has(entityId)) return;
        visited.add(entityId);
        
        // Add to network component
        networkComponent.entities.add(entityId);
        
        // Visit connected entities
        if (networkAdjacency.has(entityId)) {
            for (const neighbor of networkAdjacency.get(entityId)) {
                dfsNetwork(neighbor, networkComponent);
            }
        }
    }
    
    // Find network components
    for (const [entityId] of networkAdjacency) {
        if (!visited.has(entityId)) {
            const networkComponent = { entities: new Set() };
            dfsNetwork(entityId, networkComponent);
            
            // Networks require at least one factory and either:
            // 1) A standalone node, OR 
            // 2) Another factory (factory-to-factory connection), OR
            // 3) A machine (factory-to-machine connection)
            const factories = Array.from(networkComponent.entities).filter(id => id.startsWith('factory-'));
            const machines = Array.from(networkComponent.entities).filter(id => id.startsWith('machine-'));
            const standaloneNodes = Array.from(networkComponent.entities).filter(id => !id.startsWith('factory-') && !id.startsWith('machine-'));
            
            const hasMultipleFactories = factories.length >= 2;
            const hasFactoryAndStandaloneNode = factories.length >= 1 && standaloneNodes.length >= 1;
            const hasFactoryAndMachine = factories.length >= 1 && machines.length >= 1;
            
            if ((hasMultipleFactories || hasFactoryAndStandaloneNode || hasFactoryAndMachine) && networkComponent.entities.size > 1) {
                console.log('Creating network with entities:', Array.from(networkComponent.entities));
                // Create network container
                const network = createNetworkContainer(networkComponent, factoryContainers, connectionList, nodeList, machineContainers, existingContainers);
                if (network) {
                    console.log('Successfully created network container:', network);
                    networkComponents.push(network);
                    existingContainers.push(network);
                }
            }
        }
    }
    
    return networkComponents;
}

/**
 * Creates a factory container for machine-to-node hierarchies
 */
function createFactoryContainer(factoryComponent, machineContainers, connectionList, nodeList, existingContainers = []) {
    const { entities } = factoryComponent;
    
    // Get all machines and nodes in this factory
    const machines = machineContainers.filter(m => entities.has(m.id));
    const nodeIds = Array.from(entities).filter(id => !id.startsWith('machine-'));
    
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
    const allNodeIdsInFactory = new Set(
        machines.flatMap(m => m.nodes.map(n => n.id)).concat(nodeIds)
    );

    const factoryConnections = connectionList.filter(conn => {
        // A connection belongs to the factory if:
        // 1. It's between two machines in the factory.
        const isMachineToMachine = entities.has(conn.fromId) && entities.has(conn.toId);
        
        // 2. It's from a machine in the factory to a node in the factory.
        const isMachineToNode = entities.has(conn.fromId) && allNodeIdsInFactory.has(conn.toId);

        // 3. It's from a node in the factory to a machine in the factory.
        const isNodeToMachine = allNodeIdsInFactory.has(conn.fromId) && entities.has(conn.toId);

        return isMachineToMachine || isMachineToNode || isNodeToMachine;
    });
    
    const factoryId = getNextFactoryId(entities);
    return {
        id: factoryId,
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
 * Creates a network container for factory-to-node hierarchies
 */
function createNetworkContainer(networkComponent, factoryContainers, connectionList, nodeList, machineContainers, existingContainers = []) {
    const { entities } = networkComponent;
    
    // Get all factories, machines, and standalone nodes in this network
    const factories = factoryContainers.filter(f => entities.has(f.id));
    const machines = machineContainers.filter(m => entities.has(m.id));
    const nodeIds = Array.from(entities).filter(id => !id.startsWith('factory-') && !id.startsWith('machine-'));
    
    if (factories.length === 0) return null;
    
    console.log(`Creating network with ${factories.length} factories, ${machines.length} machines, and ${nodeIds.length} standalone nodes`);
    
    // Calculate bounding box that encompasses all factories, machines, and nodes
    const padding = 40; // Larger padding for networks
    const playButtonSpace = 50; // Space above container for play button
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Include factory bounds
    factories.forEach(factory => {
        minX = Math.min(minX, factory.bounds.x);
        minY = Math.min(minY, factory.bounds.y);
        maxX = Math.max(maxX, factory.bounds.x + factory.bounds.width);
        maxY = Math.max(maxY, factory.bounds.y + factory.bounds.height);
    });
    
    // Include machine bounds
    machines.forEach(machine => {
        minX = Math.min(minX, machine.bounds.x);
        minY = Math.min(minY, machine.bounds.y);
        maxX = Math.max(maxX, machine.bounds.x + machine.bounds.width);
        maxY = Math.max(maxY, machine.bounds.y + machine.bounds.height);
    });
    
    // Include individual node positions (standalone nodes connected to factories)
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
        console.warn('Invalid network bounds calculated, skipping network creation');
        return null;
    }
    
    // Find connections within this network - handle hierarchical connections properly
    const allContainedContainerIds = new Set(
        [...factories, ...machines].map(c => c.id)
    );

    const allContainedNodeIds = new Set([
        ...factories.flatMap(f => f.machines.flatMap(m => m.nodes.map(n => n.id))),
        ...factories.flatMap(f => f.nodeIds),
        ...machines.flatMap(m => m.nodes.map(n => n.id)),
        ...nodeIds
    ]);

    const networkConnections = connectionList.filter(conn => {
        // A connection belongs to the network if:
        // 1. It's between two containers in the network (factory-to-factory, factory-to-machine, etc.)
        const isContainerToContainer = allContainedContainerIds.has(conn.fromId) && allContainedContainerIds.has(conn.toId);
        
        // 2. It's from a container in the network to a node in the network
        const isContainerToNode = allContainedContainerIds.has(conn.fromId) && allContainedNodeIds.has(conn.toId);
        
        // 3. It's from a node in the network to a container in the network
        const isNodeToContainer = allContainedNodeIds.has(conn.fromId) && allContainedContainerIds.has(conn.toId);

        return isContainerToContainer || isContainerToNode || isNodeToContainer;
    });
    
    const networkId = getNextNetworkId(networkComponent.entities);
    return {
        id: networkId,
        factories: factories,
        machines: machines,
        nodeIds: nodeIds,
        connections: networkConnections,
        bounds: {
            x: minX - padding,
            y: minY - padding - playButtonSpace,
            width: (maxX - minX) + (2 * padding),
            height: (maxY - minY) + (2 * padding) + playButtonSpace
        },
        isNetwork: true,
        isWorkflow: false,
        executionState: /** @type {'idle'} */ ('idle'),
        lastExecuted: null
    };
}

/**
 * Creates a workflow container for a group of connected nodes
 */
function createWorkflowContainer(nodeGroup, connectionList, existingContainers = []) {
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
    
    // Generate next machine ID using canvas counter
    const machineId = getNextMachineId(nodeGroup);
    
    return {
        id: machineId,
        nodes: nodeGroup,
        connections: internalConnections,
        bounds: {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + (2 * padding),
            height: (maxY - minY) + (2 * padding)
        },
        isWorkflow,
        isMachine: true,  // Add the isMachine flag for machine containers
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

/**
 * Finds any executable entity (Node, Machine, Factory, Network) by its ID.
 * @param {string} id
 */
function getExecutableEntity(id) {
    const allContainers = get(workflowContainers);
    const container = allContainers.find(c => c.id === id);
    if (container) return container;

    // Fallback to finding a node if no container matches
    return get(nodes).find(n => n.id === id);
}

/**
 * Recursively collects all node IDs from a container and its children.
 * @param {object} container - A machine, factory, or network container.
 * @param {Set<string>} [nodeIdSet] - The set to add node IDs to.
 * @returns {Set<string>} A set of all node IDs.
 */
function collectAllNodeIds(container, nodeIdSet = new Set()) {
    if (container.nodes) {
        container.nodes.forEach(n => nodeIdSet.add(n.id));
    }
    if (container.nodeIds) {
        container.nodeIds.forEach(id => nodeIdSet.add(id));
    }
    if (container.machines) {
        container.machines.forEach(m => collectAllNodeIds(m, nodeIdSet));
    }
    if (container.factories) {
        container.factories.forEach(f => collectAllNodeIds(f, nodeIdSet));
    }
    return nodeIdSet;
}

/**
 * The master execution function. Can execute any container recursively.
 * @param {WorkflowContainer | FactoryContainer | NetworkContainer} container
 */
async function executeContainer(container) {
    console.log(`🚀 EXECUTING CONTAINER: ${container.id} (Type: ${container.isNetwork ? 'Network' : container.isFactory ? 'Factory' : 'Machine'})`);
    executionState.update(state => ({
        ...state,
        activeWorkflows: new Set([...state.activeWorkflows, container.id]),
    }));

    let children, connections;
    if (container.isNetwork) {
        const standaloneNodes = (container.nodeIds || []).map(id => get(nodes).find(n => n.id === id)).filter(Boolean);
        children = [...(container.factories || []), ...(container.machines || []), ...standaloneNodes];
        connections = container.connections;
    } else if (container.isFactory) {
        const standaloneNodes = (container.nodeIds || []).map(id => get(nodes).find(n => n.id === id)).filter(Boolean);
        children = [...(container.machines || []), ...standaloneNodes];
        connections = container.connections;
    } else { // It's a Machine
        children = container.nodes;
        connections = container.connections;
    }

    const executionOrder = topologicalSort(children, connections);
    console.log('📊 Execution Order:', executionOrder.join(' -> '));

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
    
    for (const entityId of executionOrder) {
        const entity = children.find(child => child.id === entityId);
        if (!entity) continue;

        console.log(`--- Executing Entity: ${entity.title || entity.id} ---`);
        workflowActions.setNodeExecuting(entityId);
        nodeActions.setNodeExecuting(entityId);

        // 1. Build inputs from external sources (parents, siblings, etc.)
        const allNodeIdsInEntity = collectAllNodeIds(entity);

        // Find all connections that terminate inside this entity but originate outside of it.
        const externalConnections = connections.filter(conn =>
            allNodeIdsInEntity.has(conn.toId) && !allNodeIdsInEntity.has(conn.fromId)
        );

        for (const conn of externalConnections) {
            const parentEntity = getExecutableEntity(conn.fromId);
            if (!parentEntity) continue;

            // If the context source is another executable container, execute it first
            // to ensure its context is up-to-date before we read it.
            if (parentEntity.isNetwork || parentEntity.isFactory || parentEntity.isWorkflow) {
                const currentState = get(executionState);
                const isParentRunning = currentState.activeWorkflows.has(parentEntity.id);
                if (!isParentRunning) {
                    console.log(`[Dependency Execution] Executing context source '${parentEntity.id}' before processing '${entity.id}'`);
                    await executeContainer(parentEntity);
                } else {
                    console.log(`[Dependency Execution] Context source '${parentEntity.id}' is already running. Using current state.`);
                }
            }

            let parentOutput;
            if (parentEntity.isNetwork) parentOutput = getNetworkOutput(parentEntity);
            else if (parentEntity.isFactory) parentOutput = getFactoryOutput(parentEntity);
            else if (parentEntity.isWorkflow) parentOutput = getMachineOutput(conn.fromId);
            else parentOutput = nodeActions.getNodeData(conn.fromId)?.data.output;

            if (parentOutput) {
                console.log(`   - Receiving external input at node '${conn.toId}' from: ${conn.fromId}`);
                // Add the input directly to the specific target node inside the entity.
                nodeActions.addInput(conn.toId, conn.fromId, parentOutput.value, 1.0, parentOutput.context_chain, parentOutput.sources);
            }
        }

        // 1b. Also handle internal connections within this entity (for machines with multiple nodes)
        const internalConnections = connections.filter(conn =>
            allNodeIdsInEntity.has(conn.toId) && allNodeIdsInEntity.has(conn.fromId)
        );
        for (const conn of internalConnections) {
            const parentNodeData = nodeActions.getNodeData(conn.fromId);
            if (parentNodeData && parentNodeData.data.output) {
                console.log(`   - Receiving internal input at node '${conn.toId}' from: ${conn.fromId}`);
                const { value, context_chain, sources } = parentNodeData.data.output;
                nodeActions.addInput(conn.toId, conn.fromId, value, 1.0, context_chain, sources);
            }
        }

        // Also handle direct entity-to-entity connections (legacy support)
        const entityConnections = connections.filter(c => c.toId === entityId);
        for (const conn of entityConnections) {
            const parentEntity = getExecutableEntity(conn.fromId);
            if (!parentEntity) continue;

            // If the context source is another executable container, execute it first
            if (parentEntity.isNetwork || parentEntity.isFactory || parentEntity.isWorkflow) {
                const currentState = get(executionState);
                const isParentRunning = currentState.activeWorkflows.has(parentEntity.id);
                if (!isParentRunning) {
                    console.log(`[Dependency Execution] Executing context source '${parentEntity.id}' before processing '${entityId}'`);
                    await executeContainer(parentEntity);
                } else {
                    console.log(`[Dependency Execution] Context source '${parentEntity.id}' is already running. Using current state.`);
                }
            }

            let parentOutput;
            if (parentEntity.isNetwork) parentOutput = getNetworkOutput(parentEntity);
            else if (parentEntity.isFactory) parentOutput = getFactoryOutput(parentEntity);
            else if (parentEntity.isWorkflow) parentOutput = getMachineOutput(conn.fromId);
            else parentOutput = nodeActions.getNodeData(conn.fromId)?.data.output;

            if (parentOutput) {
                console.log(`   - Receiving entity input from: ${conn.fromId}`);
                if (entity.isWorkflow) {
                    await transferToMachineInputs(entityId, conn.fromId, parentOutput);
                } else {
                    nodeActions.addInput(entityId, conn.fromId, parentOutput.value, 1.0, parentOutput.context_chain, parentOutput.sources);
                }
            }
        }

        // 2. Execute the entity itself
        if (entity.isNetwork || entity.isFactory || entity.isWorkflow) {
            await executeContainer(entity); // Recursive call
        } else if (entity.type === 'dynamic') {
            const entityData = nodeActions.getNodeData(entityId);
            const inputText = entityData.getProcessedInput();
            if (inputText && inputText.trim()) {
                try {
                    console.log(`   - Calling AI for: ${entity.id}`);
                    
                    if (!window.go || !window.go.app || !window.go.app.App) {
                        throw new Error('Wails runtime not available');
                    }
                    
                    const response = await window.go.app.App.GetAICompletion(
                        currentSettings.activeMode, currentSettings.story_processing_model_id, inputText, apiKey
                    );
                    
                    if (response && response.Content) {
                        nodeActions.setNodeCompleted(entityId, response.Content);
                    } else { 
                        throw new Error(response.Error || 'No content returned'); 
                    }
                } catch (error) { 
                    console.error('AI processing failed:', error);
                    nodeActions.setNodeError(entityId, error); 
                }
            } else {
                const entityData = nodeActions.getNodeData(entityId);
                nodeActions.setNodeCompleted(entityId, entityData?.data.content);
            }
        } else {
            const entityData = nodeActions.getNodeData(entityId);
            nodeActions.setNodeCompleted(entityId, entityData?.data.content);
        }

        workflowActions.setNodeCompleted(entityId);
        console.log(`--- Finished Entity: ${entity.title || entity.id} ---`);
    }

    executionState.update(state => {
        const newActive = new Set(state.activeWorkflows);
        newActive.delete(container.id);
        return { ...state, activeWorkflows: newActive };
    });
    console.log(`✅ Container execution completed: ${container.id}`);
}

// Helper functions for workflow execution
export const workflowActions = {
    execute: async (containerId) => {
        console.log('workflowActions.execute called for:', containerId);
        
        const container = getExecutableEntity(containerId);
        if (!container) {
            console.error('Container not found for execution:', containerId);
            return;
        }
        
        // Reset node states within this container before execution
        const allNodeIds = new Set();
        function collectNodeIds(c) {
            if (c.nodes) c.nodes.forEach(n => allNodeIds.add(n.id));
            if (c.machines) c.machines.forEach(m => collectNodeIds(m));
            if (c.factories) c.factories.forEach(f => collectNodeIds(f));
            if (c.nodeIds) c.nodeIds.forEach(id => allNodeIds.add(id));
        }
        collectNodeIds(container);

        executionState.update(s => {
            allNodeIds.forEach(id => {
                s.activeNodes.delete(id);
                s.completedNodes.delete(id);
            });
            return s;
        });

        try {
            await executeContainer(container);
        } catch (error) {
            console.error('Error during container execution:', error);
            executionState.update(state => {
                const newActive = new Set(state.activeWorkflows);
                newActive.delete(containerId);
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
                            'window.go.app': !!(/** @type {any} */ (window.go)?.app)
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
                    console.log(`   - About to call setNodeCompleted for ${nodeId}`);

                    if (response && response.Content) {
                        console.log(`   - Setting node ${nodeId} as completed with content:`, response.Content);
                        nodeActions.setNodeCompleted(nodeId, response.Content);
                        console.log(`   - Setting workflow node ${nodeId} as completed`);
                        workflowActions.setNodeCompleted(nodeId);
                        console.log(`   - Both completion calls finished for ${nodeId}`);
                    } else {
                        const errorMsg = `AI Error: ${response.Error || 'No content returned'}`;
                        console.log(`   - Setting node ${nodeId} as error:`, errorMsg);
                        nodeActions.setNodeError(nodeId, new Error(errorMsg));
                    }
                } catch (error) {
                    console.error('AI processing failed:', error);
                    nodeActions.setNodeError(nodeId, error);
                }
            } else {
                console.log(`   - Skipping AI call for ${node.id} (no input).`);
                nodeActions.setNodeCompleted(nodeId, nodeData.data.content);
                workflowActions.setNodeCompleted(nodeId);
            }
        } else {
            // For static/input nodes, completion is implicit
            nodeActions.setNodeCompleted(nodeId, nodeData.data.content);
            workflowActions.setNodeCompleted(nodeId);
        }

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
        machine = containers.find(c => c.id === machineId);
    });
    unsubscribe();
    
    if (!machine || !machine.nodes) return null;
    
    // Find nodes that have no outgoing connections (output nodes)
    const outputNodes = machine.nodes.filter(node => {
        return !machine.connections.some(conn => conn.fromId === node.id);
    });
    
    if (outputNodes.length === 0) return null;

    // Use ContextEngine to merge outputs from all output nodes
    return ContextEngine.mergeWorkflowOutputs(outputNodes, nodeActions.getNodeData);
}

/**
 * Get factory output data by merging outputs of its terminal machines/nodes
 * @param {FactoryContainer} factory
 * @returns {NodeOutput | null}
 */
export function getFactoryOutput(factory) {
    if (!factory || (!factory.machines && !factory.nodeIds)) return null;

    // Find terminal entities (machines or nodes) within the factory
    const terminalEntities = [];
    (factory.machines || []).forEach(machine => {
        if (!factory.connections.some(conn => conn.fromId === machine.id)) {
            terminalEntities.push({ id: machine.id, type: 'machine' });
        }
    });
    (factory.nodeIds || []).forEach(nodeId => {
        if (!factory.connections.some(conn => conn.fromId === nodeId)) {
            terminalEntities.push({ id: nodeId, type: 'node' });
        }
    });

    if (terminalEntities.length === 0) return null;

    const terminalOutputs = terminalEntities.map(entity => {
        if (entity.type === 'machine') return getMachineOutput(entity.id);
        if (entity.type === 'node') {
            const nodeData = nodeActions.getNodeData(entity.id);
            return nodeData ? nodeData.data.output : null;
        }
        return null;
    }).filter(Boolean);

    if (terminalOutputs.length === 0) return null;
    if (terminalOutputs.length === 1) return terminalOutputs[0];
    
    // Merge outputs using ContextEngine-style logic
    const mergedValue = { facts: [], history: [], task: '' };
    const mergedSources = new Set();
    const mergedContextChain = [];
    const seenContextItems = new Set();

    terminalOutputs.forEach(output => {
        if (output.value?.facts) mergedValue.facts.push(...output.value.facts);
        if (output.value?.history) mergedValue.history.push(...output.value.history);
        if (output.value?.task) mergedValue.task = output.value.task;
        (output.sources || []).forEach(s => mergedSources.add(s));
        (output.context_chain || []).forEach(item => {
            if (!seenContextItems.has(item.node_id)) {
                mergedContextChain.push(item);
                seenContextItems.add(item.node_id);
            }
        });
    });

    return {
        type: 'structured_context',
        value: mergedValue,
        sources: Array.from(mergedSources),
        context_chain: mergedContextChain,
    };
}

/**
 * Get network output data by merging outputs of its terminal factories/nodes
 * @param {NetworkContainer} network
 * @returns {NodeOutput | null}
 */
export function getNetworkOutput(network) {
    if (!network || (!network.factories && !network.nodeIds)) return null;
    
    const terminalEntities = [];
    (network.factories || []).forEach(factory => {
        if (!network.connections.some(conn => conn.fromId === factory.id)) {
            terminalEntities.push({ id: factory.id, type: 'factory' });
        }
    });
    (network.nodeIds || []).forEach(nodeId => {
        if (!network.connections.some(conn => conn.fromId === nodeId)) {
            terminalEntities.push({ id: nodeId, type: 'node' });
        }
    });

    if (terminalEntities.length === 0) return null;

    const terminalOutputs = terminalEntities.map(entity => {
        if (entity.type === 'factory') {
            const factory = get(workflowContainers).find(c => c.id === entity.id);
            return factory ? getFactoryOutput(factory) : null;
        }
        if (entity.type === 'node') {
             const nodeData = nodeActions.getNodeData(entity.id);
             return nodeData ? nodeData.data.output : null;
        }
        return null;
    }).filter(Boolean);

    if (terminalOutputs.length === 0) return null;
    if (terminalOutputs.length === 1) return terminalOutputs[0];
    
    // Merge outputs (same logic as getFactoryOutput)
    const mergedValue = { facts: [], history: [], task: '' };
    const mergedSources = new Set();
    const mergedContextChain = [];
    const seenContextItems = new Set();

    terminalOutputs.forEach(output => {
        if (output.value?.facts) mergedValue.facts.push(...output.value.facts);
        if (output.value?.history) mergedValue.history.push(...output.value.history);
        if (output.value?.task) mergedValue.task = output.value.task;
        (output.sources || []).forEach(s => mergedSources.add(s));
        (output.context_chain || []).forEach(item => {
            if (!seenContextItems.has(item.node_id)) {
                mergedContextChain.push(item);
                seenContextItems.add(item.node_id);
            }
        });
    });
    
    return {
        type: 'structured_context',
        value: mergedValue,
        sources: Array.from(mergedSources),
        context_chain: mergedContextChain,
    };
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
        
        if (targetId.startsWith('machine-')) {
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