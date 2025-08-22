/**
 * NodeData - Core node data management with YAML backend
 * Handles standardized node data structure, transformations, and serialization
 */

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

/**
 * @typedef {object} StructuredContext
 * @property {string[]} facts - A list of factual statements.
 * @property {Array<{role: 'user' | 'assistant', content: string}>} history - The conversation history.
 * @property {string} task - The specific task for an AI node.
 */

/**
 * @typedef {object} ContextContribution
 * @property {'fact' | 'task' | 'history'} type - The type of contribution.
 * @property {string | {role: 'assistant', content: string}} content - The content of the contribution.
 */

/**
 * @typedef {object} ContextChainItem
 * @property {string} node_id - The ID of the contributing node.
 * @property {string} type - The node type.
 * @property {ContextContribution} contribution - The structured contribution.
 * @property {string} processing - The processing type.
 * @property {string} timestamp - The ISO timestamp of the contribution.
 */

/**
 * @typedef {object} NodeOutput
 * @property {'text' | 'structured_context'} type - The type of the output.
 * @property {string | StructuredContext} value - The output value.
 * @property {string[]} sources - The IDs of the source nodes.
 * @property {ContextChainItem[]} [context_chain] - The historical ledger of contributions.
 */

export class NodeData {
    constructor(nodeType, id, content = '', title = '') {
        this.data = {
            node_type: nodeType,
            id: id,
            content: content,
            metadata: {
                title: title || `${nodeType}_${id}`,
                created_at: new Date().toISOString(),
                version: 1
            },
            inputs: [],
            processing: {},
            /** @type {NodeOutput} */
            output: {
                type: 'text',
                value: content,
                sources: [id]
            },
            execution: {
                state: 'idle',
                started_at: null,
                completed_at: null,
                error: null
            },
        };
    }

    // Static factory methods for different node types
    static createStatic(id, content, title) {
        const nodeData = new NodeData('static', id, content, title);
        // Static nodes have no input capability
        delete nodeData.data.inputs;
        return nodeData;
    }

    static createInput(id, content, title) {
        const nodeData = new NodeData('input', id, content, title);
        nodeData.data.purpose = 'fact'; // Default purpose, can be 'task'
        nodeData.data.processing = {
            envelope_style: 'prompt_wrapper',
            wrapper_template: '{inputs}\n{content}'
        };
        return nodeData;
    }

    static createDynamic(id, title) {
        const nodeData = new NodeData('dynamic', id, '', title);
        nodeData.data.processing = {
            type: 'ai_completion',
            model: '',
            system_prompt: 'You are a component in a workflow processing information. Take the provided contextual information and facts, and provide a direct, relevant response based on that context. Process and respond to what you are given - do not ask questions or request clarification.',
            parameters: {
                temperature: 0.7,
                max_tokens: 1000
            }
        };
        nodeData.data.output.context_chain = [];
        return nodeData;
    }

    // Core data manipulation methods
    updateContent(newContent) {
        this.data.content = newContent;
        this.data.metadata.version++;


        // THE FIX: Instead of just overwriting the output with the new content,
        // we call _updateOutput(). This function correctly recalculates the
        // final output value by combining any existing inputs with the new content.
        this._updateOutput();

        return this;
    }

    // Input management
    addInput(sourceId, data, weight = 1.0, sourceContextChain = null, sourceSources = null) {
        if (this.data.node_type === 'static') {
            throw new Error('Static nodes cannot receive inputs');
        }

        // Remove existing input from same source
        this.data.inputs = this.data.inputs.filter(input => input.source_id !== sourceId);
        
        // Add new input with context information
        const inputData = {
            source_id: sourceId,
            data: data,
            weight: weight,
            received_at: new Date().toISOString()
        };
        
        // Include context chain if provided
        if (sourceContextChain) {
            inputData.context_chain = sourceContextChain;
        }
        
        // Include source chain if provided
        if (sourceSources) {
            inputData.sources = sourceSources;
        }
        
        this.data.inputs.push(inputData);

        // Rebuild output based on inputs
        this._updateOutput();
        return this;
    }

    removeInput(sourceId) {
        this.data.inputs = this.data.inputs.filter(input => input.source_id !== sourceId);
        this._updateOutput();
        return this;
    }

    // REBUILT FROM SCRATCH: This consumes the chain to build the live payload.
    _updateOutput() {
        // 1. Build the authoritative historical chain.
        const contextChain = this._buildContextChain();

        // 2. Process the chain to create the structured payload.
        const structuredValue = { facts: [], history: [], task: '' };
        const seenFacts = new Set();

        contextChain.forEach(item => {
            const contrib = item.contribution;
            if (!contrib) return;

            switch (contrib.type) {
                case 'fact':
                    if (contrib.content && !seenFacts.has(contrib.content)) {
                        structuredValue.facts.push(contrib.content);
                        seenFacts.add(contrib.content);
                    }
                    break;
                case 'task':
                // The last task in the chain wins.
                if (typeof contrib.content === 'string') {
                    structuredValue.task = contrib.content;
                }
                break;
                case 'history':
                    structuredValue.history.push(contrib.content);
                    break;
            }
        });
        
        // 3. Set the final output values.
        this.data.output = {
            type: 'structured_context',
            value: structuredValue, // The live payload
            sources: this._collectSources(contextChain),
            context_chain: contextChain // The historical ledger
        };
    }

