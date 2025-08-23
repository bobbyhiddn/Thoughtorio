// @ts-nocheck
/**
 * Clipboard utilities for copy/paste operations with node configs and text
 */

import { stringify as yamlStringify, parse as yamlParse } from 'yaml';
import { UniversalContainer, UniversalConnector } from './UniversalContainer.js';

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

// Universal coordinate calculation system
class CoordinateCalculator {
    // Calculate the bounding box of a config
    static getBounds(config) {
        const coords = [];
        
        const extractCoords = (obj) => {
            if (obj.x !== undefined && obj.y !== undefined) {
                coords.push({ x: obj.x, y: obj.y });
            }
            
            // Handle nested structures
            if (obj.nodes) {
                obj.nodes.forEach(extractCoords);
            }
            if (obj.machines) {
                obj.machines.forEach(extractCoords);
            }
            if (obj.factories) {
                obj.factories.forEach(extractCoords);
            }
        };
        
        extractCoords(config);
        
        if (coords.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        }
        
        const minX = Math.min(...coords.map(c => c.x));
        const minY = Math.min(...coords.map(c => c.y));
        const maxX = Math.max(...coords.map(c => c.x));
        const maxY = Math.max(...coords.map(c => c.y));
        
        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }
    
    // Calculate smart paste coordinates
    static calculatePasteCoordinates(config, targetX = 400, targetY = 300) {
        const bounds = this.getBounds(config);
        
        // If the config has no coordinates or extreme coordinates, center at target
        if (bounds.width === 0 && bounds.height === 0) {
            return { offsetX: targetX, offsetY: targetY };
        }
        
        // Check for extreme coordinates (likely from copy/paste iterations)
        const hasExtremeCoords = bounds.minX > 10000 || bounds.minY > 10000 || 
                                bounds.maxX < -10000 || bounds.maxY < -10000;
        
        if (hasExtremeCoords) {
            console.log('⚠️ Extreme coordinates detected, centering at target');
            return { offsetX: targetX, offsetY: targetY };
        }
        
        // Calculate offset to center the config at the target point
        const offsetX = targetX - bounds.centerX;
        const offsetY = targetY - bounds.centerY;
        
        console.log('📍 Calculated paste offset:', {
            originalBounds: bounds,
            target: { x: targetX, y: targetY },
            offset: { x: offsetX, y: offsetY }
        });
        
        return { offsetX, offsetY };
    }
    
    // Get canvas center coordinates (fallback when no target specified)
    static getCanvasCenter() {
        // Try to get current canvas viewport
        try {
            // This would need to be imported from canvas store
            return { x: 400, y: 300 }; // Default center
        } catch (error) {
            return { x: 400, y: 300 }; // Safe fallback
        }
    }
}

// Helper function to create node config with coordinates
function createNodeConfig(node, nodeData, nodesList, connections = [], containerContext = null) {
    const coords = node ? { x: node.x, y: node.y } : getNodeCoordinates(node?.id, nodesList);
    
    const nodeConfig = {
        id: node?.id,
        type: nodeData.data.node_type,
        content: nodeData.data.content || "",
        x: coords.x,
        y: coords.y
    };
    
    // Add context/inputs - PRIORITIZE CONNECTIONS OVER nodeData for cross-hierarchy connections
    const incomingConnections = connections.filter(conn => conn.toId === node?.id);
    
    if (incomingConnections.length === 1) {
        nodeConfig.context = incomingConnections[0].fromId;
    } else if (incomingConnections.length > 1) {
        nodeConfig.inputs = incomingConnections.map(conn => conn.fromId);
    } else if (nodeData.data.inputs && nodeData.data.inputs.length > 0) {
        // Fall back to nodeData only if no connections found
        if (nodeData.data.inputs.length === 1) {
            nodeConfig.context = nodeData.data.inputs[0].source_id;
        } else {
            nodeConfig.inputs = nodeData.data.inputs.map(input => input.source_id);
        }
    } else {
        nodeConfig.context = "none";
    }
    
    // Add outputs from connections
    if (connections.length > 0) {
        const outgoingConnections = connections.filter(conn => conn.fromId === node?.id);
        if (outgoingConnections.length > 0) {
            nodeConfig.outputs = outgoingConnections.map(conn => conn.toId);
        }
    }
    
    return nodeConfig;
}

// REPLACE THE OLD FUNCTIONS WITH THIS ENTIRE BLOCK

// Generic connection function - object agnostic
async function createConnection(fromId, toId, connectionSet, createdConnections) {
    if (!fromId || !toId) return false;
    
    const key = `${fromId}->${toId}`;
    if (connectionSet.has(key)) return false; // Already exists
    
    const { connectionActions } = await import('../stores/nodes.js');
    connectionActions.add(fromId, toId, 'output', 'input');
    createdConnections.push({ fromId, toId });
    connectionSet.add(key);
    return true;
}

