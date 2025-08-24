/**
 * @fileoverview NodeData - Simplified node configuration (no runtime state)
 * Nodes are now pure configuration/recipes - runtime state lives in workflow stores
 */

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

/**
 * Simplified NodeData class - configuration only, no runtime state
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
            // Configuration only - no runtime state stored here
            processing: {}
        };
    }

    // Static factory methods for different node types
    static createStatic(id, content, title) {
        const nodeData = new NodeData('static', id, content, title);
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
            system_prompt: 'You are a component in a workflow processing information. Take the provided contextual information and facts, and provide a direct, relevant response based on that context. Process and respond to what you are given - do not ask questions or request clarification.\n\nIMPORTANT: Respond with plain text only. Do NOT format your response as JSON, XML, or any structured format. Provide only the direct answer or content requested.',
            parameters: {
                temperature: 0.7,
                max_tokens: 1000
            }
        };
        return nodeData;
    }

    // Configuration getters/setters
    getContent() {
        return this.data.content;
    }

    setContent(content) {
        this.data.content = content;
        this.data.metadata.version += 1;
        return this;
    }

    getProcessingConfig() {
        return this.data.processing;
    }

    setProcessingConfig(config) {
        this.data.processing = { ...this.data.processing, ...config };
        this.data.metadata.version += 1;
        return this;
    }

    // For dynamic nodes - get the prompt template that will be filled at runtime
    getPromptTemplate() {
        if (this.data.node_type === 'input' && this.data.processing?.wrapper_template) {
            return this.data.processing.wrapper_template;
        }
        if (this.data.node_type === 'dynamic' && this.data.processing?.system_prompt) {
            return this.data.processing.system_prompt;
        }
        return this.data.content;
    }

    // Serialization
    toYAML() {
        return yamlStringify(this.data, { 
            indent: 2,
            lineWidth: -1,
            minContentWidth: 0
        });
    }

    toCleanYAML() {
        return yamlStringify(this.data, { 
            indent: 2,
            lineWidth: -1,
            minContentWidth: 0
        });
    }

    // Create from YAML
    static fromYAML(yamlString) {
        try {
            const data = yamlParse(yamlString);
            const nodeData = new NodeData(data.node_type, data.id, data.content, data.metadata?.title);
            
            // Restore the full configuration
            nodeData.data = { ...nodeData.data, ...data };
            
            return nodeData;
        } catch (error) {
            console.error('Error parsing node YAML:', error);
            throw new Error(`Failed to parse node YAML: ${error.message}`);
        }
    }

    // Clone this node (for copy/paste operations)
    clone(newId = null) {
        const clonedData = JSON.parse(JSON.stringify(this.data));
        if (newId) {
            clonedData.id = newId;
        }
        clonedData.metadata.created_at = new Date().toISOString();
        clonedData.metadata.version = 1;
        
        const cloned = new NodeData(clonedData.node_type, clonedData.id, clonedData.content, clonedData.metadata.title);
        cloned.data = clonedData;
        return cloned;
    }
}