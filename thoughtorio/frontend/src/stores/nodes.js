import { writable, get } from 'svelte/store';
import { NodeData } from '../lib/NodeData.js';
import { parse as yamlParse } from 'yaml';

/**
 * @typedef {object} Connection
 * @property {string} id
 * @property {string} fromId
 * @property {string} toId
 * @property {any} fromPort
 * @property {any} toPort
 * @property {number} created
 */

// Nodes on the canvas - now with YAML backend
export const nodes = writable([]);

// Node data store - maps node IDs to NodeData instances
export const nodeDataStore = writable(new Map());

// Connections between nodes
/** @type {import('svelte/store').Writable<Connection[]>} */
export const connections = writable([]);

// Helper function to get next node number
function getNextNodeNumber(nodeList) {
    const nodeNumbers = nodeList
        .filter(n => n.id && n.id.startsWith('node-'))
        .map(n => parseInt(n.id.split('-')[1]))
        .filter(n => !isNaN(n));
    return nodeNumbers.length > 0 ? Math.max(...nodeNumbers) + 1 : 1;
}

// Helper functions for node operations
export const nodeActions = {
    add: (type, x, y, content = '') => {
        const currentNodes = get(nodes);
        const nodeNumber = getNextNodeNumber(currentNodes);
        const id = `node-${nodeNumber}`;
        const title = type === 'input' ? 'Input Node' : 
                     type === 'dynamic' ? 'AI Output' : 'Static Node';

        // Create visual node for canvas
        const node = {
            id,
            type,
            x,
            y,
            width: 250,
            height: 120,
            content,
            title,
            created: Date.now()
        };

        // Create YAML backend data
        let nodeData;
        switch (type) {
            case 'static':
                nodeData = NodeData.createStatic(id, content, title);
                break;
            case 'input':
                nodeData = NodeData.createInput(id, content, title);
                break;
            case 'dynamic':
                nodeData = NodeData.createDynamic(id, title);
                break;
            default:
                throw new Error(`Unknown node type: ${type}`);
        }

        // Update stores
        nodes.update(n => [...n, node]);
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            newStore.set(id, nodeData);
            return newStore;
        });

        return node;
    },
    
    update: (id, updates) => {
        console.log(`Updating node ${id} with:`, updates);
        
        // Update visual node
        nodes.update(n => n.map(node => 
            node.id === id ? { ...node, ...updates } : node
        ));

        // Update YAML backend data if content changed
        if (updates.content !== undefined) {
            nodeDataStore.update(store => {
                const newStore = new Map(store);
                const nodeData = newStore.get(id);
                if (nodeData) {
                    nodeData.updateContent(updates.content);
                    newStore.set(id, nodeData);
                }
                return newStore;
            });
        }
    },
    
    move: (id, x, y) => {
        nodes.update(n => n.map(node => 
            node.id === id ? { ...node, x, y } : node
        ));
    },
    
    delete: (id) => {
        console.log('🗑️ Deleting node:', id);
        
        // Remove visual node
        nodes.update(n => n.filter(node => node.id !== id));
        
        // Remove YAML backend data
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            newStore.delete(id);
            return newStore;
        });
        
        // Remove any connections to/from this node (including container connections)
        connections.update(c => {
            const filteredConnections = c.filter(conn => {
                // Remove direct node connections
                if (conn.fromId === id || conn.toId === id) {
                    console.log('🔗 Removing direct connection:', conn.id);
                    return false;
                }
                
                // Remove container-to-node connections where this node is the target
                if (conn.toId === id && (conn.fromId.startsWith('machine-') || 
                                        conn.fromId.startsWith('factory-') || 
                                        conn.fromId.startsWith('network-'))) {
                    console.log('🔗 Removing container connection:', conn.id, 'from', conn.fromId, 'to', id);
                    return false;
                }
                
                // Remove node-to-container connections where this node is the source
                if (conn.fromId === id && (conn.toId.startsWith('machine-') || 
                                          conn.toId.startsWith('factory-') || 
                                          conn.toId.startsWith('network-'))) {
                    console.log('🔗 Removing node-to-container connection:', conn.id, 'from', id, 'to', conn.toId);
                    return false;
                }
                
                return true;
            });
            
            console.log(`🔗 Connection cleanup: ${c.length} -> ${filteredConnections.length}`);
            return filteredConnections;
        });
        
        console.log('✅ Node deletion completed:', id);
    },

    // Get YAML backend data for a node
    getNodeData: (id) => {
        let nodeData = null;
        const unsubscribe = nodeDataStore.subscribe(store => {
            nodeData = store.get(id);
        });
        unsubscribe();
        return nodeData;
    },

    // Export node as YAML
    exportNodeYAML: (id) => {
        const nodeData = nodeActions.getNodeData(id);
        return nodeData ? nodeData.toYAML() : null;
    },

    // Add input to a node (for data flow)
    addInput: (nodeId, sourceId, data, weight = 1.0, contextChain = null, sources = null) => {
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            const nodeData = newStore.get(nodeId);
            if (nodeData) {
                try {
                    nodeData.addInput(sourceId, data, weight, contextChain, sources);
                    newStore.set(nodeId, nodeData);
                    
                    // Input nodes should not change their visible content, only static nodes should
                    if (nodeData.data.node_type === 'static') {
                        nodes.update(n => n.map(node => 
                            node.id === nodeId ? { ...node, content: nodeData.data.output.value } : node
                        ));
                    }
                    
                    // Propagation is now handled recursively from the initial trigger,
                    // so we don't need to re-trigger it here.
                } catch (error) {
                    console.error(`Error adding input to node ${nodeId}:`, error.message);
                }
            }
            return newStore;
        });
    },

    // Remove input from a node
    removeInput: (nodeId, sourceId) => {
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            const nodeData = newStore.get(nodeId);
            if (nodeData) {
                nodeData.removeInput(sourceId);
                newStore.set(nodeId, nodeData);
                
                // Update visual node content - but only for input/static nodes and only with their original content
                if (nodeData.data.node_type === 'input' || nodeData.data.node_type === 'static') {
                    // For input nodes, preserve their original content, don't replace with processed output
                    const displayContent = nodeData.data.node_type === 'input' 
                        ? nodeData.data.content 
                        : (typeof nodeData.data.output.value === 'string' 
                            ? nodeData.data.output.value 
                            : nodeData.data.content);
                    
                    nodes.update(n => n.map(node => 
                        node.id === nodeId ? { ...node, content: displayContent } : node
                    ));
                }
            }
            return newStore;
        });
    },

    // Set node execution state
    setNodeExecuting: (id) => {
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            const nodeData = newStore.get(id);
            if (nodeData) {
                nodeData.setExecuting();
                newStore.set(id, nodeData);
            }
            return newStore;
        });
    },

    setNodeCompleted: (id, result = null) => {
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            const nodeData = newStore.get(id);
            if (nodeData) {
                nodeData.setCompleted(result);
                newStore.set(id, nodeData);
                
                // Update visual node content for dynamic nodes
                if (nodeData.data.node_type === 'dynamic' && result) {
                    nodes.update(n => n.map(node => 
                        node.id === id ? { ...node, content: result } : node
                    ));
                }
            }
            return newStore;
        });
    },

    setNodeError: (id, error) => {
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            const nodeData = newStore.get(id);
            if (nodeData) {
                nodeData.setError(error);
                newStore.set(id, nodeData);
            }
            return newStore;
        });
    },

    // Apply config from clipboard to a node
    applyNodeConfig: (id, config) => {
        try {
            // Parse the YAML config if it's a string
            let configData;
            if (typeof config === 'string') {
                // Try to detect concise "node:" YAML and apply minimally
                try {
                    const parsed = yamlParse(config);
                    if (parsed && parsed.node) {
                        // Patch existing NodeData instead of full overwrite
                        nodeDataStore.update(store => {
                            const newStore = new Map(store);
                            let existing = newStore.get(id);
                            if (!existing) {
                                existing = new NodeData(parsed.node.type || 'static', id);
                            }
                            // Update node type if provided
                            if (parsed.node.type) {
                                existing.data.node_type = parsed.node.type;
                            }
                            // Update content using class method to trigger recompute/auto-exec
                            if (parsed.node.content !== undefined) {
                                existing.updateContent(parsed.node.content || '');
                            }
                            // Preserve existing title/metadata; allow optional title from config
                            if (parsed.node.title) {
                                existing.data.metadata.title = parsed.node.title;
                            }
                            // Ensure ID consistency
                            existing.data.id = id;
                            newStore.set(id, existing);
                            return newStore;
                        });

                        // Update visual node based on patched data
                        const current = get(nodeDataStore).get(id);
                        nodes.update(n => n.map(node => 
                            node.id === id ? { 
                                ...node, 
                                content: current?.data.content,
                                title: current?.data.metadata.title,
                                type: current?.data.node_type
                            } : node
                        ));

                        return { success: true };
                    }
                } catch (e) {
                    // Fall through to full YAML parsing below
                }

                // Fallback: assume full NodeData YAML
                configData = NodeData.fromYAML(config);
            } else {
                configData = config;
            }

            // Update both stores (full overwrite path)
            nodeDataStore.update(store => {
                const newStore = new Map(store);
                // Keep the same ID but apply the config
                configData.data.id = id;
                newStore.set(id, configData);
                return newStore;
            });

            // Update visual node
            nodes.update(n => n.map(node => 
                node.id === id ? { 
                    ...node, 
                    content: configData.data.content,
                    title: configData.data.metadata.title,
                    type: configData.data.node_type
                } : node
            ));

            return { success: true };
        } catch (error) {
            console.error('Failed to apply node config:', error);
            return { success: false, error: error.message };
        }
    }
};

