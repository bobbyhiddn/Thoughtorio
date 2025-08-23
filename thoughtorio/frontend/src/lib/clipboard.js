// @ts-nocheck
/**
 * Clipboard utilities for copy/paste operations with node configs and text
 */

import { stringify as yamlStringify, parse as yamlParse } from 'yaml';

// Helper function to get current workflow containers
async function getCurrentContainers() {
    const { workflowContainers } = await import('../stores/workflows.js');
    const { get } = await import('svelte/store');
    return get(workflowContainers);
}

// Helper function to get node coordinates
function getNodeCoordinates(nodeId, nodesList) {
    if (!nodesList) return { x: 0, y: 0 };
    const node = nodesList.find(n => n.id === nodeId);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
}

// Helper function to create elegant node config with coordinates
function createElegantNodeConfig(node, nodeData, nodesList, connections = [], containerContext = null) {
    const coords = node ? { x: node.x, y: node.y } : getNodeCoordinates(node?.id, nodesList);
    
    const elegantNode = {
        id: node?.id,
        type: nodeData.data.node_type,
        content: nodeData.data.content || "",
        x: coords.x,
        y: coords.y
    };
    
    // Add context/inputs - use nodeData first, then check connections
    if (nodeData.data.inputs && nodeData.data.inputs.length > 0) {
        if (nodeData.data.inputs.length === 1) {
            elegantNode.context = nodeData.data.inputs[0].source_id;
        } else {
            elegantNode.inputs = nodeData.data.inputs.map(input => input.source_id);
        }
    } else {
        // If no nodeData inputs, check connections for cross-component connections
        const incomingConnections = connections.filter(conn => conn.toId === node?.id);
        if (incomingConnections.length === 1) {
            elegantNode.context = incomingConnections[0].fromId;
        } else if (incomingConnections.length > 1) {
            elegantNode.inputs = incomingConnections.map(conn => conn.fromId);
        } else {
            elegantNode.context = "none";
        }
    }
    
    // Add outputs from connections
    if (connections.length > 0) {
        const outgoingConnections = connections.filter(conn => conn.fromId === node?.id);
        if (outgoingConnections.length > 0) {
            elegantNode.outputs = outgoingConnections.map(conn => conn.toId);
        }
    }
    
    return elegantNode;
}

// REPLACE THE OLD FUNCTIONS WITH THIS ENTIRE BLOCK

// Helper functions to create nodes/containers from configs
async function createNodeFromConfig(nodeConfig, offsetX = 0, offsetY = 0) {
    const { nodeActions } = await import('../stores/nodes.js');
    
    // Use reasonable default coordinates if config coordinates are extreme or missing
    let x = nodeConfig.x;
    let y = nodeConfig.y;
    
    // Check for extreme, invalid, or missing coordinates
    if (x == null || y == null || Math.abs(x) > 10000 || Math.abs(y) > 10000 || isNaN(x) || isNaN(y)) {
        console.log(`⚠️ Invalid/extreme coordinates detected (${x}, ${y}), using offset only`);
        x = 0;
        y = 0;
    }
    
    const finalX = x + offsetX;
    const finalY = y + offsetY;
    
    console.log(`🔧 Creating node: type="${nodeConfig.type}", content="${nodeConfig.content}", x=${finalX}, y=${finalY}`);
    
    const node = nodeActions.add(nodeConfig.type, finalX, finalY, nodeConfig.content || '');
    
    console.log(`✅ Created node: id="${node.id}", type="${node.type}", title="${node.title}"`);
    
    return { node };
}

async function createMachineFromConfig(machineConfig, offsetX = 0, offsetY = 0) {
    const nodes = [];
    const connections = [];
    
    // Create all nodes first, building a map to translate old IDs to new IDs
    const nodeIdMap = new Map(); // oldId -> newId mapping
    for (const nodeConfig of machineConfig.nodes || []) {
        const { node } = await createNodeFromConfig(nodeConfig, offsetX, offsetY);
        nodes.push(node);
        nodeIdMap.set(nodeConfig.id, node.id);
    }
    
    // Create connections using the new IDs, avoiding duplicates
    const { connectionActions } = await import('../stores/nodes.js');
    const createdConnectionsSet = new Set();

    for (const nodeConfig of machineConfig.nodes || []) {
        const newFromId = nodeIdMap.get(nodeConfig.id);

        // Handle 'outputs' array
        if (nodeConfig.outputs && Array.isArray(nodeConfig.outputs)) {
            for (const targetId of nodeConfig.outputs) {
                const newToId = nodeIdMap.get(targetId);
                if (newFromId && newToId) {
                    const connectionKey = `${newFromId}->${newToId}`;
                    if (!createdConnectionsSet.has(connectionKey)) {
                        const connection = connectionActions.add(newFromId, newToId, 'output', 'input');
                        connections.push(connection);
                        createdConnectionsSet.add(connectionKey);
                    }
                }
            }
        }
        
        // Handle 'context' (single input)
        if (nodeConfig.context && nodeConfig.context !== 'none') {
            const newToId = nodeIdMap.get(nodeConfig.id);
            const newFromId = nodeIdMap.get(nodeConfig.context);
            if (newFromId && newToId) {
                const connectionKey = `${newFromId}->${newToId}`;
                if (!createdConnectionsSet.has(connectionKey)) {
                    const connection = connectionActions.add(newFromId, newToId, 'output', 'input');
                    connections.push(connection);
                    createdConnectionsSet.add(connectionKey);
                }
            }
        }
        
        // Handle 'inputs' array (multiple inputs)
        if (nodeConfig.inputs && Array.isArray(nodeConfig.inputs)) {
            for (const sourceId of nodeConfig.inputs) {
                const newToId = nodeIdMap.get(nodeConfig.id);
                const newFromId = nodeIdMap.get(sourceId);
                if (newFromId && newToId) {
                    const connectionKey = `${newFromId}->${newToId}`;
                    if (!createdConnectionsSet.has(connectionKey)) {
                        const connection = connectionActions.add(newFromId, newToId, 'output', 'input');
                        connections.push(connection);
                        createdConnectionsSet.add(connectionKey);
                    }
                }
            }
        }
    }
    
    // Wait for container detection to get the actual machine ID
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const machineContainers = await getCurrentContainers();
    
    const machineIdMap = new Map(); // oldMachineId -> newMachineId
    
    // Find the machine container that was created for these nodes
    const machineContainer = machineContainers.find(c => 
        !c.isFactory && !c.isNetwork && c.nodes &&
        c.nodes.some(n => nodes.some(createdNode => createdNode.id === n.id))
    );
    if (machineContainer && machineConfig.id) {
        machineIdMap.set(machineConfig.id, machineContainer.id);
    }
    
    return { nodes, connections, nodeIdMap, machineIdMap };
}

