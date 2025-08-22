import { BasePlugin } from '../../core/base-plugin.js';
import TextInputComponent from './TextInput.svelte';
import config from './config.json';

/**
 * TextInputPlugin - A plugin for text input nodes with envelope/wrapper capabilities
 * 
 * This plugin creates nodes that can:
 * - Accept user text input
 * - Receive inputs from other nodes
 * - Envelope/wrap inputs with templates
 * - Process and transform data
 */
export class TextInputPlugin extends BasePlugin {
    constructor(manifest = config) {
        super(manifest);
    }

    // Node Creation Methods

    /**
     * Create a new text input node instance
     * 
     * @param {Object} options - Initial node options
     * @returns {Object} Node data object
     */
    createNode(options = {}) {
        const defaultConfig = this.getDefaultConfig();
        
        return {
            id: options.id || this.generateNodeId(),
            type: 'input',
            pluginId: this.id,
            pluginVersion: this.version,
            
            // Position and visual properties
            x: options.x || 100,
            y: options.y || 100,
            width: options.width || 200,
            height: options.height || 120,
            
            // Node content and configuration
            title: options.title || 'Text Input',
            content: options.content || '',
            
            // Plugin-specific configuration
            config: {
                ...defaultConfig,
                ...options.config
            },
            
            // Connection state
            inputs: [],
            outputs: [],
            
            // Processing state
            lastProcessed: null,
            processingError: null,
            
            // Metadata
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
    }

    /**
     * Get the default node configuration
     * 
     * @returns {Object} Default node configuration
     */
    getDefaultConfig() {
        return {
            envelopeStyle: 'prompt_wrapper',
            wrapperTemplate: 'Based on this context: {inputs}\\nNow: {content}',
            allowMultipleInputs: true,
            combineInputs: true,
            inputSeparator: '\\n',
            preserveInputOrder: true
        };
    }

    /**
     * Validate node configuration
     * 
     * @param {Object} config - Node configuration to validate
     * @returns {Object} Validation result { isValid: boolean, errors: string[] }
     */
    validateConfig(config) {
        const errors = [];

        // Check envelope style
        const validEnvelopeStyles = ['none', 'prompt_wrapper', 'context_wrapper', 'custom'];
        if (config.envelopeStyle && !validEnvelopeStyles.includes(config.envelopeStyle)) {
            errors.push(`Invalid envelope style: ${config.envelopeStyle}`);
        }

        // Check wrapper template (if using wrapper)
        if ((config.envelopeStyle === 'prompt_wrapper' || config.envelopeStyle === 'context_wrapper' || config.envelopeStyle === 'custom') 
            && (!config.wrapperTemplate || typeof config.wrapperTemplate !== 'string')) {
            errors.push('Wrapper template is required for envelope styles that use templates');
        }

        // Check input separator
        if (config.inputSeparator && typeof config.inputSeparator !== 'string') {
            errors.push('Input separator must be a string');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Node Processing Methods

    /**
     * Process node inputs and generate output
     * 
     * @param {Object} nodeData - Current node data
     * @param {Array} inputs - Array of input data from connected nodes
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Processing result
     */
    async processNode(nodeData, inputs, context) {
        try {
            const config = nodeData.config;
            let result = nodeData.content || '';

            // Process inputs if any exist
            if (inputs && inputs.length > 0) {
                result = this._processInputs(nodeData, inputs);
            }

            // Update node processing state
            nodeData.lastProcessed = new Date().toISOString();
            nodeData.processingError = null;

            return {
                success: true,
                output: result,
                metadata: {
                    inputCount: inputs.length,
                    processedAt: nodeData.lastProcessed,
                    envelopeStyle: config.envelopeStyle
                }
            };

        } catch (error) {
            // Update node error state
            nodeData.processingError = error.message;
            
            return {
                success: false,
                error: error.message,
                output: nodeData.content || '' // Fallback to original content
            };
        }
    }

    /**
     * Process inputs based on configuration
     * 
     * @private
     * @param {Object} nodeData - Node data
     * @param {Array} inputs - Input data array
     * @returns {string} Processed output
     */
    _processInputs(nodeData, inputs) {
        const config = nodeData.config;
        const content = nodeData.content || '';

        // Combine inputs if needed
        let inputText = '';
        if (config.combineInputs) {
            const separator = config.inputSeparator || '\\n';
            inputText = inputs.map(input => input.data || input.content || '').join(separator);
        } else {
            // Use first input only
            inputText = inputs[0]?.data || inputs[0]?.content || '';
        }

        // Apply envelope style
        switch (config.envelopeStyle) {
            case 'none':
                return content;
            
            case 'prompt_wrapper':
                return this._applyTemplate(config.wrapperTemplate, {
                    inputs: inputText,
                    content: content
                });
            
            case 'context_wrapper':
                return this._applyTemplate(config.wrapperTemplate, {
                    inputs: inputText,
                    content: content,
                    context: inputText
                });
            
            case 'custom':
                return this._applyTemplate(config.wrapperTemplate, {
                    inputs: inputText,
                    content: content,
                    nodeId: nodeData.id,
                    title: nodeData.title
                });
            
            default:
                return content;
        }
    }

    /**
     * Apply template with variable substitution
     * 
     * @private
     * @param {string} template - Template string
     * @param {Object} variables - Variables to substitute
     * @returns {string} Processed template
     */
    _applyTemplate(template, variables) {
        let result = template;
        
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), value);
        }
        
        return result;
    }

    // UI Methods

    /**
     * Get the Svelte component for rendering this node type
     * 
     * @returns {SvelteComponent}
     */
    getComponent() {
        return TextInputComponent;
    }

    /**
     * Get the icon for this plugin
     * 
     * @returns {string} Icon string
     */
    getIcon() {
        return this.manifest.icon || '✏️';
    }

    /**
     * Get the color scheme for this plugin
     * 
     * @returns {Object} Color scheme object
     */
    getColorScheme() {
        return this.manifest.color || {
            primary: '#3b82f6',
            secondary: '#dbeafe',
            text: '#1e3a8a'
        };
    }

    // Connection Methods

    /**
     * Check if this node can accept input connections
     * 
     * @returns {boolean}
     */
    canReceiveInputs() {
        return this.manifest.connections?.canReceiveInputs ?? true;
    }

    /**
     * Check if this node can create output connections
     * 
     * @returns {boolean}
     */
    canCreateOutputs() {
        return this.manifest.connections?.canCreateOutputs ?? true;
    }

    /**
     * Get the maximum number of input connections allowed
     * 
     * @returns {number} -1 for unlimited
     */
    getMaxInputs() {
        return this.manifest.connections?.maxInputs ?? -1;
    }

    /**
     * Get the maximum number of output connections allowed
     * 
     * @returns {number} -1 for unlimited
     */
    getMaxOutputs() {
        return this.manifest.connections?.maxOutputs ?? -1;
    }

    // Lifecycle Methods

    /**
     * Called when a node of this type is created
     * 
     * @param {Object} nodeData - The created node data
     */
    onNodeCreate(nodeData) {
        console.log(`Text input node created: ${nodeData.id}`);
        
        // Set default content if not provided
        if (!nodeData.content) {
            nodeData.content = 'Enter your text here...';
        }
    }

    /**
     * Called when a node of this type is deleted
     * 
     * @param {Object} nodeData - The deleted node data
     */
    onNodeDelete(nodeData) {
        console.log(`Text input node deleted: ${nodeData.id}`);
    }
}

// Export both the class and a factory function
export default TextInputPlugin;

// Create manifest export for easy access
export { config as manifest };