// Helper functions to create nodes/containers from configs
// === LEGACY HELPER FUNCTIONS REMOVED ===
// The following functions have been removed as they're no longer needed:
// - createNodeFromConfig
// - createMachineFromConfig  
// - createFactoryFromConfig
// - createNetworkFromConfig
// These have been replaced by the universal paste system using UniversalContainer

// Legacy helper functions have been completely removed:
// - createNodeFromConfig (replaced by UniversalContainer node creation)
// - createMachineFromConfig (replaced by UniversalContainer machine creation)
// - createFactoryFromConfig (replaced by UniversalContainer factory creation) 
// - createNetworkFromConfig (replaced by UniversalContainer network creation)
// These functions are no longer needed as the universal paste system handles all entity types.

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
 * Copy node configuration (concise format)
 * @param {NodeData} nodeData - Node data to copy
 * @param {array} connections - Connection data for outputs (optional)
 * @param {string} visualContent - Visual content from the node (optional)
 * @returns {Promise<{success: boolean, config?: string, error?: string}>}
 */
// Universal copy function - handles any entity type (node, machine, factory, network)
export async function copyConfig(entityData, entityType = null, connectionData = null, nodeDataMap = null, nodesList = null, visualContent = null) {
    if (!entityData) {
        return { success: false, error: 'No entity data provided' };
    }
    
    try {
        // Auto-detect entity type if not provided
        if (!entityType) {
            if (entityData.data) {
                entityType = 'node';
            } else if (entityData.isNetwork) {
                entityType = 'network';
            } else if (entityData.isFactory) {
                entityType = 'factory';
            } else if (entityData.machines) {
                entityType = 'factory';
            } else {
                entityType = 'machine';
            }
        }
        
        // Gather all container connections for universal resolution
        const allContainerConnections = await getAllContainerConnections(entityData, entityType);
        
        let config;
        let internalType;
        
        switch (entityType) {
            case 'node':
                config = await copyNodeHierarchy(entityData, connectionData, visualContent, allContainerConnections);
                internalType = 'node_config';
                break;
            case 'machine':
                config = await copyMachineHierarchy(entityData, nodeDataMap, nodesList, allContainerConnections);
                internalType = 'machine_config';
                break;
            case 'factory':
                config = await copyFactoryHierarchy(entityData, nodeDataMap, nodesList, allContainerConnections);
                internalType = 'factory_config';
                break;
            case 'network':
                config = await copyNetworkHierarchy(entityData, nodeDataMap, nodesList, allContainerConnections);
                internalType = 'network_config';
                break;
            default:
                throw new Error(`Unknown entity type: ${entityType}`);
        }
        
        console.log(`📋 Universal copy (${entityType}):`, config);
        
        // Copy the YAML to system clipboard
        const result = await copyText(config);
        
        // Store structured data in internal clipboard for paste operations
        const configData = {
            type: internalType,
            version: '1.0',
            timestamp: new Date().toISOString(),
            config: config,
            entityType: entityType
        };
        
        internalClipboard = {
            type: internalType,
            data: configData,
            timestamp: Date.now()
        };
        
        return { 
            success: result.success, 
            method: result.method,
            config,
            internal: true
        };
    } catch (error) {
        console.error('Universal copy error:', error);
        return { success: false, error: error.message };
    }
}

// Helper function to gather all container connections for universal resolution
async function getAllContainerConnections(entityData, entityType) {
    try {
        // Import workflow containers to access all connection data
        const { workflowContainers } = await import('../stores/workflows.js');
        const { get } = await import('svelte/store');
        
        const containers = get(workflowContainers);
        const allConnections = [];
        
        // Collect connections from all container levels
        for (const container of containers) {
            if (container.connections) {
                for (const connection of container.connections) {
                    allConnections.push({
                        ...connection,
                        containerLevel: container.isNetwork ? 'network' : container.isFactory ? 'factory' : 'machine',
                        containerId: container.id
                    });
                }
            }
        }
        
        console.log(`🔗 Gathered ${allConnections.length} container connections for ${entityType} copy`);
        return allConnections;
    } catch (error) {
        console.warn('Could not gather container connections:', error);
        return [];
    }
}

// Universal Connection Resolution System
class UniversalConnectionResolver {
    static getAllRelevantConnections(entityId, entityType, allContainers) {
        const relevantConnections = [];
        
        // Find all containers in the hierarchy
        const allContainersList = this.flattenAllContainers(allContainers);
        
        // Collect connections from all levels that could affect this entity
        for (const container of allContainersList) {
            if (!container.connections) continue;
            
            for (const connection of container.connections) {
                if (this.connectionAffectsEntity(connection, entityId, entityType, allContainersList)) {
                    relevantConnections.push({
                        ...connection,
                        sourceLevel: container.type,
                        resolved: this.resolveConnectionEndpoints(connection, allContainersList)
                    });
                }
            }
        }
        
        return relevantConnections;
    }
    
