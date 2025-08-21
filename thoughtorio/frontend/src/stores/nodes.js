import { writable } from 'svelte/store';
import { NodeData } from '../lib/NodeData.js';

// Nodes on the canvas - now with YAML backend
export const nodes = writable([]);

// Node data store - maps node IDs to NodeData instances
export const nodeDataStore = writable(new Map());

// Connections between nodes
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
                    
                    // Propagate data change to connected nodes
                    setTimeout(() => {
                        connectionActions.propagateDataChange(id);
                    }, 0);
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
        nodeDataStore.subscribe(store => {
            nodeData = store.get(id);
        })();
        return nodeData;
    },

    // Export node as YAML
    exportNodeYAML: (id) => {
        const nodeData = nodeActions.getNodeData(id);
        return nodeData ? nodeData.toYAML() : null;
    },

    // Add input to a node (for data flow)
    addInput: (nodeId, sourceId, data) => {
        nodeDataStore.update(store => {
            const newStore = new Map(store);
            const nodeData = newStore.get(nodeId);
            if (nodeData) {
                try {
                    nodeData.addInput(sourceId, data);
                    newStore.set(nodeId, nodeData);
                    
                    // Update visual node content if it's not a dynamic node
                    if (nodeData.data.node_type !== 'dynamic') {
                        nodes.update(n => n.map(node => 
                            node.id === nodeId ? { ...node, content: nodeData.data.output.value } : node
                        ));
                    }
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
                
                // Update visual node content
                if (nodeData.data.node_type !== 'dynamic') {
                    nodes.update(n => n.map(node => 
                        node.id === nodeId ? { ...node, content: nodeData.data.output.value } : node
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
        // Validate connection based on node types
        const fromNodeData = nodeActions.getNodeData(fromId);
        const toNodeData = nodeActions.getNodeData(toId);
        
        if (toNodeData && toNodeData.data.node_type === 'static') {
            throw new Error('Static nodes cannot receive inputs');
        }

        const connection = {
            id: crypto.randomUUID(),
            fromId,
            toId,
            fromPort,
            toPort,
            created: Date.now()
        };

        connections.update(c => [...c, connection]);
        
        // Update YAML data flow
        if (fromNodeData && toNodeData) {
            const outputData = fromNodeData.data.output.value;
            nodeActions.addInput(toId, fromId, outputData);
        }
        
        return connection;
    },
    
    delete: (id) => {
        // Get connection details before deleting
        let connectionToDelete = null;
        connections.subscribe(c => {
            connectionToDelete = c.find(conn => conn.id === id);
        })();
        
        if (connectionToDelete) {
            // Remove from YAML data flow
            nodeActions.removeInput(connectionToDelete.toId, connectionToDelete.fromId);
        }
        
        connections.update(c => c.filter(conn => conn.id !== id));
    },
    
    getConnectionsFor: (nodeId) => {
        // This is a derived value, but putting it here for convenience
        let currentConnections = [];
        connections.subscribe(c => currentConnections = c)();
        
        return {
            incoming: currentConnections.filter(c => c.toId === nodeId),
            outgoing: currentConnections.filter(c => c.fromId === nodeId)
        };
    },

    // Propagate data changes through connections
    propagateDataChange: (sourceNodeId) => {
        const sourceNodeData = nodeActions.getNodeData(sourceNodeId);
        if (!sourceNodeData) return;

        const connections_data = connectionActions.getConnectionsFor(sourceNodeId);
        const outputData = sourceNodeData.data.output.value;

        // Update all connected nodes with new data
        connections_data.outgoing.forEach(conn => {
            nodeActions.addInput(conn.toId, sourceNodeId, outputData);
        });
    }
};