    // REBUILT FROM SCRATCH: This is now the source of truth for lineage.
    _buildContextChain() {
        const newChain = [];
        const seenNodeIds = new Set();

        // 1. Inherit the chain from all inputs recursively.
        // This builds the complete history of how we got here.
        this.data.inputs.forEach(input => {
            if (input.context_chain && Array.isArray(input.context_chain)) {
                input.context_chain.forEach(item => {
                    if (!seenNodeIds.has(item.node_id)) {
                        newChain.push(item);
                        seenNodeIds.add(item.node_id);
                    }
                });
            }
        });

        // 2. Add this node's own, new contribution to the chain.
        if (this.data.content || this.data.node_type === 'dynamic') {
            /** @type {ContextContribution | undefined} */
            let contribution;
            switch (this.data.node_type) {
                case 'input':
                case 'static':
                    contribution = {
                        type: this.data.purpose === 'task' ? 'task' : 'fact',
                        content: this.data.content
                    };
                    break;
                case 'dynamic':
                    // A dynamic node contributes its result to the conversation history.
                    contribution = {
                        type: 'history',
                        content: {
                            role: 'assistant',
                            content: this.data.execution.result_string || ''
                        }
                    };
                    break;
            }

            if (contribution && contribution.content && !seenNodeIds.has(this.data.id)) {
                 newChain.push({
                    node_id: this.data.id,
                    type: this.data.node_type,
                    contribution: contribution, // The contribution is now a structured object
                    processing: this.data.processing.type || 'unknown',
                    timestamp: new Date().toISOString()
                });
                seenNodeIds.add(this.data.id);
            }
        }

        return newChain;
    }

    // Execution state management
    setExecuting() {
        this.data.execution.state = 'executing';
        this.data.execution.started_at = new Date().toISOString();
        this.data.execution.completed_at = null;
        this.data.execution.error = null;
        return this;
    }

    setCompleted(result = null) {
        this.data.execution.state = 'completed';
        this.data.execution.completed_at = new Date().toISOString();
        
        if (result !== null && this.data.node_type === 'dynamic') {
            // Store the raw string result. _updateOutput will structure it.
            this.data.execution.result_string = result;
            this._updateOutput(); // Trigger a re-evaluation
        }
        
        return this;
    }

    setError(error) {
        this.data.execution.state = 'error';
        this.data.execution.completed_at = new Date().toISOString();
        this.data.execution.error = error.toString();
        return this;
    }