    static connectionAffectsEntity(connection, entityId, entityType, allContainers) {
        // Direct match
        if (connection.fromId === entityId || connection.toId === entityId) {
            return true;
        }
        
        // Check if entity is contained within connected containers
        const sourceContainer = this.findContainerById(connection.fromId, allContainers);
        const targetContainer = this.findContainerById(connection.toId, allContainers);
        
        if (sourceContainer && this.containerContainsEntity(sourceContainer, entityId)) {
            return true;
        }
        
        if (targetContainer && this.containerContainsEntity(targetContainer, entityId)) {
            return true;
        }
        
        return false;
    }
    
    static resolveConnectionEndpoints(connection, allContainers) {
        const sourceContainer = this.findContainerById(connection.fromId, allContainers);
        const targetContainer = this.findContainerById(connection.toId, allContainers);
        
        if (!sourceContainer || !targetContainer) {
            return { sourceId: connection.fromId, targetId: connection.toId };
        }
        
        const sourceConnector = sourceContainer.getOutputConnector();
        const targetConnector = targetContainer.getInputConnector();
        
        return {
            sourceId: sourceConnector,
            targetId: targetConnector,
            sourceContainer: sourceContainer.id,
            targetContainer: targetContainer.id
        };
    }
    
    static flattenAllContainers(allContainers) {
        const flattened = [];
        
        const flatten = (containers) => {
            for (const container of containers) {
                flattened.push(container);
                if (container.children && container.children.length > 0) {
                    flatten(container.children);
                }
                if (container.machines) {
                    flatten(container.machines);
                }
                if (container.factories) {
                    flatten(container.factories);
                }
            }
        };
        
        flatten(allContainers);
        return flattened;
    }
    
    static findContainerById(id, allContainers) {
        for (const container of allContainers) {
            if (container.id === id) {
                return container;
            }
            
            // Search recursively
            const found = this.findContainerInHierarchy(container, id);
            if (found) return found;
        }
        return null;
    }
    