async function createFactoryFromConfig(factoryConfig, offsetX = 0, offsetY = 0) {
    const allCreatedNodes = [];
    const allCreatedConnections = [];
    const { connectionActions } = await import('../stores/nodes.js');
    
    // Part 1: Create nodes for all machines and their internal connections.
    const oldMachineToNewNodeIds = new Map();
    const allMachineNodeIdMap = new Map(); // Translates all old node IDs from within machines to their new IDs.
    
    for (const machineConfig of factoryConfig.machines || []) {
        const result = await createMachineFromConfig(machineConfig, offsetX, offsetY);
        allCreatedNodes.push(...result.nodes);
        allCreatedConnections.push(...result.connections);
        
        // Store the set of new node IDs for identifying the container later.
        const newNodeIds = new Set(result.nodes.map(n => n.id));
        oldMachineToNewNodeIds.set(machineConfig.id, newNodeIds);

        // Add this machine's ID translations to the factory-wide map.
        for (const [oldId, newId] of result.nodeIdMap.entries()) {
            allMachineNodeIdMap.set(oldId, newId);
        }
    }

    // Part 2: Create standalone nodes for the factory.
    const standaloneNodeIdMap = new Map();
    for (const nodeConfig of factoryConfig.nodes || []) {
        const { node } = await createNodeFromConfig(nodeConfig, offsetX, offsetY);
        allCreatedNodes.push(node);
        standaloneNodeIdMap.set(nodeConfig.id, node.id);
    }
    
    // Part 3: CRITICAL - Wait for Svelte's reactivity to create the new machine containers.
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Now, find the newly created machine containers.
    const currentContainers = await getCurrentContainers();
    const oldMachineToNewMachineId = new Map(); // Translates old machine IDs to new machine container IDs.

    for (const [oldMachineId, newNodeIds] of oldMachineToNewNodeIds.entries()) {
        const foundContainer = currentContainers.find(container => {
            if (!container.nodes || container.isFactory || container.isNetwork) return false;
            const containerNodeIds = new Set(container.nodes.map(n => n.id));
            if (containerNodeIds.size !== newNodeIds.size) return false;
            // Check if all new node IDs are present in this container.
            for (const id of newNodeIds) {
                if (!containerNodeIds.has(id)) return false;
            }
            return true;
        });

        if (foundContainer) {
            oldMachineToNewMachineId.set(oldMachineId, foundContainer.id);
        } else {
            console.warn(`Could not find new machine container for old machine ${oldMachineId}`);
        }
    }
    
    // Part 4: Create the final factory-level (hierarchical) connections.
    const createdHierarchicalConnections = new Set();
    
    // Connections *from* nodes inside machines *to* standalone nodes.
    for (const machineConfig of factoryConfig.machines || []) {
        for (const nodeConfig of machineConfig.nodes || []) {
            const newFromId = allMachineNodeIdMap.get(nodeConfig.id);
            if (nodeConfig.outputs && Array.isArray(nodeConfig.outputs)) {
                for (const targetId of nodeConfig.outputs) {
                    const newToId = standaloneNodeIdMap.get(targetId);
                    if (newFromId && newToId) {
                        const key = `${newFromId}->${newToId}`;
                        if (!createdHierarchicalConnections.has(key)) {
                            connectionActions.add(newFromId, newToId, 'output', 'input');
                            createdHierarchicalConnections.add(key);
                        }
                    }
                }
            }
        }
    }

    // Connections involving standalone nodes (source or target).
    for (const nodeConfig of factoryConfig.nodes || []) {
        const newStandaloneNodeId = standaloneNodeIdMap.get(nodeConfig.id);

        // Case: Standalone -> machine node OR Standalone -> standalone node
        if (nodeConfig.outputs && Array.isArray(nodeConfig.outputs)) {
            for (const targetId of nodeConfig.outputs) {
                const newTargetId = allMachineNodeIdMap.get(targetId) || standaloneNodeIdMap.get(targetId);
                if (newStandaloneNodeId && newTargetId) {
                    const key = `${newStandaloneNodeId}->${newTargetId}`;
                    if (!createdHierarchicalConnections.has(key)) {
                        connectionActions.add(newStandaloneNodeId, newTargetId, 'output', 'input');
                        createdHierarchicalConnections.add(key);
                    }
                }
            }
        }

        // Case: machine (container) OR node -> this standalone node
        if (nodeConfig.context && nodeConfig.context !== 'none') {
            if (nodeConfig.context.startsWith('machine-')) {
                // This is a hierarchical connection from a machine container.
                const newMachineId = oldMachineToNewMachineId.get(nodeConfig.context);
                if (newMachineId && newStandaloneNodeId) {
                    const key = `${newMachineId}->${newStandaloneNodeId}`;
                    if (!createdHierarchicalConnections.has(key)) {
                        connectionActions.add(newMachineId, newStandaloneNodeId, 'output', 'input');
                        createdHierarchicalConnections.add(key);
                    }
                }
            } else {
                // This is a standard connection from another node.
                const newContextId = allMachineNodeIdMap.get(nodeConfig.context) || standaloneNodeIdMap.get(nodeConfig.context);
                if (newContextId && newStandaloneNodeId) {
                    const key = `${newContextId}->${newStandaloneNodeId}`;
                    if (!createdHierarchicalConnections.has(key)) {
                        connectionActions.add(newContextId, newStandaloneNodeId, 'output', 'input');
                        createdHierarchicalConnections.add(key);
                    }
                }
            }
        }
    }
    
    // Wait for container detection to get the actual factory and machine IDs
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const factoryContainers = await getCurrentContainers();
    
    const factoryIdMap = new Map(); // oldFactoryId -> newFactoryId  
    const machineIdMap = new Map(); // oldMachineId -> newMachineId
    
    // Find the factory container that was created
    const createdFactory = factoryContainers.find(c => c.isFactory);
    if (createdFactory) {
        factoryIdMap.set(factoryConfig.id, createdFactory.id);
    }
    
    // Find machine containers for each original machine
    for (const [oldMachineId, newNodeIds] of oldMachineToNewNodeIds.entries()) {
        const machineContainer = factoryContainers.find(c => 
            !c.isFactory && !c.isNetwork && c.nodes &&
            c.nodes.some(n => newNodeIds.has(n.id))
        );
        if (machineContainer) {
            machineIdMap.set(oldMachineId, machineContainer.id);
        }
    }
    
    return { 
        nodes: allCreatedNodes, 
        connections: allCreatedConnections, 
        factoryIdMap,
        machineIdMap,
        nodeIdMap: new Map([...allMachineNodeIdMap, ...standaloneNodeIdMap])
    };
}

