import { writable } from 'svelte/store';

// Nodes on the canvas
export const nodes = writable([]);

// Connections between nodes
export const connections = writable([]);

// Helper functions for node operations
export const nodeActions = {
    add: (type, x, y, content = '') => {
        const node = {
            id: crypto.randomUUID(),
            type,
            x,
            y,
            width: 200,
            height: 120,
            content,
            title: type === 'input' ? 'Input Node' : 
                   type === 'dynamic' ? 'AI Output' : 'Static Node',
            created: Date.now()
        };
        
        nodes.update(n => [...n, node]);
        return node;
    },
    
    update: (id, updates) => {
        console.log(`Updating node ${id} with:`, updates);
        nodes.update(n => n.map(node => 
            node.id === id ? { ...node, ...updates } : node
        ));
    },
    
    move: (id, x, y) => {
        nodes.update(n => n.map(node => 
            node.id === id ? { ...node, x, y } : node
        ));
    },
    
    delete: (id) => {
        nodes.update(n => n.filter(node => node.id !== id));
        // Also remove any connections to this node
        connections.update(c => c.filter(conn => 
            conn.fromId !== id && conn.toId !== id
        ));
    }
};

// Helper functions for connection operations
export const connectionActions = {
    add: (fromId, toId) => {
        const connection = {
            id: crypto.randomUUID(),
            fromId,
            toId,
            created: Date.now()
        };
        
        connections.update(c => [...c, connection]);
        return connection;
    },
    
    delete: (id) => {
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
    }
};