    static findContainerInHierarchy(container, id) {
        if (container.id === id) {
            return container;
        }
        
        if (container.children) {
            for (const child of container.children) {
                const found = this.findContainerInHierarchy(child, id);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    static containerContainsEntity(container, entityId) {
        if (container.id === entityId) {
            return true;
        }
        
        if (container.children) {
            for (const child of container.children) {
                if (this.containerContainsEntity(child, entityId)) {
                    return true;
                }
            }
        }
        
        return false;
    }
}

// Single source of truth for machine configuration generation
function createMachineConfigObject(machineContainer, nodeDataMap, nodesList, allContainerConnections) {
    // Create an array of node configuration OBJECTS
    const nodes = (machineContainer.nodes || []).map((node, index) => {
        const nodeData = nodeDataMap.get(node.id);
        if (!nodeData) return null;

        // Use the complete connection list to create the base config
        let nodeConfig = createNodeConfig(node, nodeData, nodesList, allContainerConnections);

        // **CRUCIAL LOGIC FOR MACHINE ENTRY POINT**
        // If this is the first node and it has no direct inputs...
        if (index === 0 && nodeConfig.context === "none" && (!nodeConfig.inputs || nodeConfig.inputs.length === 0)) {
            // ...check for an incoming connection to this machine's container ID.
            const incomingConnectionToContainer = allContainerConnections.find(conn => conn.toId === machineContainer.id);
            if (incomingConnectionToContainer) {
                // If found, set this as the context for the entry node.
                nodeConfig.context = incomingConnectionToContainer.fromId;
                console.log(`🔗 Machine entry context resolved: ${machineContainer.id} <- ${incomingConnectionToContainer.fromId}`);
            }
        }
        
        return nodeConfig;
    }).filter(Boolean);

    // Return the JavaScript object for the machine
    return {
        id: machineContainer.id,
        nodes: nodes
    };
}

// Hierarchical copy functions
async function copyNodeHierarchy(nodeData, connections = [], visualContent = null, allContainerConnections = []) {
    // Get config
    let config = nodeData.toConfig(visualContent);
    
    // Add outputs from connections
    const nodeId = nodeData.data.id;
    const outgoingConnections = connections.filter(conn => conn.fromId === nodeId);
    
    if (outgoingConnections.length > 0) {
        // Parse the YAML to add outputs
        const configData = yamlParse(config);
        configData.node.outputs = outgoingConnections.map(conn => conn.toId);
        config = yamlStringify(configData, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
    }
    
    return config;
}

async function copyMachineHierarchy(container, nodeDataMap, nodesList = null, allContainerConnections = []) {
    // 1. Get the machine config object from our new, single source of truth.
    const machineConfigObject = createMachineConfigObject(container, nodeDataMap, nodesList, allContainerConnections);

    // 2. Wrap it in the top-level "machine:" key for the final YAML.
    const finalConfig = {
        machine: machineConfigObject
    };

    // 3. Stringify to YAML.
    return yamlStringify(finalConfig, { 
        indent: 2,
        lineWidth: 0,
        minContentWidth: 0
    });
}

async function copyFactoryHierarchy(container, nodeDataMap, nodesList = null, allContainerConnections = []) {
    // Get machines with their nested nodes
    const machines = (container.machines || []).map(machine => {
        // Use the new helper function to ensure consistent logic
        return createMachineConfigObject(machine, nodeDataMap, nodesList, allContainerConnections);
    });
    
    // Add standalone nodes in the factory (not in machines)
    const standaloneNodes = (container.nodeIds || [])
        .filter(nodeId => {
            const isInMachine = container.machines && container.machines.some(machine => 
                machine.nodes && machine.nodes.some(node => node.id === nodeId)
            );
            return !isInMachine;
        })
        .map(nodeId => {
            const nodeData = nodeDataMap.get(nodeId);
            const node = nodesList ? nodesList.find(n => n.id === nodeId) : null;
            if (!nodeData || !node) return null;
            return createNodeConfig(node, nodeData, nodesList, allContainerConnections);
        })
        .filter(Boolean);
    
    const factoryConfig = {
        factory: {
            id: container.id,
            machines,
            ...(standaloneNodes.length > 0 && { nodes: standaloneNodes })
        }
    };
    
    return yamlStringify(factoryConfig, { 
        indent: 2,
        lineWidth: 0,
        minContentWidth: 0
    });
}

async function copyNetworkHierarchy(container, nodeDataMap, nodesList = null, allContainerConnections = []) {
    // Get factories
    const factories = (container.factories || []).map(factory => {
        // Each factory has machines with nodes
        const machines = (factory.machines || []).map(machine => {
            // Use the new helper function for machines inside factories
            return createMachineConfigObject(machine, nodeDataMap, nodesList, allContainerConnections);
        });
        
        // Get standalone nodes in the factory (not in machines)
        const factoryStandaloneNodes = (factory.nodeIds || [])
            .filter(nodeId => {
                const isInMachine = factory.machines && factory.machines.some(machine => 
                    machine.nodes && machine.nodes.some(node => node.id === nodeId)
                );
                return !isInMachine;
            })
            .map(nodeId => {
                const nodeData = nodeDataMap.get(nodeId);
                const node = nodesList ? nodesList.find(n => n.id === nodeId) : null;
                if (!nodeData || !node) return null;
                return createNodeConfig(node, nodeData, nodesList, allContainerConnections);
            })
            .filter(Boolean);
        
        return { 
            id: factory.id, 
            machines,
            ...(factoryStandaloneNodes.length > 0 && { nodes: factoryStandaloneNodes })
        };
    });
    
    // Get standalone machines (not in factories)
    const standaloneMachines = (container.machines || [])
        .filter(machine => {
            const isInFactory = container.factories && container.factories.some(factory => 
                factory.machines && factory.machines.some(m => m.id === machine.id)
            );
            return !isInFactory;
        })
        .map(machine => {
            // Use the new helper function for standalone machines in the network
            return createMachineConfigObject(machine, nodeDataMap, nodesList, allContainerConnections);
        });
    
    // Get standalone nodes (not in machines or factories)
    const standaloneNodes = (container.nodeIds || [])
        .filter(nodeId => {
            const isInMachine = (container.machines || []).some(machine => 
                machine.nodes && machine.nodes.some(node => node.id === nodeId)
            );
            const isInFactory = (container.factories || []).some(factory =>
                factory.machines && factory.machines.some(machine =>
                    machine.nodes && machine.nodes.some(node => node.id === nodeId)
                )
            );
            return !isInMachine && !isInFactory;
        })
        .map(nodeId => {
            const nodeData = nodeDataMap.get(nodeId);
            const node = nodesList ? nodesList.find(n => n.id === nodeId) : null;
            if (!nodeData || !node) return null;
            return createNodeConfig(node, nodeData, nodesList, allContainerConnections);
        })
        .filter(Boolean);
    
    const networkConfig = {
        network: {
            id: container.id,
            ...(factories.length > 0 && { factories }),
            ...(standaloneMachines.length > 0 && { machines: standaloneMachines }),
            ...(standaloneNodes.length > 0 && { nodes: standaloneNodes })
        }
    };
    
    return yamlStringify(networkConfig, { 
        indent: 2,
        lineWidth: 0,
        minContentWidth: 0
    });
}

// Legacy wrapper for backwards compatibility
export async function copyNodeConfig(nodeData, connections = [], visualContent = null) {
    return copyConfig(nodeData, 'node', connections, null, null, visualContent);
}

// Legacy wrapper for backwards compatibility  
export async function copyMachineConfig(container, nodeDataMap, nodesList = null) {
    return copyConfig(container, 'machine', null, nodeDataMap, nodesList);
}
// Legacy wrapper for backwards compatibility  
export async function copyNetworkConfig(container, nodeDataMap, nodesList = null) {
    return copyConfig(container, 'network', null, nodeDataMap, nodesList);
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
 * Universal paste and create function using the new container system
 */
export async function pasteAndCreateConfigUniversal(targetX = null, targetY = null) {
    try {
        console.log('🔍 Starting universal paste operation with target:', { targetX, targetY });
        const pasteResult = await pasteConfig();
        console.log('📋 Paste result:', pasteResult);
        
        if (!pasteResult.success) {
            console.warn('❌ No valid config in clipboard');
            return { success: false, error: 'No valid config in clipboard' };
        }

        const config = pasteResult.data;
        
        // Import required functions
        const { get } = await import('svelte/store');
        const { workflowContainers } = await import('../stores/workflows.js');
        
        if (!config.parsedYaml) {
            return { success: false, error: 'No parsed YAML config found' };
        }

        // Calculate smart paste coordinates
        const target = {
            x: targetX !== null ? targetX : CoordinateCalculator.getCanvasCenter().x,
            y: targetY !== null ? targetY : CoordinateCalculator.getCanvasCenter().y
        };
        
        const { offsetX, offsetY } = CoordinateCalculator.calculatePasteCoordinates(
            config.parsedYaml, 
            target.x, 
            target.y
        );

        // Use the universal container system
        console.log('📋 RAW CONFIG FROM CLIPBOARD:', JSON.stringify(config.parsedYaml, null, 2));
        
        const universalContainer = UniversalContainer.fromConfig(config.parsedYaml, offsetX, offsetY);
        console.log('🏗️ Created universal container:', universalContainer.type, universalContainer.id);
        
        // Log the complete universal container structure
        console.log('🏗️ UNIVERSAL CONTAINER STRUCTURE:');
        console.log('   Type:', universalContainer.type);
        console.log('   ID:', universalContainer.id);
        console.log('   Children:', universalContainer.children.length);
        
        const logContainer = (container, depth = 0) => {
            const indent = '  '.repeat(depth + 1);
            console.log(`${indent}📦 ${container.type}: ${container.id}`);
            if (container.config) {
                if (container.config.context) console.log(`${indent}  context: ${container.config.context}`);
                if (container.config.outputs) console.log(`${indent}  outputs: [${container.config.outputs.join(', ')}]`);
                if (container.config.inputs) console.log(`${indent}  inputs: [${container.config.inputs.join(', ')}]`);
            }
            container.children.forEach(child => logContainer(child, depth + 1));
        };
        
        logContainer(universalContainer);

        // Create actual nodes using the universal system
        const { nodeActions, connectionActions } = await import('../stores/nodes.js');
        const createdNodes = [];
        const createdConnections = [];
        
        // Phase 1: Create all nodes and build ID mapping
        let actualIdMap = new Map(); // originalId -> actualNodeId
        
        // Calculate bounds of all nodes to center the structure
        const allNodes = universalContainer.flattenByType('node');
        const bounds = {
            minX: Math.min(...allNodes.map(n => n.coordinates.x)),
            maxX: Math.max(...allNodes.map(n => n.coordinates.x)),
            minY: Math.min(...allNodes.map(n => n.coordinates.y)),
            maxY: Math.max(...allNodes.map(n => n.coordinates.y))
        };
        const structureCenter = {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2
        };

        const createNodesRecursive = async (container) => {
            if (container.type === 'node') {
                // Calculate relative position from original structure center
                const relativeX = container.coordinates.x - structureCenter.x;
                const relativeY = container.coordinates.y - structureCenter.y;
                
                // Position relative to target center
                const finalX = target.x + relativeX;
                const finalY = target.y + relativeY;
                
                const node = nodeActions.add(
                    container.config.nodeType,
                    finalX,
                    finalY,
                    container.config.content || ''
                );
                createdNodes.push(node);
                actualIdMap.set(container.metadata.originalId, node.id);
                console.log(`✅ Created node: ${container.metadata.originalId} -> ${node.id}`);
            }
            
            for (const child of container.children) {
                await createNodesRecursive(child);
            }
        };
        
        await createNodesRecursive(universalContainer);
        
        // Phase 2: Create machine-level connections (node-to-node via outputs/inputs)
        console.log('🔧 PHASE 2: Creating machine-level connections...');
        const createMachineConnections = async (container) => {
            if (container.type === 'node') {
                const actualNodeId = actualIdMap.get(container.metadata.originalId);
                
                // Handle outputs (node-to-node connections within machines)
                if (container.config.outputs && Array.isArray(container.config.outputs)) {
                    for (const outputId of container.config.outputs) {
                        const targetNodeId = actualIdMap.get(outputId);
                        if (targetNodeId && actualNodeId) {
                            console.log(`🔗 Machine connection: ${container.metadata.originalId}(${actualNodeId}) -> ${outputId}(${targetNodeId})`);
                            connectionActions.add(actualNodeId, targetNodeId, 'output', 'input');
                            createdConnections.push({ fromId: actualNodeId, toId: targetNodeId });
                        }
                    }
                }
                
                // Handle inputs (node-to-node connections within machines)
                if (container.config.inputs && Array.isArray(container.config.inputs)) {
                    for (const inputId of container.config.inputs) {
                        const sourceNodeId = actualIdMap.get(inputId);
                        if (sourceNodeId && actualNodeId) {
                            console.log(`🔗 Machine connection: ${inputId}(${sourceNodeId}) -> ${container.metadata.originalId}(${actualNodeId})`);
                            connectionActions.add(sourceNodeId, actualNodeId, 'output', 'input');
                            createdConnections.push({ fromId: sourceNodeId, toId: actualNodeId });
                        }
                    }
                }
            }
            
            for (const child of container.children) {
                await createMachineConnections(child);
            }
        };
        
        await createMachineConnections(universalContainer);
        
        // Phase 3: Detect containers (machines)
        console.log('🔍 PHASE 3: Detecting containers after machine connections...');
        let currentContainers = [];
        let attempts = 0;
        const maxAttempts = 10;
        
        // Get all created node IDs
        const allCreatedNodeIds = new Set(actualIdMap.values());
        console.log('📝 All created node IDs:', Array.from(allCreatedNodeIds));
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            currentContainers = get(workflowContainers);
            console.log(`🔍 Container detection attempt ${attempts + 1}: Found ${currentContainers.length} containers`);
            
            // Log container details and ensure flags are set
            currentContainers.forEach((container, index) => {
                // Ensure machine containers have the isMachine flag
                if (container.id && container.id.startsWith('machine-') && !container.isFactory && !container.isNetwork) {
                    container.isMachine = true;
                }
                console.log(`   Container ${index}: ${container.id} (isMachine: ${container.isMachine}, isFactory: ${container.isFactory}, isNetwork: ${container.isNetwork})`);
                console.log(`     Nodes: [${container.nodes ? container.nodes.map(n => n.id).join(', ') : 'none'}]`);
            });
            
            // Check if any container has our nodes
            const containsOurNodes = currentContainers.some(container => 
                container.nodes && container.nodes.some(node => allCreatedNodeIds.has(node.id)) ||
                container.nodeIds && container.nodeIds.some(nodeId => allCreatedNodeIds.has(nodeId))
            );
            if (containsOurNodes) {
                console.log('✅ Found containers containing our nodes, proceeding with mapping');
                break;
            }
            
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            console.log('⚠️ Max container detection attempts reached, proceeding anyway...');
        }
        
        // Phase 4: Map container IDs
        let containerIdMap = new Map();
        
        const mapContainerIds = (universalCont) => {
            if (universalCont.type === 'machine' || universalCont.type === 'factory' || universalCont.type === 'network') {
                console.log(`🔍 Trying to map container: ${universalCont.metadata.originalId} (type: ${universalCont.type})`);
                
                // Find matching container by checking if it contains our nodes
                const expectedNodeIds = universalCont.flattenByType('node')
                    .map(nodeContainer => actualIdMap.get(nodeContainer.metadata.originalId))
                    .filter(Boolean);
                
                console.log(`📋 Expected node IDs for ${universalCont.metadata.originalId}:`, expectedNodeIds);
                
                const matchingContainer = currentContainers.find(container => {
                    console.log(`🔍 Checking container ${container.id} (isMachine: ${container.isMachine}, isFactory: ${container.isFactory}, isNetwork: ${container.isNetwork})`);
                    
                    if (universalCont.type === 'machine' && !container.isMachine) {
                        console.log(`❌ Type mismatch: expecting machine but found non-machine`);
                        return false;
                    }
                    if (universalCont.type === 'factory' && !container.isFactory) {
                        console.log(`❌ Type mismatch: expecting factory but found non-factory`);
                        return false;
                    }
                    if (universalCont.type === 'network' && !container.isNetwork) {
                        console.log(`❌ Type mismatch: expecting network but found non-network`);
                        return false;
                    }
                    
                    const containerNodeIds = container.nodes ? container.nodes.map(n => n.id) : 
                                             container.nodeIds ? container.nodeIds : [];
                    console.log(`📋 Container ${container.id} has nodes:`, containerNodeIds);
                    
                    const matches = expectedNodeIds.every(nodeId => containerNodeIds.includes(nodeId));
                    console.log(`✅ Node match result for ${container.id}:`, matches);
                    return matches;
                });
                
                if (matchingContainer) {
                    containerIdMap.set(universalCont.metadata.originalId, matchingContainer.id);
                    console.log(`🏗️ Mapped container: ${universalCont.metadata.originalId} -> ${matchingContainer.id}`);
                } else {
                    console.warn(`⚠️ No matching container found for ${universalCont.metadata.originalId}`);
                }
            }
            
            for (const child of universalCont.children) {
                mapContainerIds(child);
            }
        };
        
        mapContainerIds(universalContainer);
        
        // Phase 5: Create factory-level connections (machine context to nodes)  
        console.log('🏭 PHASE 5: Creating factory-level connections...');
        console.log('🗺️ Current ID mappings:');
        console.log('   Node IDs:', Array.from(actualIdMap.entries()));
        console.log('   Container IDs:', Array.from(containerIdMap.entries()));
        let allIdMap = new Map([...actualIdMap, ...containerIdMap]);
        
        const createFactoryConnections = async (container) => {
            if (container.type === 'node') {
                const actualNodeId = actualIdMap.get(container.metadata.originalId);
                
                // Handle context from machines (factory-level connections)
                if (container.config.context && container.config.context !== 'none') {
                    // Check if context refers to a machine
                    const contextContainer = universalContainer.findById(container.config.context);
                    if (contextContainer && contextContainer.type === 'machine') {
                        let sourceId = allIdMap.get(container.config.context);
                        
                        // Create a connection from machine to node for factory detection
                        if (sourceId && actualNodeId) {
                            console.log(` Factory context assignment: ${container.metadata.originalId}(${actualNodeId}) context = ${container.config.context}(${sourceId})`);
                            
                            // Create actual connection from machine to node
                            const { connectionActions } = await import('../stores/nodes.js');
                            
                            // Use connectionActions.add which properly creates connections with ports
                            connectionActions.add(sourceId, actualNodeId, 'output', 'input');
                            console.log(`✅ Created machine-to-node connection: ${sourceId} -> ${actualNodeId}`);
                            
                            // Get machine output with full context chain and transfer it
                            const { getMachineOutput } = await import('../stores/workflows.js');
                            const machineOutput = getMachineOutput(sourceId);
                            
                            if (machineOutput) {
                                // Use nodeActions.addInput which properly handles context chains
                                const { nodeActions } = await import('../stores/nodes.js');
                                console.log(`🔗 Adding machine output to node: context chain length: ${machineOutput.context_chain?.length || 0}`);
                                nodeActions.addInput(actualNodeId, sourceId, machineOutput.value, 1.0, machineOutput.context_chain, machineOutput.sources);
                            }
                        } else {
                            console.warn(` Failed to resolve machine context: ${container.config.context} -> ${sourceId}`);
                        }
                    }
                }
            }
            
            for (const child of container.children) {
                await createFactoryConnections(child);
            }
        };
        
        await createFactoryConnections(universalContainer);
        
        // Wait for factory detection and re-map containers if we have factories
        if (universalContainer.type === 'factory' || universalContainer.type === 'network') {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Re-detect and map factory containers
            const { get } = await import('svelte/store');
            const { workflowContainers } = await import('../stores/workflows.js');
            const updatedContainers = get(workflowContainers);
            const factoryContainers = updatedContainers.filter(c => c.isFactory);
            
            // Map any newly created factory containers
            for (const factoryContainer of factoryContainers) {
                if (!containerIdMap.has(factoryContainer.id)) {
                    // Find the matching factory in the universal container
                    const findFactoryById = (container, targetId) => {
                        if (container.type === 'factory' && container.metadata.originalId === targetId) {
                            return container;
                        }
                        for (const child of container.children) {
                            const found = findFactoryById(child, targetId);
                            if (found) return found;
                        }
                        return null;
                    };
                    
                    const matchingFactory = findFactoryById(universalContainer, factoryContainer.id);
                    if (matchingFactory) {
                        containerIdMap.set(matchingFactory.metadata.originalId, factoryContainer.id);
                        console.log(`🏭 Mapped newly detected factory: ${matchingFactory.metadata.originalId} -> ${factoryContainer.id}`);
                    }
                }
            }
            
            // Update the allIdMap with new container mappings
            allIdMap = new Map([...actualIdMap, ...containerIdMap]);
        }
        
        // Phase 5.5: Re-detect and map factory containers after factory connections
        console.log('🏭 PHASE 5.5: Re-detecting factory containers...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const factoryContainers = get(workflowContainers).filter(c => c.isFactory);
        console.log(`🏭 Found ${factoryContainers.length} factory containers`);
        
        // Map any newly detected factory containers
        const mapFactoryContainers = (universalCont) => {
            if (universalCont.type === 'factory') {
                const expectedMachineIds = universalCont.children
                    .filter(c => c.type === 'machine')
                    .map(c => containerIdMap.get(c.metadata.originalId))
                    .filter(Boolean);
                
                const matchingFactory = factoryContainers.find(factory => {
                    if (!factory.machines) return false;
                    return expectedMachineIds.every(machineId => 
                        factory.machines.some(m => m.id === machineId)
                    );
                });
                
                if (matchingFactory && !containerIdMap.has(universalCont.metadata.originalId)) {
                    containerIdMap.set(universalCont.metadata.originalId, matchingFactory.id);
                    console.log(`🏭 Mapped factory: ${universalCont.metadata.originalId} -> ${matchingFactory.id}`);
                }
            }
            
            for (const child of universalCont.children) {
                mapFactoryContainers(child);
            }
        };
        
        mapFactoryContainers(universalContainer);
        
        // Update allIdMap with factory mappings
        allIdMap = new Map([...actualIdMap, ...containerIdMap]);
        
        // Phase 6: Create network-level connections (factory context to nodes)
        const createNetworkConnections = async (container) => {
            if (container.type === 'node') {
                const actualNodeId = actualIdMap.get(container.metadata.originalId);
                
                // Handle context from factories (network-level connections)  
                if (container.config.context && container.config.context !== 'none') {
                    // Check if context refers to a factory
                    const contextContainer = universalContainer.findById(container.config.context);
                    if (contextContainer && contextContainer.type === 'factory') {
                        let sourceId = allIdMap.get(container.config.context);
                        
                        // Create connection from factory to node
                        if (sourceId && actualNodeId) {
                            console.log(`🔗 Network connection: ${container.config.context}(${sourceId}) -> ${container.metadata.originalId}(${actualNodeId})`);
                            
                            // Create actual connection from factory to node
                            const { connectionActions } = await import('../stores/nodes.js');
                            connectionActions.add(sourceId, actualNodeId, 'output', 'input');
                            console.log(`✅ Created factory-to-node connection: ${sourceId} -> ${actualNodeId}`);
                            
                            // Get factory output with full context chain and transfer it
                            const { workflowContainers, getFactoryOutput } = await import('../stores/workflows.js');
                            const { get } = await import('svelte/store');
                            const factoryContainer = get(workflowContainers).find(c => c.id === sourceId);
                            
                            if (factoryContainer) {
                                const factoryOutput = getFactoryOutput(factoryContainer);
                                if (factoryOutput) {
                                    // Use nodeActions.addInput which properly handles context chains
                                    const { nodeActions } = await import('../stores/nodes.js');
                                    console.log(`🔗 Adding factory output to node: context chain length: ${factoryOutput.context_chain?.length || 0}`);
                                    nodeActions.addInput(actualNodeId, sourceId, factoryOutput.value, 1.0, factoryOutput.context_chain, factoryOutput.sources);
                                }
                            }
                        } else {
                            console.warn(`⚠️ Failed to resolve factory context: ${container.config.context} -> ${sourceId}`);
                        }
                    }
                }
            }
            
            for (const child of container.children) {
                await createNetworkConnections(child);
            }
        };
        
        await createNetworkConnections(universalContainer);

        // Phase 7: Detect and map network containers if needed
        if (universalContainer.type === 'network') {
            console.log('🌐 PHASE 7: Detecting network container...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Network containers are automatically detected by the workflow system
            // Just find the created network container
            const allContainers = get(workflowContainers);
            const networkContainers = allContainers.filter(c => c.isNetwork);
            
            console.log(`🌐 Found ${networkContainers.length} network containers`);
            
            if (networkContainers.length > 0) {
                // Find the network that contains our factories
                const expectedFactoryIds = universalContainer.children
                    .filter(c => c.type === 'factory')
                    .map(c => containerIdMap.get(c.metadata.originalId))
                    .filter(Boolean);
                
                const matchingNetwork = networkContainers.find(network => {
                    if (!network.factories) return false;
                    return expectedFactoryIds.every(factoryId =>
                        network.factories.some(f => f.id === factoryId)
                    );
                });
                
                if (matchingNetwork) {
                    containerIdMap.set(universalContainer.metadata.originalId, matchingNetwork.id);
                    console.log(`🌐 Mapped network: ${universalContainer.metadata.originalId} -> ${matchingNetwork.id}`);
                }
            }
        }

        // Phase 8: Wait for final container detection
        console.log(`🏗️ All connections complete - waiting for ${universalContainer.type} detection`);
        
        if (universalContainer.type === 'factory' || universalContainer.type === 'network') {
            await new Promise(resolve => setTimeout(resolve, 500)); // Give time for reactive updates
            
            // Try to find the created factory/network container
            const finalContainers = await getCurrentContainers();
            console.log('🔍 Final containers after hierarchy creation:');
            finalContainers.forEach((container, index) => {
                console.log(`   Container ${index}: ${container.id} (isFactory: ${container.isFactory}, isNetwork: ${container.isNetwork})`);
                if (container.nodeIds) {
                    console.log(`     Nodes: [${container.nodeIds.join(', ')}]`);
                }
            });
            
            // Try to map the top-level container
            const topLevelContainer = finalContainers.find(c => 
                (universalContainer.type === 'factory' && c.isFactory) ||
                (universalContainer.type === 'network' && c.isNetwork)
            );
            
            if (topLevelContainer) {
                containerIdMap.set(universalContainer.metadata.originalId, topLevelContainer.id);
                console.log(`🏗️ Mapped ${universalContainer.type}: ${universalContainer.metadata.originalId} -> ${topLevelContainer.id}`);
            }
        }

        console.log('🎉 Universal paste completed:', {
            containerType: universalContainer.type,
            nodesCreated: createdNodes.length,
            connectionsCreated: createdConnections.length
        });

        return {
            success: true,
            createdNodes,
            createdConnections,
            configType: universalContainer.type,
            containerId: containerIdMap.get(universalContainer.metadata.originalId)
        };
    } catch (error) {
        console.error('Failed to paste using universal system:', error);
        return { success: false, error: error.message };
    }
}

// Legacy paste function removed - now using pasteAndCreateConfigUniversal

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
                if (data.type === 'node_config' || data.type === 'machine_config' || data.type === 'factory_config' || data.type === 'network_config') {
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