async function createNetworkFromConfig(networkConfig, offsetX = 0, offsetY = 0) {
    console.log('🌐 Creating network from config:', networkConfig);

    const nodes = [];
    const connections = [];
    const factoryIdMap = new Map(); // oldFactoryId -> newFactoryId
    const machineIdMap = new Map(); // oldMachineId -> newMachineId

    // Step 1: Create all constituent factories and machines
    for (const factoryConfig of networkConfig.factories || []) {
        const result = await createFactoryFromConfig(factoryConfig, offsetX, offsetY);
        nodes.push(...result.nodes);
        connections.push(...result.connections);
        
        // Build factory ID mapping if the result includes factory mapping
        if (result.factoryIdMap) {
            for (const [oldId, newId] of result.factoryIdMap.entries()) {
                factoryIdMap.set(oldId, newId);
            }
        }
        if (result.machineIdMap) {
            for (const [oldId, newId] of result.machineIdMap.entries()) {
                machineIdMap.set(oldId, newId);
            }
        }
    }

    for (const machineConfig of networkConfig.machines || []) {
        const result = await createMachineFromConfig(machineConfig, offsetX, offsetY);
        nodes.push(...result.nodes);
        connections.push(...result.connections);
        
        if (result.machineIdMap) {
            for (const [oldId, newId] of result.machineIdMap.entries()) {
                machineIdMap.set(oldId, newId);
            }
        }
    }

    for (const nodeConfig of networkConfig.nodes || []) {
        const { node } = await createNodeFromConfig(nodeConfig, offsetX, offsetY);
        nodes.push(node);
    }

    // Step 2: Wait for workflow containers to be detected
    console.log('🌐 Waiting for factory and machine containers to be created...');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 3: Find the newly created factory and machine containers
    const networkContainers = await getCurrentContainers();
    
    const createdFactories = networkContainers.filter(c => c.isFactory);
    const createdMachines = networkContainers.filter(c => !c.isFactory && !c.isNetwork);
    
    console.log('🌐 Found containers after network creation:', {
        factories: createdFactories.map(f => f.id),
        machines: createdMachines.map(m => m.id)
    });

    // Step 4: Create network-level connections using the same pattern as factory connections
    const { connectionActions } = await import('../stores/nodes.js');
    const createdHierarchicalConnections = new Set();
    
    // Build node ID map for network-level standalone nodes
    const networkNodeIdMap = new Map();
    for (const nodeConfig of networkConfig.nodes || []) {
        const createdNode = nodes.find(n => 
            Math.abs(n.x - (nodeConfig.x + offsetX)) < 1 && 
            Math.abs(n.y - (nodeConfig.y + offsetY)) < 1 &&
            n.type === nodeConfig.type
        );
        if (createdNode) {
            networkNodeIdMap.set(nodeConfig.id, createdNode.id);
            console.log('🌐 Mapped network node:', nodeConfig.id, '->', createdNode.id);
        }
    }
    
    console.log('🌐 Processing', (networkConfig.nodes || []).length, 'network standalone nodes for connections');
    
    // Create connections for network standalone nodes - copying factory pattern exactly
    for (const nodeConfig of networkConfig.nodes || []) {
        const newStandaloneNodeId = networkNodeIdMap.get(nodeConfig.id);
        
        // Network-level hierarchical connection: factory -> standalone node
        if (nodeConfig.context && nodeConfig.context !== 'none') {
            if (nodeConfig.context.startsWith('factory-')) {
                // This is a hierarchical connection from a factory container
                const newFactoryId = factoryIdMap.get(nodeConfig.context);
                console.log('🌐 Looking up factory context:', nodeConfig.context, '->', newFactoryId);
                if (newFactoryId && newStandaloneNodeId) {
                    const key = `${newFactoryId}->${newStandaloneNodeId}`;
                    if (!createdHierarchicalConnections.has(key)) {
                        console.log('🌐 Creating factory-to-node connection:', newFactoryId, '->', newStandaloneNodeId);
                        connectionActions.add(newFactoryId, newStandaloneNodeId, 'output', 'input');
                        connections.push({ fromId: newFactoryId, toId: newStandaloneNodeId });
                        createdHierarchicalConnections.add(key);
                    }
                }
            } else if (nodeConfig.context.startsWith('machine-')) {
                // This is a hierarchical connection from a machine container
                const newMachineId = machineIdMap.get(nodeConfig.context);
                console.log('🌐 Looking up machine context:', nodeConfig.context, '->', newMachineId);
                if (newMachineId && newStandaloneNodeId) {
                    const key = `${newMachineId}->${newStandaloneNodeId}`;
                    if (!createdHierarchicalConnections.has(key)) {
                        console.log('🌐 Creating machine-to-node connection:', newMachineId, '->', newStandaloneNodeId);
                        connectionActions.add(newMachineId, newStandaloneNodeId, 'output', 'input');
                        connections.push({ fromId: newMachineId, toId: newStandaloneNodeId });
                        createdHierarchicalConnections.add(key);
                    }
                }
            } else {
                // This is a standard connection from another node
                const newContextId = networkNodeIdMap.get(nodeConfig.context);
                console.log('🌐 Looking up node context:', nodeConfig.context, '->', newContextId);
                if (newContextId && newStandaloneNodeId) {
                    const key = `${newContextId}->${newStandaloneNodeId}`;
                    if (!createdHierarchicalConnections.has(key)) {
                        console.log('🌐 Creating node-to-node connection:', newContextId, '->', newStandaloneNodeId);
                        connectionActions.add(newContextId, newStandaloneNodeId, 'output', 'input');
                        connections.push({ fromId: newContextId, toId: newStandaloneNodeId });
                        createdHierarchicalConnections.add(key);
                    }
                }
            }
        }
    }

    // Step 5: Wait for network container to be detected and created
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('🌐 Successfully created network with', nodes.length, 'nodes and', connections.length, 'connections');
    return { nodes, connections, factoryIdMap, machineIdMap };
}