    // Serialization
    toYAML() {
        return yamlStringify(this.data, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
    }
    
    // Clean YAML without verbose history
    toCleanYAML() {
        const cleanData = {
            node_type: this.data.node_type,
            id: this.data.id,
            content: this.data.node_type === 'dynamic' ? (this.data.output.value || "") : (this.data.content || ""),
            metadata: {
                title: this.data.metadata.title,
                created_at: this.data.metadata.created_at,
                version: this.data.metadata.version
            },
            inputs: this.data.inputs,
            processing: this.data.processing,
            output: this.data.output,
            execution: this.data.execution
        };
        
        return yamlStringify(cleanData, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
    }
    
    // Elegant, concise config format
    toElegantConfig() {
        const config = {
            node: {
                id: this.data.id,
                type: this.data.node_type,
                content: this.data.node_type === 'dynamic' ? (this.data.execution.result_string || this.data.content || "") : (this.data.content || ""),
            }
        };
        
        if (this.data.inputs && this.data.inputs.length > 0) {
            if (this.data.inputs.length === 1) {
                config.node.context = this.data.inputs[0].source_id;
            } else {
                config.node.inputs = this.data.inputs.map(input => input.source_id);
            }
        } else {
            config.node.context = "none";
        }
        
        // Add outputs (we'll need to get this from connections)
        // This will be populated by the calling function
        
        return yamlStringify(config, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
    }

    static fromYAML(yamlString) {
        try {
            const data = yamlParse(yamlString);
            const nodeData = new NodeData(data.node_type, data.id);
            nodeData.data = { ...nodeData.data, ...data };
            return nodeData;
        } catch (error) {
            throw new Error(`Failed to parse node YAML: ${error.message}`);
        }
    }

    // The Prompt Assembler now has a cleaner input.
    getProcessedInput() {
        if (this.data.node_type !== 'dynamic' || !this.data.output.value || typeof this.data.output.value !== 'object') {
            return ''; // Should not happen for dynamic nodes with structured output
        }

        /** @type {StructuredContext} */
        const context = this.data.output.value;
        let promptParts = [];
        
        // 1. System Prompt (No change)
        if (this.data.processing.system_prompt) {
            promptParts.push(this.data.processing.system_prompt);
        }

        // 2. Add Contextual Facts
        if (context.facts && context.facts.length > 0) {
            promptParts.push("\n--- CONTEXTUAL INFORMATION ---");
            context.facts.forEach(fact => promptParts.push(`- ${fact}`));
        }

        // 3. Add Conversation History
        if (context.history && context.history.length > 0) {
            promptParts.push("\n--- CONVERSATION HISTORY ---");
            context.history.forEach(turn => {
                const role = turn.role === 'assistant' ? 'AI' : 'User';
                promptParts.push(`${role}: ${turn.content}`);
            });
        }

        // 4. Add the Specific Task
        if (context.task) {
            promptParts.push(`\n--- YOUR TASK ---`);
            promptParts.push(context.task);
        } else {
            promptParts.push(`\n--- YOUR TASK ---`);
            promptParts.push("Review the information provided and provide a comprehensive response or continue the conversation naturally.");
        }
        
        const finalPrompt = promptParts.join('\n');
        console.log("Assembled Prompt for AI:", finalPrompt);
        return finalPrompt;
    }

    // Validation
    validate() {
        const errors = [];

        // Basic required fields
        if (!this.data.node_type) errors.push('node_type is required');
        if (!this.data.id) errors.push('id is required');

        // Type-specific validation
        switch (this.data.node_type) {
            case 'static':
                if (this.data.inputs && this.data.inputs.length > 0) {
                    errors.push('Static nodes cannot have inputs');
                }
                break;
            
            case 'input':
                if (!this.data.processing.wrapper_template) {
                    errors.push('Input nodes must have a wrapper_template');
                }
                break;
            
            case 'dynamic':
                if (!this.data.processing.type) {
                    errors.push('Dynamic nodes must have a processing type');
                }
                break;
        }

        return errors;
    }

    _collectSources(contextChain) {
        const sources = new Set();
        contextChain.forEach(item => {
            sources.add(item.node_id);
            // Also add original sources if they exist from a previous chain
            if (item.sources && Array.isArray(item.sources)) {
                item.sources.forEach(s => sources.add(s));
            }
        });
        return Array.from(sources);
    }

    // Deep clone
    clone() {
        const cloned = new NodeData(this.data.node_type, this.data.id + '_copy');
        cloned.data = JSON.parse(JSON.stringify(this.data));
        cloned.data.id = this.data.id + '_copy';
        cloned.data.metadata.created_at = new Date().toISOString();
        return cloned;
    }
}

// Workflow-level data management
export class WorkflowData {
    constructor(id, name) {
        this.data = {
            workflow: {
                id: id,
                name: name,
                created_at: new Date().toISOString(),
                version: 1
            },
            nodes: [],
            connections: [],
            metadata: {
                total_nodes: 0,
                execution_order: [],
                dependencies: {}
            }
        };
    }

    addNode(nodeData) {
        this.data.nodes.push(nodeData.data);
        this.data.metadata.total_nodes = this.data.nodes.length;
        this._updateDependencies();
        return this;
    }

    addConnection(fromId, toId, fromPort = 'output', toPort = 'input') {
        this.data.connections.push({
            from: fromId,
            to: toId,
            port_from: fromPort,
            port_to: toPort
        });
        this._updateDependencies();
        return this;
    }

    _updateDependencies() {
        const deps = {};
        
        // Initialize all nodes with empty dependencies
        this.data.nodes.forEach(node => {
            deps[node.id] = [];
        });

        // Add dependencies based on connections
        this.data.connections.forEach(conn => {
            if (!deps[conn.to]) deps[conn.to] = [];
            deps[conn.to].push(conn.from);
        });

        this.data.metadata.dependencies = deps;
        this.data.metadata.execution_order = this._calculateExecutionOrder();
    }

    _calculateExecutionOrder() {
        const deps = this.data.metadata.dependencies;
        const visited = new Set();
        const visiting = new Set();
        const order = [];

        const visit = (nodeId) => {
            if (visiting.has(nodeId)) {
                throw new Error(`Circular dependency detected involving node ${nodeId}`);
            }
            if (visited.has(nodeId)) return;

            visiting.add(nodeId);
            
            // Visit dependencies first
            (deps[nodeId] || []).forEach(depId => visit(depId));
            
            visiting.delete(nodeId);
            visited.add(nodeId);
            order.push(nodeId);
        };

        Object.keys(deps).forEach(nodeId => visit(nodeId));
        return order;
    }

    toYAML() {
        return yamlStringify(this.data, { 
            indent: 2,
            lineWidth: 0,
            minContentWidth: 0
        });
    }

    static fromYAML(yamlString) {
        try {
            const data = yamlParse(yamlString);
            const workflow = new WorkflowData(data.workflow.id, data.workflow.name);
            workflow.data = data;
            return workflow;
        } catch (error) {
            throw new Error(`Failed to parse workflow YAML: ${error.message}`);
        }
    }
}