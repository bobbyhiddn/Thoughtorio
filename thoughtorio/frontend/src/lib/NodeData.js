/**
 * NodeData - Core node data management with YAML backend
 * Handles standardized node data structure, transformations, and serialization
 */

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

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
            history: [{
                version: 1,
                content: content,
                timestamp: new Date().toISOString()
            }]
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
            system_prompt: 'You are a component in a workflow. The user is building a machine or factory. Interpret prompts in this context. The term \'machine\' refers to the workflow you are part of.',
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

        // Add to history
        this.data.history.push({
            version: this.data.metadata.version,
            content: newContent,
            timestamp: new Date().toISOString()
        });

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

    // Output generation based on node type
    _updateOutput() {
        switch (this.data.node_type) {
            case 'static':
                // Static nodes output their content as-is
                this.data.output = {
                    type: 'text',
                    value: this.data.content,
                    sources: [this.data.id]
                };
                break;

            case 'input':
                // Input nodes envelope their inputs with their content
                const inputsText = this.data.inputs.map(input => input.data).join('\n');
                const template = this.data.processing.wrapper_template || '{inputs}\n{content}';
                
                // Build sources from inputs
                const inputSources = new Set([this.data.id]);
                this.data.inputs.forEach(input => {
                    if (input.sources) {
                        input.sources.forEach(source => inputSources.add(source));
                    } else {
                        inputSources.add(input.source_id);
                    }
                });
                
                this.data.output = {
                    type: 'text',
                    value: template
                        .replace('{inputs}', inputsText)
                        .replace('{content}', this.data.content),
                    sources: Array.from(inputSources),
                    context_chain: this._buildContextChain()
                };
                break;

            case 'dynamic':
                // AI nodes maintain their processed content and context chain
                const allSources = new Set([this.data.id]);
                this.data.inputs.forEach(input => {
                    if (input.sources) {
                        input.sources.forEach(source => allSources.add(source));
                    } else {
                        allSources.add(input.source_id);
                    }
                });

                this.data.output = {
                    type: 'text',
                    value: this.data.output.value || this.data.content,
                    sources: Array.from(allSources),
                    context_chain: this._buildContextChain()
                };
                break;
        }
    }

    _buildContextChain() {
        const newChain = [];
        const seenNodeIds = new Set();

        // Collect all unique context items from inputs' chains
        this.data.inputs.forEach(input => {
            if (input.context_chain && Array.isArray(input.context_chain) && input.context_chain.length > 0) {
                input.context_chain.forEach(item => {
                    if (!seenNodeIds.has(item.node_id)) {
                        newChain.push(item);
                        seenNodeIds.add(item.node_id);
                    }
                });
            } else {
                // If an input has no context chain, it's a root contributor.
                // Add its own data as a contribution.
                if (!seenNodeIds.has(input.source_id)) {
                    newChain.push({
                        node_id: input.source_id,
                        type: 'input', // Assume 'input' or another base type
                        contribution: input.data,
                        processing: 'unknown',
                        timestamp: input.received_at
                    });
                    seenNodeIds.add(input.source_id);
                }
            }
        });

        // Add the current node's own content as its contribution to the chain
        if (this.data.content && !seenNodeIds.has(this.data.id)) {
            let contribution = this.data.content;

            // For AI nodes, summarize the contribution to keep the chain clean
            if (this.data.node_type === 'dynamic') {
                const lines = contribution.split('\n').filter(line => line.trim());
                const firstLine = lines[0] || '';
                contribution = firstLine.length > 75 ? firstLine.substring(0, 72) + '...' : firstLine;
            }

            newChain.push({
                node_id: this.data.id,
                type: this.data.node_type,
                contribution: contribution,
                processing: this.data.processing.type || 'unknown',
                timestamp: new Date().toISOString()
            });
            seenNodeIds.add(this.data.id);
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
            this.data.output.value = result;
            // After updating the output value, we need to rebuild the context chain
            // and sources to include this node's new contribution.
            this._updateOutput();
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
            execution: this.data.execution,
            // Only show last 3 history entries
            history: this.data.history.slice(-3)
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
                content: this.data.node_type === 'dynamic' ? (this.data.output.value || "") : (this.data.content || ""),
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

    // Get processed input for AI nodes
    getProcessedInput() {
        if (this.data.inputs.length === 0) {
            return this.data.content;
        }

        switch (this.data.node_type) {
            case 'input':
                return this.data.content;
            
            case 'dynamic':
                // The complete context for the AI is already prepared and stored in the `data`
                // field of its inputs by upstream nodes. We just need to combine them.
                const fullInputText = this.data.inputs
                    .map(input => input.data)
                    .filter(Boolean) // Filter out any empty/null inputs
                    .join('\n\n');   // Join multiple inputs with a double newline

                // The node's own content is now the instruction/prompt for the AI.
                const instruction = this.data.content;

                // Combine instruction and the full context from inputs.
                let combinedInput = fullInputText;
                if (instruction && instruction.trim()) {
                    // If there's an instruction, prepend it to the context.
                    combinedInput = `${instruction}\n\n${fullInputText}`.trim();
                }

                if (!combinedInput) {
                    return ''; // Return empty if there's no actual input text or instruction
                }

                // Prepend system prompt if it exists
                let prompt = combinedInput;
                if (this.data.processing.system_prompt) {
                    prompt = `${this.data.processing.system_prompt}\n\n---\n\n${combinedInput}`;
                }

                return prompt;
            
            default:
                return this.data.content;
        }
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