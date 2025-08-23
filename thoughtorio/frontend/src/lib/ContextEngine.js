/**
 * @fileoverview ContextEngine - Centralized context management system
 * Handles context chain building, merging, and propagation across workflow nodes
 */

/**
 * @typedef {import('./NodeData.js').StructuredContext} StructuredContext
 * @typedef {import('./NodeData.js').ContextChainItem} ContextChainItem
 * @typedef {import('./NodeData.js').ContextContribution} ContextContribution
 */

/**
 * ContextEngine - Manages context chains and merging operations
 */
export class ContextEngine {
    /**
     * Build a context chain for a node based on its inputs and own contribution
     * @param {Object} nodeData - The node data object
     * @param {Array} inputs - Array of input objects with context_chain
     * @returns {ContextChainItem[]} The built context chain
     */
    static buildContextChain(nodeData, inputs = []) {
        const newChain = [];
        const seenNodeIds = new Set();

        // 1. Inherit the chain from all inputs recursively
        inputs.forEach(input => {
            if (input.context_chain && Array.isArray(input.context_chain)) {
                input.context_chain.forEach(item => {
                    if (!seenNodeIds.has(item.node_id)) {
                        newChain.push(item);
                        seenNodeIds.add(item.node_id);
                    }
                });
            }
        });

        // 2. Add this node's own contribution to the chain
        if (nodeData.content || nodeData.node_type === 'dynamic') {
            const contribution = this._createContribution(nodeData);
            
            if (contribution && contribution.content && !seenNodeIds.has(nodeData.id)) {
                newChain.push({
                    node_id: nodeData.id,
                    type: nodeData.node_type,
                    contribution: contribution,
                    processing: nodeData.processing?.type || 'unknown',
                    timestamp: new Date().toISOString()
                });
                seenNodeIds.add(nodeData.id);
            }
        }

        return newChain;
    }

    /**
     * Create a contribution object based on node type and data
     * @param {Object} nodeData - The node data object
     * @returns {ContextContribution|undefined} The contribution object
     * @private
     */
    static _createContribution(nodeData) {
        switch (nodeData.node_type) {
            case 'input':
            case 'static':
                return {
                    type: nodeData.purpose === 'task' ? 'task' : 'fact',
                    content: nodeData.content
                };
            case 'dynamic':
                // A dynamic node contributes its result to the conversation history
                return {
                    type: 'history',
                    content: {
                        role: 'assistant',
                        content: nodeData.execution?.result_string || ''
                    }
                };
            default:
                return undefined;
        }
    }

    /**
     * Collect unique source IDs from a context chain
     * @param {ContextChainItem[]} contextChain - The context chain
     * @returns {string[]} Array of unique source IDs
     */
    static collectSources(contextChain) {
        const sources = new Set();
        contextChain.forEach(item => {
            if (item.node_id) {
                sources.add(item.node_id);
            }
        });
        return Array.from(sources);
    }

    /**
     * Build structured context value from context chain
     * @param {ContextChainItem[]} contextChain - The context chain
     * @returns {StructuredContext} The structured context object
     */
    static buildStructuredContext(contextChain) {
        const structuredValue = {
            facts: [],
            history: [],
            task: ''
        };

        contextChain.forEach(item => {
            if (!item.contribution) return;

            switch (item.contribution.type) {
                case 'fact':
                    if (typeof item.contribution.content === 'string') {
                        structuredValue.facts.push(item.contribution.content);
                    }
                    break;
                case 'task':
                    if (typeof item.contribution.content === 'string') {
                        structuredValue.task = item.contribution.content;
                    }
                    break;
                case 'history':
                    if (typeof item.contribution.content === 'object' && 
                        item.contribution.content.role && 
                        item.contribution.content.content) {
                        structuredValue.history.push(item.contribution.content);
                    }
                    break;
            }
        });

        return structuredValue;
    }

