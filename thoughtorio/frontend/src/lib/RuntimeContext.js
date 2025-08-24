/**
 * @fileoverview RuntimeContext - Handles runtime state and context processing for workflows
 * Separates node configuration from runtime execution state
 */

import { ContextEngine } from './ContextEngine.js';
import { executionState } from '../stores/executionState.js';

/**
 * RuntimeContext manages the execution state and data flow for a workflow
 */
export class RuntimeContext {
    constructor(workflowId) {
        this.workflowId = workflowId;
        // Initialize workflow runtime in the execution state store
        executionState.createWorkflowRuntime(workflowId);
    }

    /**
     * Process a node's input based on its configuration and current runtime state
     */
    processNodeInput(nodeConfig, connections, allNodeConfigs) {
        const { id, node_type, content, processing } = nodeConfig.data;
        
        if (node_type === 'static') {
            // Static nodes just output their content
            const output = {
                type: 'structured_context',
                value: {
                    facts: [content],
                    history: [],
                    task: ''
                },
                sources: [id]
            };
            
            executionState.setNodeOutput(this.workflowId, id, output);
            return content;
        }
        
        if (node_type === 'input') {
            // Input nodes process their content and any connected inputs
            const inputData = this._gatherInputData(id, connections, allNodeConfigs);
            const processedInput = this._processInputNode(nodeConfig, inputData);
            
            // Store the processed input
            executionState.setNodeInputs(this.workflowId, id, inputData);
            executionState.setNodeOutput(this.workflowId, id, processedInput.output);
            
            return processedInput.processedText;
        }
        
        if (node_type === 'dynamic') {
            // Dynamic nodes need their inputs processed first
            const inputData = this._gatherInputData(id, connections, allNodeConfigs);
            const contextChain = this._buildContextChain(id, inputData);
            const structuredContext = ContextEngine.buildStructuredContext(contextChain);
            
            // Store the context data
            executionState.setNodeInputs(this.workflowId, id, inputData);
            executionState.setNodeContextChain(this.workflowId, id, contextChain);
            
            // Return the structured prompt for AI processing
            return this._buildAIPrompt(nodeConfig, structuredContext);
        }
        
        return content;
    }

    /**
     * Store the result of AI processing for a dynamic node
     */
    storeNodeResult(nodeId, result) {
        // Get the existing context chain
        const contextChain = executionState.getNodeContextChain(this.workflowId, nodeId) || [];
        
        // Add this node's contribution to the chain
        const contribution = {
            node_id: nodeId,
            type: 'dynamic',
            contribution: {
                type: 'history',
                content: {
                    role: 'assistant',
                    content: result
                }
            },
            processing: 'ai_completion',
            timestamp: new Date().toISOString()
        };
        
        const updatedChain = [...contextChain, contribution];
        
        // Build the final structured output
        const output = {
            type: 'structured_context',
            value: ContextEngine.buildStructuredContext(updatedChain),
            sources: this._collectSources(updatedChain),
            context_chain: updatedChain
        };
        
        // Store everything
        executionState.setNodeContextChain(this.workflowId, nodeId, updatedChain);
        executionState.setNodeOutput(this.workflowId, nodeId, output);
    }

    /**
     * Get the current output for a node (for connecting to other nodes)
     */
    getNodeOutput(nodeId) {
        return executionState.getNodeOutput(this.workflowId, nodeId);
    }

    /**
     * Clean up this workflow's runtime state
     */
    cleanup() {
        executionState.clearWorkflowRuntime(this.workflowId);
    }

    // Private helper methods
    _gatherInputData(nodeId, connections, allNodeConfigs) {
        const inputConnections = connections.filter(conn => conn.toId === nodeId);
        const inputData = [];
        
        for (const conn of inputConnections) {
            const sourceOutput = this.getNodeOutput(conn.fromId);
            if (sourceOutput) {
                inputData.push({
                    source_id: conn.fromId,
                    data: sourceOutput.value,
                    weight: 1.0,
                    received_at: new Date().toISOString(),
                    sources: sourceOutput.sources || [conn.fromId],
                    context_chain: sourceOutput.context_chain || []
                });
            }
        }
        
        return inputData;
    }

    _processInputNode(nodeConfig, inputData) {
        const { id, content, processing } = nodeConfig.data;
        const template = processing?.wrapper_template || '{inputs}\\n{content}';
        
        // Combine inputs with node content
        const inputTexts = inputData.map(input => {
            if (typeof input.data === 'object' && input.data.facts) {
                return input.data.facts.join(' ');
            }
            return String(input.data || '');
        });
        
        const processedText = template
            .replace('{inputs}', inputTexts.join('\\n'))
            .replace('{content}', content);
        
        // Build context chain and output
        const contextChain = this._buildContextChain(id, inputData, {
            type: 'fact',
            content: content
        });
        
        return {
            processedText,
            output: {
                type: 'structured_context',
                value: ContextEngine.buildStructuredContext(contextChain),
                sources: [id],
                context_chain: contextChain
            }
        };
    }

    _buildContextChain(nodeId, inputData, nodeContribution = null) {
        let chain = [];
        
        // Add all input context chains
        for (const input of inputData) {
            if (input.context_chain) {
                chain.push(...input.context_chain);
            }
        }
        
        // Add this node's contribution if provided
        if (nodeContribution) {
            chain.push({
                node_id: nodeId,
                type: 'input',
                contribution: nodeContribution,
                processing: 'unknown',
                timestamp: new Date().toISOString()
            });
        }
        
        return chain;
    }

    _buildAIPrompt(nodeConfig, structuredContext) {
        const { processing } = nodeConfig.data;
        const systemPrompt = processing?.system_prompt || '';
        
        // Build the context string
        let contextString = '';
        
        if (structuredContext.facts && structuredContext.facts.length > 0) {
            contextString += 'Context Facts:\\n' + structuredContext.facts.join('\\n') + '\\n\\n';
        }
        
        if (structuredContext.history && structuredContext.history.length > 0) {
            contextString += 'Conversation History:\\n';
            for (const msg of structuredContext.history) {
                contextString += `${msg.role}: ${msg.content}\\n`;
            }
            contextString += '\\n';
        }
        
        if (structuredContext.task) {
            contextString += `Task: ${structuredContext.task}\\n\\n`;
        }
        
        return contextString.trim() || 'Please provide a response.';
    }

    _collectSources(contextChain) {
        const sources = new Set();
        for (const item of contextChain) {
            sources.add(item.node_id);
        }
        return Array.from(sources);
    }
}