// Add this to nodes.js
function initializeNodeState(nodeId, nodeType, content) {
    const nodeData = get(nodeDataStore).get(nodeId);
    if (!nodeData) return;
    
    // Initialize proper state based on node type
    switch (nodeType) {
        case 'input':
        case 'static':
            nodeData.data.output = {
                type: 'structured_context',
                value: {
                    facts: content ? [content] : [],
                    history: [],
                    task: ""
                },
                sources: [nodeId],
                context_chain: [{
                    node_id: nodeId,
                    type: nodeType,
                    contribution: {
                        type: 'fact',
                        content: content || ""
                    },
                    processing: 'unknown',
                    timestamp: new Date().toISOString()
                }]
            };
            nodeData.data.execution = {
                state: 'completed',
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                error: null
            };
            break;
            
        case 'dynamic':
            // Dynamic nodes start with empty state - they get populated during execution
            nodeData.data.output = {
                type: 'structured_context',
                value: { facts: [], history: [], task: "" },
                sources: [],
                context_chain: []
            };
            nodeData.data.execution = {
                state: 'idle',
                started_at: null,
                completed_at: null,
                error: null
            };
            break;
    }
    
    console.log(`✅ Initialized ${nodeType} node ${nodeId} with proper state`);
}

// Export this so clipboard.js can use it
export { initializeNodeState };