    /**
     * Merge outputs from multiple nodes into a single structured payload
     * @param {Array} outputNodes - Array of output node objects
     * @param {Function} getNodeData - Function to get node data by ID
     * @returns {Object} Merged output object
     */
    static mergeWorkflowOutputs(outputNodes, getNodeData) {
        const mergedOutput = {
            type: 'structured_context',
            value: { facts: [], history: [], task: '' },
            sources: new Set(),
            context_chain: []
        };
        const seenContextItems = new Set();
        const seenFacts = new Set();

        outputNodes.forEach(node => {
            const nodeData = getNodeData(node.id);
            if (!nodeData || !nodeData.data.output || typeof nodeData.data.output.value !== 'object') return;

            const { value, sources, context_chain } = nodeData.data.output;

            // Merge facts, avoiding duplicates
            if (value.facts) {
                value.facts.forEach(fact => {
                    if (!seenFacts.has(fact)) {
                        mergedOutput.value.facts.push(fact);
                        seenFacts.add(fact);
                    }
                });
            }

            // Merge history
            if (value.history) {
                mergedOutput.value.history.push(...value.history);
            }

            // The last task from any output node wins
            if (value.task) {
                mergedOutput.value.task = value.task;
            }

            // Merge sources
            if (sources) {
                sources.forEach(sourceId => mergedOutput.sources.add(sourceId));
            }

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
        finalOutput.value.history.sort((a, b) => {
            const timestampA = finalOutput.context_chain.find(item => item.contribution.content === a)?.timestamp;
            const timestampB = finalOutput.context_chain.find(item => item.contribution.content === b)?.timestamp;
            if (timestampA && timestampB && !isNaN(new Date(timestampA).getTime()) && !isNaN(new Date(timestampB).getTime())) {
                return new Date(timestampA).getTime() - new Date(timestampB).getTime();
            }
            return 0;
        });

        return finalOutput;
    }

    /**
     * Add input to a node with proper context chain handling
     * @param {Object} nodeData - The target node data
     * @param {string} sourceId - Source node ID
     * @param {any} value - Input value
     * @param {number} weight - Input weight
     * @param {ContextChainItem[]} contextChain - Source context chain
     * @param {string[]} sources - Source IDs
     */
    static addInput(nodeData, sourceId, value, weight = 1.0, contextChain = [], sources = []) {
        const inputData = {
            source_id: sourceId,
            data: value,
            weight: weight,
            received_at: new Date().toISOString()
        };
        
        // Include context chain if provided
        if (contextChain) {
            inputData.context_chain = contextChain;
        }
        
        // Include source chain if provided
        if (sources) {
            inputData.sources = sources;
        }
        
        nodeData.inputs.push(inputData);
    }

    /**
     * Validate context chain structure
     * @param {ContextChainItem[]} contextChain - The context chain to validate
     * @returns {boolean} True if valid
     */
    static validateContextChain(contextChain) {
        if (!Array.isArray(contextChain)) return false;
        
        return contextChain.every(item => 
            item.node_id && 
            item.type && 
            item.contribution &&
            item.timestamp
        );
    }

    /**
     * Get context statistics for debugging
     * @param {ContextChainItem[]} contextChain - The context chain
     * @returns {Object} Statistics object
     */
    static getContextStats(contextChain) {
        const stats = {
            totalItems: contextChain.length,
            facts: 0,
            history: 0,
            tasks: 0,
            uniqueNodes: 0,
            nodeTypes: {}
        };
        const uniqueNodeSet = new Set();

        contextChain.forEach(item => {
            uniqueNodeSet.add(item.node_id);
            
            if (item.type) {
                stats.nodeTypes[item.type] = (stats.nodeTypes[item.type] || 0) + 1;
            }
            
            if (item.contribution) {
                switch (item.contribution.type) {
                    case 'fact':
                        stats.facts++;
                        break;
                    case 'history':
                        stats.history++;
                        break;
                    case 'task':
                        stats.tasks++;
                        break;
                }
            }
        });

        stats.uniqueNodes = uniqueNodeSet.size;
        return stats;
    }
}