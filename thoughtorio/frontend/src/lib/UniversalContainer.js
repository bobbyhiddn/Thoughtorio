/**
 * Universal Container System for Thoughtorio
 * Treats all entities (nodes, machines, factories, networks) as containers
 * This enables universal copy/paste and connection logic
 */

export class UniversalContainer {
    constructor(type, id, config = {}) {
        this.type = type; // 'node', 'machine', 'factory', 'network'
        this.id = id;
        this.children = []; // For node: empty, for machine: nodes, for factory: machines, etc.
        this.config = config; // Type-specific configuration
        this.coordinates = { x: 0, y: 0 };
        this.connections = { inputs: [], outputs: [] };
        this.metadata = {
            created_at: new Date().toISOString(),
            originalId: id // Preserve original ID for context mapping
        };
    }

    // Universal factory method - creates appropriate container type
    static fromConfig(config, offsetX = 0, offsetY = 0) {
        if (config.node || config.node_type) {
            return UniversalContainer.createNode(config.node || config, offsetX, offsetY);
        } else if (config.machine) {
            return UniversalContainer.createMachine(config.machine, offsetX, offsetY);
        } else if (config.factory) {
            return UniversalContainer.createFactory(config.factory, offsetX, offsetY);
        } else if (config.network) {
            return UniversalContainer.createNetwork(config.network, offsetX, offsetY);
        }
        throw new Error('Unknown config type');
    }

    static createNode(nodeConfig, offsetX = 0, offsetY = 0) {
        const container = new UniversalContainer('node', nodeConfig.id, {
            nodeType: nodeConfig.type,
            content: nodeConfig.content || '',
            context: nodeConfig.context,
            inputs: nodeConfig.inputs,
            outputs: nodeConfig.outputs
        });
        
        // Set coordinates with fallback
        container.coordinates.x = (nodeConfig.x || 0) + offsetX;
        container.coordinates.y = (nodeConfig.y || 0) + offsetY;
        
        return container;
    }

    static createMachine(machineConfig, offsetX = 0, offsetY = 0) {
        const container = new UniversalContainer('machine', machineConfig.id);
        
        // Create child node containers
        for (const nodeConfig of machineConfig.nodes || []) {
            const nodeContainer = UniversalContainer.createNode(nodeConfig, offsetX, offsetY);
            container.children.push(nodeContainer);
        }
        
        return container;
    }

    static createFactory(factoryConfig, offsetX = 0, offsetY = 0) {
        const container = new UniversalContainer('factory', factoryConfig.id);
        
        // Create child machine containers
        for (const machineConfig of factoryConfig.machines || []) {
            const machineContainer = UniversalContainer.createMachine(machineConfig, offsetX, offsetY);
            container.children.push(machineContainer);
        }
        
        // Create standalone node containers
        for (const nodeConfig of factoryConfig.nodes || []) {
            const nodeContainer = UniversalContainer.createNode(nodeConfig, offsetX, offsetY);
            container.children.push(nodeContainer);
        }
        
        return container;
    }

    static createNetwork(networkConfig, offsetX = 0, offsetY = 0) {
        const container = new UniversalContainer('network', networkConfig.id);
        
        // Create child factory containers
        for (const factoryConfig of networkConfig.factories || []) {
            const factoryContainer = UniversalContainer.createFactory(factoryConfig, offsetX, offsetY);
            container.children.push(factoryContainer);
        }
        
        // Create child machine containers
        for (const machineConfig of networkConfig.machines || []) {
            const machineContainer = UniversalContainer.createMachine(machineConfig, offsetX, offsetY);
            container.children.push(machineContainer);
        }
        
        // Create standalone node containers
        for (const nodeConfig of networkConfig.nodes || []) {
            const nodeContainer = UniversalContainer.createNode(nodeConfig, offsetX, offsetY);
            container.children.push(nodeContainer);
        }
        
        return container;
    }

    // Universal flattener - gets all containers at specified depth
    flattenByType(targetType) {
        const results = [];
        
        if (this.type === targetType) {
            results.push(this);
        }
        
        for (const child of this.children) {
            results.push(...child.flattenByType(targetType));
        }
        
        return results;
    }

    // Universal finder - finds container by original ID
    findById(targetId) {
        if (this.id === targetId || this.metadata.originalId === targetId) {
            return this;
        }
        
        for (const child of this.children) {
            const found = child.findById(targetId);
            if (found) return found;
        }
        
        return null;
    }

    // Universal connection resolver - maps old IDs to new containers
    buildConnectionMap() {
        const map = new Map();
        
        const addToMap = (container) => {
            map.set(container.metadata.originalId, container);
            for (const child of container.children) {
                addToMap(child);
            }
        };
        
        addToMap(this);
        return map;
    }

    // Get the first node in this container (for connections)
    getFirstNode() {
        if (this.type === 'node') {
            return this;
        }
        
        for (const child of this.children) {
            const node = child.getFirstNode();
            if (node) return node;
        }
        
        return null;
    }

    // Get the last node in this container (for outputs)
    getLastNode() {
        if (this.type === 'node') {
            return this;
        }
        
        // Traverse in reverse to get the last node
        for (let i = this.children.length - 1; i >= 0; i--) {
            const node = this.children[i].getLastNode();
            if (node) return node;
        }
        
        return null;
    }

    // Get the first machine in this container
    getFirstMachine() {
        if (this.type === 'machine') {
            return this;
        }
        
        for (const child of this.children) {
            if (child.type === 'machine') {
                return child;
            }
            const machine = child.getFirstMachine();
            if (machine) return machine;
        }
        
        return null;
    }