// Helper functions for connection operations
export const connectionActions = {
    add: (fromId, toId, fromPort, toPort) => {
        // This function now ONLY creates the connection structure.
        // It does NOT trigger data flow.
        const connection = {
            id: crypto.randomUUID(),
            fromId,
            toId,
            fromPort,
            toPort,
            created: Date.now()
        };
        connections.update(c => [...c, connection]);
        
        // Check if auto-execute is enabled and trigger workflow execution (only once)
        import('svelte/store').then(({ get }) => {
            import('./settings.js').then(({ settings }) => {
                const settingsValue = get(settings);
                if (settingsValue.autoExecuteWorkflows) {
                    // Small delay to ensure workflow containers are updated
                    setTimeout(() => {
                        // Check if the source node has been modified recently (within last 5 seconds)
                        const sourceNodeData = get(nodeDataStore).get(fromId);
                        if (!sourceNodeData) return;
                        
                        const lastModified = new Date(sourceNodeData.data.metadata.created_at).getTime();
                        const now = Date.now();
                        const timeSinceModified = now - lastModified;
                        const version = sourceNodeData.data.metadata.version;
                        
                        const isModified = sourceNodeData.data.metadata.modified || false;
                        
                        console.log(`Auto-execute check - Node ${fromId}: version=${version}, modified=${isModified}, timeSinceModified=${timeSinceModified}ms`);
                        
                        // Only auto-execute if the source node has been modified
                        if (isModified) {
                            // Find workflows that contain either the from or to node
                            import('./workflows.js').then(({ workflowContainers, workflowActions }) => {
                                const containers = get(workflowContainers);
                                containers.forEach(container => {
                                    if (container.nodes && container.nodes.some(node => 
                                        node.id === fromId || node.id === toId
                                    )) {
                                        console.log('Auto-executing workflow due to new connection with modified input:', container.id);
                                        workflowActions.execute(container.id);
                                    }
                                });
                            });
                        } else {
                            console.log('Skipping auto-execute: source node has not been modified');
                        }
                    }, 100);
                }
            });
        });
        
        return connection;
    },
    
    delete: (id) => {
        /** @type {Connection | undefined} */
        let connectionToDelete;
        const unsubscribe = connections.subscribe(c => {
            connectionToDelete = c.find(conn => conn.id === id);
        });
        unsubscribe();
        
        if (connectionToDelete) {
            // When a connection is deleted, the downstream node must have its input removed.
            nodeActions.removeInput(connectionToDelete.toId, connectionToDelete.fromId);
        }
        
        connections.update(c => c.filter(conn => conn.id !== id));
    }
};