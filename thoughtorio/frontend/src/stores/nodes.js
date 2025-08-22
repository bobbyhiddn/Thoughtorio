import { writable } from 'svelte/store';
import { NodeData } from '../lib/NodeData.js';

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

// Helper functions for node operations
export const nodeActions = {
    add: (type, x, y, content = '') => {
        const id = crypto.randomUUID();
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
        // Remove visual node
        nodes.update(n => n.filter(node => node.id !== id));
        
        // Remove YAML backend data
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            newStore.delete(id);
            return newStore;
        });
        
        // Remove any connections to this node
        connections.update(c => c.filter(conn => 
            conn.fromId !== id && conn.toId !== id
        ));
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
                configData = NodeData.fromYAML(config);
            } else {
                configData = config;
            }

            // Update both stores
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