    // Get the last machine in this container
    getLastMachine() {
        if (this.type === 'machine') {
            return this;
        }
        
        // Traverse in reverse to get the last machine
        for (let i = this.children.length - 1; i >= 0; i--) {
            if (this.children[i].type === 'machine') {
                return this.children[i];
            }
            const machine = this.children[i].getLastMachine();
            if (machine) return machine;
        }
        
        return null;
    }

    // Get the first factory in this container
    getFirstFactory() {
        if (this.type === 'factory') {
            return this;
        }
        
        for (const child of this.children) {
            if (child.type === 'factory') {
                return child;
            }
            const factory = child.getFirstFactory();
            if (factory) return factory;
        }
        
        return null;
    }

    // Get the output connector of this container
    getOutputConnector() {
        if (this.type === 'node') {
            return this.id; // Node connects directly
        } else if (this.type === 'machine') {
            // Machine outputs from last node
            const lastNode = this.getLastNode();
            return lastNode ? lastNode.id : this.id;
        } else if (this.type === 'factory') {
            // Factory outputs from last machine's last node
            const lastMachine = this.getLastMachine();
            return lastMachine ? lastMachine.getOutputConnector() : this.id;
        } else if (this.type === 'network') {
            // Networks have no output (highest level)
            return null;
        }
        return this.id;
    }

    // Get the input connector of this container
    getInputConnector() {
        if (this.type === 'node') {
            return this.id; // Node connects directly
        } else if (this.type === 'machine') {
            // Machine inputs to first node
            const firstNode = this.getFirstNode();
            return firstNode ? firstNode.id : this.id;
        } else if (this.type === 'factory') {
            // Factory inputs to first machine's first node
            const firstMachine = this.getFirstMachine();
            return firstMachine ? firstMachine.getInputConnector() : this.id;
        } else if (this.type === 'network') {
            // Network inputs to first factory's first machine's first node
            const firstFactory = this.getFirstFactory();
            return firstFactory ? firstFactory.getInputConnector() : this.id;
        }
        return this.id;
    }

    // Universal to YAML config
    toConfig() {
        const config = {};
        
        if (this.type === 'node') {
            config.node = {
                id: this.metadata.originalId,
                type: this.config.nodeType,
                content: this.config.content,
                x: this.coordinates.x,
                y: this.coordinates.y
            };
            
            if (this.config.context && this.config.context !== 'none') {
                config.node.context = this.config.context;
            } else if (this.config.inputs) {
                config.node.inputs = this.config.inputs;
            } else {
                config.node.context = 'none';
            }
            
            if (this.config.outputs) {
                config.node.outputs = this.config.outputs;
            }
        } else {
            const containerData = {
                id: this.metadata.originalId
            };
            
            if (this.children.length > 0) {
                const childrenByType = {};
                
                for (const child of this.children) {
                    const childConfig = child.toConfig();
                    const childType = child.type === 'node' ? 'nodes' : child.type + 's';
                    
                    if (!childrenByType[childType]) {
                        childrenByType[childType] = [];
                    }
                    
                    const configValue = childConfig.node || childConfig.machine || childConfig.factory || childConfig.network;
                    childrenByType[childType].push(configValue);
                }
                
                Object.assign(containerData, childrenByType);
            }
            
            config[this.type] = containerData;
        }
        
        return config;
    }
}

// Universal connection engine
export class UniversalConnector {
    static async connectContainers(fromContainer, toContainer, connectionActions) {
        const fromId = fromContainer.getOutputConnector();
        const toId = toContainer.getInputConnector();
        
        if (fromId && toId && fromId !== toId) {
            console.log(`🔗 Universal connection: ${fromContainer.type}(${fromId}) -> ${toContainer.type}(${toId})`);
            connectionActions.add(fromId, toId, 'output', 'input');
            return true;
        }
        
        return false;
    }

    // Process all connections in a container using universal logic
    static async processConnections(container, connectionActions) {
        const connectionMap = container.buildConnectionMap();
        const processedConnections = new Set();
        
        // Recursive function to process connections at all levels
        const processLevel = (currentContainer) => {
            for (const child of currentContainer.children) {
                // Process child's internal connections first
                processLevel(child);
                
                // Process connections FROM this child
                const childConfig = child.config;
                
                // Handle single context
                if (childConfig.context && childConfig.context !== 'none') {
                    const sourceContainer = connectionMap.get(childConfig.context);
                    if (sourceContainer) {
                        const connectionKey = `${sourceContainer.id}->${child.id}`;
                        if (!processedConnections.has(connectionKey)) {
                            UniversalConnector.connectContainers(sourceContainer, child, connectionActions);
                            processedConnections.add(connectionKey);
                        }
                    }
                }
                
                // Handle multiple inputs
                if (childConfig.inputs && Array.isArray(childConfig.inputs)) {
                    for (const inputId of childConfig.inputs) {
                        const sourceContainer = connectionMap.get(inputId);
                        if (sourceContainer) {
                            const connectionKey = `${sourceContainer.id}->${child.id}`;
                            if (!processedConnections.has(connectionKey)) {
                                UniversalConnector.connectContainers(sourceContainer, child, connectionActions);
                                processedConnections.add(connectionKey);
                            }
                        }
                    }
                }
                
                // Handle outputs
                if (childConfig.outputs && Array.isArray(childConfig.outputs)) {
                    for (const outputId of childConfig.outputs) {
                        const targetContainer = connectionMap.get(outputId);
                        if (targetContainer) {
                            const connectionKey = `${child.id}->${targetContainer.id}`;
                            if (!processedConnections.has(connectionKey)) {
                                UniversalConnector.connectContainers(child, targetContainer, connectionActions);
                                processedConnections.add(connectionKey);
                            }
                        }
                    }
                }
            }
        };
        
        processLevel(container);
    }
}