// Internal clipboard for configs (fallback when system clipboard fails)
let internalClipboard = {
    type: null,
    data: null,
    timestamp: null
};

/**
 * Copy text to system clipboard
 */
export async function copyText(text) {
    try {
        // First try Wails clipboard API (for desktop app)
        if (window.go && window.go.main && window.go.main.App && window.go.main.App.SetClipboard) {
            try {
                console.log('🖥️ Using Wails SetClipboard, text length:', text.length);
                const result = await window.go.main.App.SetClipboard(text);
                console.log('🖥️ Wails SetClipboard result:', result);
                if (result && result.success) {
                    return { success: true, method: 'wails' };
                } else {
                    console.warn('🖥️ Wails SetClipboard failed:', result);
                }
            } catch (wailsError) {
                console.warn('🖥️ Wails clipboard exception, falling back:', wailsError);
            }
        } else {
            console.log('🌐 Wails not available, using browser clipboard');
        }
        
        // Fallback to browser clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return { success: true, method: 'browser' };
        } else {
            // Final fallback for non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            return { success, method: 'execCommand' };
        }
    } catch (error) {
        console.error('Failed to copy text:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Read text from system clipboard
 */
export async function readText() {
    try {
        // First try Wails clipboard API (for desktop app)
        if (window.go && window.go.main && window.go.main.App && window.go.main.App.GetClipboard) {
            try {
                const result = await window.go.main.App.GetClipboard();
                if (result && result.success && result.data) {
                    return { success: true, text: result.data, method: 'wails' };
                }
            } catch (wailsError) {
                console.warn('Wails clipboard read failed, falling back:', wailsError);
            }
        }
        
        // Fallback to browser clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            const text = await navigator.clipboard.readText();
            return { success: true, text, method: 'browser' };
        } else {
            // Can't read from clipboard in non-secure contexts without Wails
            return { success: false, error: 'Clipboard read not available in non-secure context' };
        }
    } catch (error) {
        console.error('Failed to read clipboard:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Copy elegant node configuration (concise YAML format)
 */
export async function copyElegantNodeConfig(nodeData, connections = []) {
    if (!nodeData) {
        return { success: false, error: 'No node data provided' };
    }
    
    try {
        // Get elegant config
        let elegantConfig = nodeData.toElegantConfig();
        
        // Add outputs from connections
        const nodeId = nodeData.data.id;
        const outgoingConnections = connections.filter(conn => conn.fromId === nodeId);
        
        if (outgoingConnections.length > 0) {
            // Parse the YAML to add outputs
            const configData = yamlParse(elegantConfig);
            configData.node.outputs = outgoingConnections.map(conn => conn.toId);
            elegantConfig = yamlStringify(configData, { 
                indent: 2,
                lineWidth: 0,
                minContentWidth: 0
            });
        }
        
        console.log('Copying elegant config to clipboard:', elegantConfig);
        
        // Copy the elegant YAML to system clipboard
        const result = await copyText(elegantConfig);
        
        // Store structured data in internal clipboard for paste operations
        const configData = {
            type: 'elegant_node_config',
            version: '1.0',
            timestamp: new Date().toISOString(),
            config: elegantConfig,
            nodeType: nodeData.data.node_type,
            nodeId: nodeData.data.id
        };
        
        internalClipboard = {
            type: 'elegant_node_config',
            data: configData,
            timestamp: Date.now()
        };
        
        return { 
            success: result.success, 
            method: result.method,
            elegantConfig,
            internal: true
        };
    } catch (error) {
        console.error('Failed to copy elegant node config:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Copy node metadata (full technical details)
 */
export async function copyNodeMetadata(nodeData) {
    if (!nodeData) {
        return { success: false, error: 'No node data provided' };
    }
    
    try {
        // Use clean YAML without verbose history for metadata
        const yamlConfig = nodeData.toCleanYAML();
        console.log('Copying metadata to clipboard:', yamlConfig);
        
        // Copy the raw YAML to system clipboard
        const result = await copyText(yamlConfig);
        
        // Store structured data in internal clipboard for paste operations
        const configData = {
            type: 'node_metadata',
            version: '1.0',
            timestamp: new Date().toISOString(),
            config: yamlConfig,
            nodeType: nodeData.data.node_type,
            nodeId: nodeData.data.id
        };
        
        internalClipboard = {
            type: 'node_metadata',
            data: configData,
            timestamp: Date.now()
        };
        
        return { 
            success: result.success, 
            method: result.method,
            yamlConfig,
            internal: true
        };
    } catch (error) {
        console.error('Failed to copy node metadata:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Copy node configuration in elegant format
 * @param {NodeData} nodeData - Node data to copy
 * @param {string} visualContent - Visual content from the node (optional)
 * @returns {Promise<{success: boolean, elegantConfig?: string, error?: string}>}
 */
export async function copyNodeConfig(nodeData, visualContent = null, nodePosition = null) {
    try {
        const elegantConfig = nodeData.toElegantConfig(visualContent);
        console.log('Generated elegant config:', elegantConfig);
        
        // Copy the elegant YAML to system clipboard
        const result = await copyText(elegantConfig);
        
        // Store structured data in internal clipboard for paste operations
        const configData = {
            type: 'elegant_node_config',
            version: '1.0',
            timestamp: new Date().toISOString(),
            config: elegantConfig,
            nodeType: nodeData.data.node_type,
            nodeId: nodeData.data.id
        };
        
        internalClipboard = {
            type: 'elegant_node_config',
            data: configData,
            timestamp: Date.now()
        };
        
        return { 
            success: result.success, 
            method: result.method,
            elegantConfig,
            internal: true
        };
    } catch (error) {
        console.error('Failed to copy node config:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Copy machine configuration (concise format)
 */
export async function copyMachineConfig(container, nodeDataMap, nodesList = null) {
    if (!container || !nodeDataMap) {
        return { success: false, error: 'No container or node data provided' };
    }
    
    try {
        let elegantConfig;
        
        if (container.isFactory) {
            // Factory: show machines with their nested nodes
            const elegantMachines = (container.machines || []).map(machine => {
                const elegantNodes = (machine.nodes || []).map(node => {
                    const nodeData = nodeDataMap.get(node.id);
                    if (!nodeData) return null;
                    // Use both machine and factory-level connections to capture cross-component connections
                    const allConnections = [...(machine.connections || []), ...(container.connections || [])];
                    return createElegantNodeConfig(node, nodeData, nodesList, allConnections);
                }).filter(Boolean);
                
                return { id: machine.id, nodes: elegantNodes };
            });
            
            // Add standalone nodes in the factory (not in machines)
            const standaloneNodes = (container.nodeIds || [])
                .filter(nodeId => {
                    // Find nodes that are not in any machine
                    const isInMachine = container.machines && container.machines.some(machine => 
                        machine.nodes && machine.nodes.some(node => node.id === nodeId)
                    );
                    return !isInMachine;
                })
                .map(nodeId => {
                    const nodeData = nodeDataMap.get(nodeId);
                    if (!nodeData) return null;
                    // Find the actual node object with coordinates from nodesList
                    const nodeWithCoords = nodesList ? nodesList.find(n => n.id === nodeId) : null;
                    return createElegantNodeConfig(
                        nodeWithCoords || { id: nodeId }, // Pass full node with coordinates if available
                        nodeData, 
                        nodesList, 
                        container.connections || []
                    );
                }).filter(Boolean);
            
            // Create factory config
            elegantConfig = {
                factory: {
                    id: container.id,
                    machines: elegantMachines,
                    ...(standaloneNodes.length > 0 && { nodes: standaloneNodes })
                }
            };
        } else {
            // Regular machine: use container.nodes
            const elegantNodes = (container.nodes || []).map(node => {
                const nodeData = nodeDataMap.get(node.id);
                if (!nodeData) return null;
                return createElegantNodeConfig(node, nodeData, nodesList, container.connections || []);
            }).filter(Boolean);
            
            // Create machine config
            elegantConfig = {
                machine: {
                    id: container.id,
                    nodes: elegantNodes
                }
            };
        }
        
        const configYaml = yamlStringify(elegantConfig, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
        
        console.log('Copying elegant machine config:', configYaml);
        
        const result = await copyText(configYaml);
        
        internalClipboard = {
            type: container.isFactory ? 'elegant_factory_config' : 'elegant_machine_config',
            data: elegantConfig,
            timestamp: Date.now()
        };
        
        return { 
            success: true, 
            method: result.method,
            config: elegantConfig,
            configYaml,
            internal: true
        };
    } catch (error) {
        console.error('Failed to copy elegant machine config:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Copy machine metadata (full technical details)
 */
export async function copyMachineMetadata(container, nodeDataMap) {
    if (!container || !nodeDataMap) {
        return { success: false, error: 'No container or node data provided' };
    }
    
    try {
        let allNodes = [];
        let configType = 'machine_metadata';
        
        if (container.isFactory) {
            configType = 'factory_metadata';
            if (container.machines) {
                container.machines.forEach(machine => {
                    if (machine.nodes) {
                        allNodes.push(...machine.nodes);
                    }
                });
            }
        } else {
            allNodes = container.nodes || [];
        }
        
        // Create clean node configs (without verbose history)
        const nodeConfigs = allNodes.map(node => {
            const nodeData = nodeDataMap.get(node.id);
            if (!nodeData) return null;
            
            // Create clean version without verbose history
            const cleanData = {
                node_type: nodeData.data.node_type,
                id: nodeData.data.id,
                content: nodeData.data.content,
                metadata: {
                    title: nodeData.data.metadata.title,
                    created_at: nodeData.data.metadata.created_at,
                    version: nodeData.data.metadata.version
                },
                inputs: nodeData.data.inputs,
                processing: nodeData.data.processing,
                output: nodeData.data.output,
                execution: nodeData.data.execution
            };
            
            return cleanData;
        }).filter(Boolean);
        
        // Create metadata config
        const config = {
            type: configType,
            version: '1.0',
            timestamp: new Date().toISOString(),
            [container.isFactory ? 'factory' : 'machine']: {
                id: container.id,
                nodeCount: allNodes.length,
                isWorkflow: container.isWorkflow,
                isFactory: container.isFactory,
                bounds: container.bounds
            },
            nodes: nodeConfigs,
            connections: container.connections || [],
            metadata: {
                total_nodes: nodeConfigs.length,
                node_types: [...new Set(nodeConfigs.map(n => n.node_type))]
            }
        };
        
        const configYaml = yamlStringify(config, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
        
        const result = await copyText(configYaml);
        
        internalClipboard = {
            type: configType,
            data: config,
            timestamp: Date.now()
        };
        
        return { 
            success: true, 
            method: result.method,
            config,
            configYaml,
            internal: true
        };
    } catch (error) {
        console.error('Failed to copy machine metadata:', error);
        return { success: false, error: error.message };
    }
}


/**
 * Copy network configuration (concise format)
 */
export async function copyNetworkConfig(container, nodeDataMap, nodesList = null) {
    if (!container || !nodeDataMap) {
        return { success: false, error: 'No container or node data provided' };
    }

    try {
        // Process factories and their machines
        const elegantFactories = (container.factories || []).map(factory => {
            const elegantMachines = (factory.machines || []).map(machine => {
                const elegantNodes = (machine.nodes || []).map(node => {
                    const nodeData = nodeDataMap.get(node.id);
                    if (!nodeData) return null;
                    // Use both machine and factory-level connections to capture cross-component connections
                    const allConnections = [...(machine.connections || []), ...(factory.connections || [])];
                    return createElegantNodeConfig(node, nodeData, nodesList, allConnections);
                }).filter(Boolean);
                return { id: machine.id, nodes: elegantNodes };
            });
            
            // Add standalone nodes in the factory (not in machines)
            const standaloneNodes = (factory.nodeIds || [])
                .filter(nodeId => {
                    // Find nodes that are not in any machine
                    const isInMachine = factory.machines && factory.machines.some(machine => 
                        machine.nodes && machine.nodes.some(node => node.id === nodeId)
                    );
                    return !isInMachine;
                })
                .map(nodeId => {
                    const nodeData = nodeDataMap.get(nodeId);
                    if (!nodeData) return null;
                    // Find the actual node object with coordinates from nodesList
                    const nodeWithCoords = nodesList ? nodesList.find(n => n.id === nodeId) : null;
                    return createElegantNodeConfig(
                        nodeWithCoords || { id: nodeId }, // Pass full node with coordinates if available
                        nodeData, 
                        nodesList, 
                        factory.connections || []
                    );
                }).filter(Boolean);
            
            return { 
                id: factory.id, 
                machines: elegantMachines,
                ...(standaloneNodes.length > 0 && { nodes: standaloneNodes })
            };
        });

        // Add machines directly in the network (from factory-to-machine connections)
        const networkMachines = (container.machines || []).map(machine => {
            const elegantNodes = (machine.nodes || []).map(node => {
                const nodeData = nodeDataMap.get(node.id);
                if (!nodeData) return null;
                // Use both machine and network-level connections to capture cross-component connections
                const allConnections = [...(machine.connections || []), ...(container.connections || [])];
                return createElegantNodeConfig(node, nodeData, nodesList, allConnections);
            }).filter(Boolean);
            return { id: machine.id, nodes: elegantNodes };
        });

        // Add standalone nodes at network level (not in any factory or machine)
        const networkStandaloneNodes = (container.nodeIds || [])
            .filter(nodeId => {
                // Find nodes that are not in any factory or network-level machine
                const isInFactory = container.factories && container.factories.some(factory => 
                    factory.nodeIds && factory.nodeIds.includes(nodeId)
                );
                const isInNetworkMachine = container.machines && container.machines.some(machine =>
                    machine.nodes && machine.nodes.some(node => node.id === nodeId)
                );
                return !isInFactory && !isInNetworkMachine;
            })
            .map(nodeId => {
                const nodeData = nodeDataMap.get(nodeId);
                if (!nodeData) return null;
                // Find the actual node object with coordinates from nodesList
                const nodeWithCoords = nodesList ? nodesList.find(n => n.id === nodeId) : null;
                return createElegantNodeConfig(
                    nodeWithCoords || { id: nodeId }, // Pass full node with coordinates if available
                    nodeData, 
                    nodesList, 
                    container.connections || []
                );
            }).filter(Boolean);

        const elegantConfig = {
            network: {
                id: container.id,
                factories: elegantFactories,
                ...(networkMachines.length > 0 && { machines: networkMachines }),
                ...(networkStandaloneNodes.length > 0 && { nodes: networkStandaloneNodes })
            }
        };
        
        const configYaml = yamlStringify(elegantConfig, { indent: 2, lineWidth: 0 });
        const result = await copyText(configYaml);
        
        return { success: true, method: result.method, config: elegantConfig, configYaml };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Copy network metadata (full technical details)
 */
export async function copyNetworkMetadata(container, nodeDataMap) {
    if (!container || !nodeDataMap) {
        return { success: false, error: 'No container or node data provided' };
    }

    try {
        // Detailed factory analysis
        const allFactories = container.factories || [];
        const factoryConfigs = allFactories.map(factory => {
            const machineConfigs = (factory.machines || []).map(machine => {
                return {
                    id: machine.id,
                    nodeCount: (machine.nodes || []).length,
                    nodeTypes: [...new Set((machine.nodes || []).map(node => {
                        const nodeData = nodeDataMap.get(node.id);
                        return nodeData ? nodeData.data.node_type : 'unknown';
                    }))],
                    bounds: machine.bounds
                };
            });
            
            const factoryStandaloneNodes = (factory.nodeIds || []).filter(nodeId => {
                const isInMachine = factory.machines && factory.machines.some(machine => 
                    machine.nodes && machine.nodes.some(node => node.id === nodeId)
                );
                return !isInMachine;
            });
            
            return {
                id: factory.id,
                machineCount: machineConfigs.length,
                standaloneNodeCount: factoryStandaloneNodes.length,
                totalNodeCount: (factory.nodeIds || []).length,
                machines: machineConfigs,
                standaloneNodes: factoryStandaloneNodes.map(nodeId => {
                    const nodeData = nodeDataMap.get(nodeId);
                    return nodeData ? {
                        id: nodeId,
                        type: nodeData.data.node_type,
                        title: nodeData.data.metadata.title,
                        version: nodeData.data.metadata.version
                    } : { id: nodeId, type: 'unknown' };
                }),
                bounds: factory.bounds
            };
        });

        // Network-level machines (from factory-to-machine connections)
        const networkMachines = (container.machines || []).map(machine => {
            return {
                id: machine.id,
                nodeCount: (machine.nodes || []).length,
                nodeTypes: [...new Set((machine.nodes || []).map(node => {
                    const nodeData = nodeDataMap.get(node.id);
                    return nodeData ? nodeData.data.node_type : 'unknown';
                }))],
                nodes: (machine.nodes || []).map(node => {
                    const nodeData = nodeDataMap.get(node.id);
                    return nodeData ? {
                        id: node.id,
                        type: nodeData.data.node_type,
                        title: nodeData.data.metadata.title,
                        version: nodeData.data.metadata.version
                    } : { id: node.id, type: 'unknown' };
                }),
                bounds: machine.bounds
            };
        });

        // Network-level standalone nodes
        const networkStandaloneNodes = (container.nodeIds || [])
            .filter(nodeId => {
                const isInFactory = container.factories && container.factories.some(factory => 
                    factory.nodeIds && factory.nodeIds.includes(nodeId)
                );
                const isInNetworkMachine = container.machines && container.machines.some(machine =>
                    machine.nodes && machine.nodes.some(node => node.id === nodeId)
                );
                return !isInFactory && !isInNetworkMachine;
            })
            .map(nodeId => {
                const nodeData = nodeDataMap.get(nodeId);
                return nodeData ? {
                    id: nodeId,
                    type: nodeData.data.node_type,
                    title: nodeData.data.metadata.title,
                    content: nodeData.data.content,
                    version: nodeData.data.metadata.version,
                    inputs: (nodeData.data.inputs || []).map(input => ({
                        sourceId: input.source_id,
                        weight: input.weight
                    })),
                    execution: nodeData.data.execution
                } : { id: nodeId, type: 'unknown' };
            });

        // Calculate total statistics
        const allNodeIds = new Set();
        allFactories.forEach(factory => {
            (factory.nodeIds || []).forEach(nodeId => allNodeIds.add(nodeId));
        });
        networkMachines.forEach(machine => {
            (machine.nodes || []).forEach(node => allNodeIds.add(node.id));
        });
        (container.nodeIds || []).forEach(nodeId => allNodeIds.add(nodeId));

        const config = {
            type: 'network_metadata',
            version: '1.0',
            timestamp: new Date().toISOString(),
            network: { 
                id: container.id, 
                factoryCount: allFactories.length,
                machineCount: networkMachines.length,
                standaloneNodeCount: networkStandaloneNodes.length,
                totalNodeCount: allNodeIds.size,
                bounds: container.bounds
            },
            factories: factoryConfigs,
            machines: networkMachines,
            networkStandaloneNodes: networkStandaloneNodes,
            connections: container.connections || [],
            metadata: {
                total_factories: allFactories.length,
                total_machines: allFactories.reduce((sum, f) => sum + (f.machines || []).length, 0) + networkMachines.length,
                total_nodes: allNodeIds.size,
                connection_count: (container.connections || []).length,
                hierarchy_depth: 3, // Network -> Factory -> Machine -> Node
                container_types: ['network', 'factory', 'machine'],
                analysis: {
                    factories_with_machines: allFactories.filter(f => (f.machines || []).length > 0).length,
                    factories_with_standalone_nodes: allFactories.filter(f => {
                        const standaloneCount = (f.nodeIds || []).filter(nodeId => {
                            const isInMachine = f.machines && f.machines.some(machine => 
                                machine.nodes && machine.nodes.some(node => node.id === nodeId)
                            );
                            return !isInMachine;
                        }).length;
                        return standaloneCount > 0;
                    }).length,
                    network_level_machines: networkMachines.length,
                    network_standalone_nodes: networkStandaloneNodes.length
                }
            }
        };
        
        const configYaml = yamlStringify(config, { indent: 2, lineWidth: 0 });
        const result = await copyText(configYaml);

        return { success: true, method: result.method, config, configYaml };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Paste and create nodes/containers from clipboard config
 */
export async function pasteAndCreateConfig(offsetX = 0, offsetY = 0) {
    try {
        console.log('🔍 Starting paste operation with offset:', { offsetX, offsetY });
        const pasteResult = await pasteConfig();
        console.log('📋 Paste result:', pasteResult);
        
        if (!pasteResult.success) {
            console.warn('❌ No valid config in clipboard');
            return { success: false, error: 'No valid config in clipboard' };
        }

        // Parse the config to create nodes/containers
        const config = pasteResult.data;
        let createdNodes = [];
        let createdConnections = [];

        if (config.parsedYaml) {
            const yaml = config.parsedYaml;
            
            // Handle different config types
            if (yaml.machine) {
                const result = await createMachineFromConfig(yaml.machine, offsetX, offsetY);
                createdNodes = result.nodes;
                createdConnections = result.connections;
            } else if (yaml.factory) {
                const result = await createFactoryFromConfig(yaml.factory, offsetX, offsetY);
                createdNodes = result.nodes;
                createdConnections = result.connections;
            } else if (yaml.network) {
                const result = await createNetworkFromConfig(yaml.network, offsetX, offsetY);
                createdNodes = result.nodes;
                createdConnections = result.connections;
            } else if (yaml.node) {
                // Single node config in {node: {...}} format
                const result = await createNodeFromConfig(yaml.node, offsetX, offsetY);
                createdNodes = [result.node];
            } else if (yaml.node_type) {
                // Single node config in direct format
                const result = await createNodeFromConfig(yaml, offsetX, offsetY);
                createdNodes = [result.node];
            }
        }

        return {
            success: true,
            createdNodes,
            createdConnections,
            configType: config.type
        };
    } catch (error) {
        console.error('Failed to paste and create config:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Paste configuration from clipboard
 */
export async function pasteConfig() {
    try {
        // First try to read from system clipboard
        const systemResult = await readText();
        
        if (systemResult.success) {
            const clipboardText = systemResult.text.trim();
            
            // Try to parse as JSON first (structured config)
            try {
                const data = JSON.parse(clipboardText);
                if (data.type === 'node_config' || data.type === 'machine_config' || data.type === 'factory_config') {
                    return {
                        success: true,
                        type: data.type,
                        data: data,
                        method: 'system'
                    };
                }
            } catch (parseError) {
                // Not JSON, try as YAML
                try {
                    const yamlData = yamlParse(clipboardText);
                    
                    // Check if it's a config YAML (node, machine, factory, or network)
                    if (yamlData && (yamlData.node_type || yamlData.node || yamlData.machine || yamlData.factory || yamlData.network)) {
                        return {
                            success: true,
                            type: 'raw_yaml',
                            data: { config: clipboardText, parsedYaml: yamlData },
                            method: 'system'
                        };
                    }
                    
                    // Check if it's a machine/factory config (YAML with type field)
                    if (yamlData && (yamlData.type === 'machine_config' || yamlData.type === 'factory_config')) {
                        return {
                            success: true,
                            type: yamlData.type,
                            data: yamlData,
                            method: 'system'
                        };
                    }
                } catch (yamlError) {
                    // Not valid YAML either
                }
            }
        }
        
        // Fall back to internal clipboard
        if (internalClipboard.type && internalClipboard.data) {
            const age = Date.now() - internalClipboard.timestamp;
            // Only use internal clipboard if it's less than 1 hour old
            if (age < 3600000) {
                return {
                    success: true,
                    type: internalClipboard.type,
                    data: internalClipboard.data,
                    method: 'internal'
                };
            }
        }
        
        return { success: false, error: 'No valid config found in clipboard' };
    } catch (error) {
        console.error('Failed to paste config:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if there's a valid config in clipboard
 */
export async function hasConfig() {
    const result = await pasteConfig();
    return result.success;
}

/**
 * Clear internal clipboard
 */
export function clearClipboard() {
    internalClipboard = {
        type: null,
        data: null,
        timestamp: null
    };
}

/**
 * Get clipboard status
 */
export function getClipboardStatus() {
    return {
        hasInternal: internalClipboard.type !== null,
        internalType: internalClipboard.type,
        internalAge: internalClipboard.timestamp ? Date.now() - internalClipboard.timestamp : null,
        isSecure: navigator.clipboard && window.isSecureContext
    };
}