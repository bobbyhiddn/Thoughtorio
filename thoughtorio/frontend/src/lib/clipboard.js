// @ts-nocheck
/**
 * Clipboard utilities for copy/paste operations with node configs and text
 */

import { stringify as yamlStringify, parse as yamlParse } from 'yaml';

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
export async function copyNodeConfig(nodeData, visualContent = null) {
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
 * Copy elegant machine configuration (concise format)
 */
export async function copyElegantMachineConfig(container, nodeDataMap) {
    if (!container || !nodeDataMap) {
        return { success: false, error: 'No container or node data provided' };
    }
    
    try {
        let allNodes = [];
        
        if (container.isFactory) {
            // Factory: collect nodes from all contained machines
            if (container.machines) {
                container.machines.forEach(machine => {
                    if (machine.nodes) {
                        allNodes.push(...machine.nodes);
                    }
                });
            }
        } else {
            // Regular machine: use container.nodes
            allNodes = container.nodes || [];
        }
        
        // Create elegant node configs
        const elegantNodes = allNodes.map(node => {
            const nodeData = nodeDataMap.get(node.id);
            if (!nodeData) return null;
            
            const elegantNode = {
                id: node.id,
                type: nodeData.data.node_type,
                content: nodeData.data.content || ""
            };
            
            // Add context/inputs
            if (nodeData.data.inputs && nodeData.data.inputs.length > 0) {
                if (nodeData.data.inputs.length === 1) {
                    elegantNode.context = nodeData.data.inputs[0].source_id;
                } else {
                    elegantNode.inputs = nodeData.data.inputs.map(input => input.source_id);
                }
            } else {
                elegantNode.context = "none";
            }
            
            // Add outputs from connections
            const connections = container.connections || [];
            const outgoingConnections = connections.filter(conn => conn.fromId === node.id);
            if (outgoingConnections.length > 0) {
                elegantNode.outputs = outgoingConnections.map(conn => conn.toId);
            }
            
            return elegantNode;
        }).filter(Boolean);
        
        // Create elegant machine/factory config
        const elegantConfig = {
            [container.isFactory ? 'factory' : 'machine']: {
                id: container.id,
                nodes: elegantNodes
            }
        };
        
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
 * Copy workflow machine configuration (elegant format)
 */
export async function copyMachineConfig(container, nodeDataMap) {
    return copyElegantMachineConfig(container, nodeDataMap);
}

/**
 * Copy elegant network configuration (concise format)
 */
export async function copyElegantNetworkConfig(container, nodeDataMap) {
    if (!container || !nodeDataMap) {
        return { success: false, error: 'No container or node data provided' };
    }

    try {
        const elegantFactories = (container.factories || []).map(factory => {
            const elegantMachines = (factory.machines || []).map(machine => {
                const elegantNodes = (machine.nodes || []).map(node => {
                    const nodeData = nodeDataMap.get(node.id);
                    if (!nodeData) return null;
                    return {
                        id: node.id,
                        type: nodeData.data.node_type,
                        content: nodeData.data.content || "",
                        context: (nodeData.data.inputs && nodeData.data.inputs[0]) ? nodeData.data.inputs[0].source_id : "none",
                    };
                }).filter(Boolean);
                return { id: machine.id, nodes: elegantNodes };
            });
            return { id: factory.id, machines: elegantMachines };
        });

        const elegantConfig = {
            network: {
                id: container.id,
                factories: elegantFactories
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
        const allFactories = container.factories || [];
        const factoryConfigs = allFactories.map(factory => {
            return {
                id: factory.id,
                machineCount: (factory.machines || []).length,
                nodeCount: (factory.nodeIds || []).length
            };
        });

        const config = {
            type: 'network_metadata',
            version: '1.0',
            network: { id: container.id, factoryCount: allFactories.length },
            factories: factoryConfigs,
            connections: container.connections || []
        };
        
        const configYaml = yamlStringify(config, { indent: 2, lineWidth: 0 });
        const result = await copyText(configYaml);

        return { success: true, method: result.method, config, configYaml };
    } catch (error) {
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
                    
                    // Check if it's a node config (standalone node YAML)
                    if (yamlData && yamlData.node_type && yamlData.id) {
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