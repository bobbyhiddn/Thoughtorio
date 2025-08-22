/**
 * BasePlugin - Abstract base class for all Thoughtorio plugins
 * 
 * All node plugins must extend this class and implement the required methods.
 * This provides a consistent interface for the plugin system.
 */
export class BasePlugin {
    constructor(manifest) {
        if (this.constructor === BasePlugin) {
            throw new Error('BasePlugin is abstract and cannot be instantiated directly');
        }

        this.manifest = manifest;
        this.id = manifest.id;
        this.name = manifest.name;
        this.version = manifest.version;
        this.category = manifest.category || 'misc';
        this.description = manifest.description || '';
        this.author = manifest.author || 'Unknown';
    }

    // Plugin Metadata Methods

    /**
     * Get the plugin's unique identifier
     */
    getId() {
        return this.id;
    }

    /**
     * Get the plugin's display name
     */
    getName() {
        return this.name;
    }

    /**
     * Get the plugin's version
     */
    getVersion() {
        return this.version;
    }

    /**
     * Get the plugin's category for grouping in palette
     */
    getCategory() {
        return this.category;
    }

    /**
     * Get the plugin's description
     */
    getDescription() {
        return this.description;
    }

    /**
     * Get the plugin's author
     */
    getAuthor() {
        return this.author;
    }

    // Node Creation Methods

    /**
     * Create a new node instance
     * Must be implemented by concrete plugins
     * 
     * @param {Object} options - Initial node options
     * @returns {Object} Node data object
     */
    createNode(options = {}) {
        throw new Error('createNode() must be implemented by concrete plugin');
    }

    /**
     * Get the default node configuration
     * Must be implemented by concrete plugins
     * 
     * @returns {Object} Default node configuration
     */
    getDefaultConfig() {
        throw new Error('getDefaultConfig() must be implemented by concrete plugin');
    }

    /**
     * Validate node configuration
     * Can be overridden by concrete plugins for custom validation
     * 
     * @param {Object} config - Node configuration to validate
     * @returns {Object} Validation result { isValid: boolean, errors: string[] }
     */
    validateConfig(config) {
        return { isValid: true, errors: [] };
    }

    // Node Processing Methods

    /**
     * Process node inputs and generate output
     * Must be implemented by concrete plugins
     * 
     * @param {Object} nodeData - Current node data
     * @param {Array} inputs - Array of input data from connected nodes
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Processing result
     */
    async processNode(nodeData, inputs, context) {
        throw new Error('processNode() must be implemented by concrete plugin');
    }

    /**
     * Check if this node can accept input connections
     * Can be overridden by concrete plugins
     * 
     * @returns {boolean}
     */
    canReceiveInputs() {
        return true;
    }

    /**
     * Check if this node can create output connections
     * Can be overridden by concrete plugins
     * 
     * @returns {boolean}
     */
    canCreateOutputs() {
        return true;
    }

    /**
     * Get the maximum number of input connections allowed
     * Can be overridden by concrete plugins
     * 
     * @returns {number} -1 for unlimited
     */
    getMaxInputs() {
        return -1; // Unlimited by default
    }

    /**
     * Get the maximum number of output connections allowed
     * Can be overridden by concrete plugins
     * 
     * @returns {number} -1 for unlimited
     */
    getMaxOutputs() {
        return -1; // Unlimited by default
    }

    // UI Methods

    /**
     * Get the Svelte component for rendering this node type
     * Must be implemented by concrete plugins
     * 
     * @returns {SvelteComponent}
     */
    getComponent() {
        throw new Error('getComponent() must be implemented by concrete plugin');
    }

    /**
     * Get the icon for this plugin (used in palette)
     * Can be overridden by concrete plugins
     * 
     * @returns {string} Icon string (emoji or SVG)
     */
    getIcon() {
        return '🔧'; // Default icon
    }

    /**
     * Get the color scheme for this plugin
     * Can be overridden by concrete plugins
     * 
     * @returns {Object} Color scheme object
     */
    getColorScheme() {
        return {
            primary: '#6366f1',
            secondary: '#e0e7ff',
            text: '#1e1b4b'
        };
    }

    // Lifecycle Methods

    /**
     * Called when the plugin is registered
     * Can be overridden by concrete plugins for initialization
     */
    onRegister() {
        // Override in concrete plugins if needed
    }

    /**
     * Called when the plugin is unregistered
     * Can be overridden by concrete plugins for cleanup
     */
    onUnregister() {
        // Override in concrete plugins if needed
    }

    /**
     * Called when a node of this type is created
     * Can be overridden by concrete plugins
     * 
     * @param {Object} nodeData - The created node data
     */
    onNodeCreate(nodeData) {
        // Override in concrete plugins if needed
    }

    /**
     * Called when a node of this type is deleted
     * Can be overridden by concrete plugins
     * 
     * @param {Object} nodeData - The deleted node data
     */
    onNodeDelete(nodeData) {
        // Override in concrete plugins if needed
    }

    // Serialization Methods

    /**
     * Serialize node data for saving
     * Can be overridden by concrete plugins for custom serialization
     * 
     * @param {Object} nodeData - Node data to serialize
     * @returns {Object} Serialized data
     */
    serializeNode(nodeData) {
        return {
            pluginId: this.id,
            pluginVersion: this.version,
            ...nodeData
        };
    }

    /**
     * Deserialize node data for loading
     * Can be overridden by concrete plugins for custom deserialization
     * 
     * @param {Object} serializedData - Serialized node data
     * @returns {Object} Deserialized node data
     */
    deserializeNode(serializedData) {
        const { pluginId, pluginVersion, ...nodeData } = serializedData;
        return nodeData;
    }

    // Utility Methods

    /**
     * Generate a unique node ID
     * 
     * @returns {string} Unique ID
     */
    generateNodeId() {
        return `${this.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create a deep copy of an object
     * 
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
}