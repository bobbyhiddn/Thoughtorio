/**
 * Plugin System Test
 * 
 * This module provides testing utilities for the plugin system.
 * Run this in the browser console to test plugin functionality.
 */

import { initializePlugins, getPluginInfo, createNodeFromPlugin, getPlugin } from './init.js';

/**
 * Run all plugin system tests
 */
export async function runPluginTests() {
    console.log('🧪 Starting Thoughtorio Plugin System Tests...');
    
    try {
        // Test 1: Initialize plugin system
        console.log('\n📦 Test 1: Plugin System Initialization');
        const initResults = await initializePlugins();
        console.log('Init results:', initResults);
        
        if (initResults.successful === 0) {
            console.error('❌ No plugins were loaded successfully');
            return false;
        }
        
        console.log('✅ Plugin system initialized successfully');
        
        // Test 2: Get plugin information
        console.log('\n📋 Test 2: Plugin Information');
        const pluginInfo = getPluginInfo();
        console.log('Plugin info:', pluginInfo);
        
        if (pluginInfo.plugins.length === 0) {
            console.error('❌ No plugins found in registry');
            return false;
        }
        
        console.log('✅ Plugin information retrieved successfully');
        
        // Test 3: Get specific plugin
        console.log('\n🔍 Test 3: Plugin Retrieval');
        const textInputPlugin = getPlugin('text-input');
        
        if (!textInputPlugin) {
            console.error('❌ Text input plugin not found');
            return false;
        }
        
        console.log('Text input plugin:', {
            id: textInputPlugin.getId(),
            name: textInputPlugin.getName(),
            version: textInputPlugin.getVersion(),
            category: textInputPlugin.getCategory()
        });
        
        console.log('✅ Plugin retrieval successful');
        
        // Test 4: Node creation
        console.log('\n🏗️ Test 4: Node Creation');
        const testNode = createNodeFromPlugin('text-input', {
            title: 'Test Input Node',
            content: 'This is a test node created by the plugin system!',
            x: 100,
            y: 100
        });
        
        if (!testNode) {
            console.error('❌ Failed to create test node');
            return false;
        }
        
        console.log('Created test node:', testNode);
        console.log('✅ Node creation successful');
        
        // Test 5: Node processing
        console.log('\n⚙️ Test 5: Node Processing');
        const processingResult = await textInputPlugin.processNode(
            testNode,
            [
                { data: 'Input 1: Hello' },
                { data: 'Input 2: World' }
            ],
            { userId: 'test', timestamp: Date.now() }
        );
        
        console.log('Processing result:', processingResult);
        
        if (!processingResult.success) {
            console.error('❌ Node processing failed:', processingResult.error);
            return false;
        }
        
        console.log('✅ Node processing successful');
        
        // Test 6: Configuration validation
        console.log('\n✅ Test 6: Configuration Validation');
        const validConfig = {
            envelopeStyle: 'prompt_wrapper',
            wrapperTemplate: 'Context: {inputs}\\nTask: {content}',
            combineInputs: true
        };
        
        const invalidConfig = {
            envelopeStyle: 'invalid_style',
            wrapperTemplate: null
        };
        
        const validResult = textInputPlugin.validateConfig(validConfig);
        const invalidResult = textInputPlugin.validateConfig(invalidConfig);
        
        console.log('Valid config validation:', validResult);
        console.log('Invalid config validation:', invalidResult);
        
        if (validResult.isValid !== true || invalidResult.isValid !== false) {
            console.error('❌ Configuration validation failed');
            return false;
        }
        
        console.log('✅ Configuration validation successful');
        
        // Test 7: Plugin lifecycle methods
        console.log('\n🔄 Test 7: Plugin Lifecycle');
        try {
            // Test onNodeCreate
            textInputPlugin.onNodeCreate(testNode);
            console.log('✅ onNodeCreate executed without errors');
            
            // Test onNodeDelete
            textInputPlugin.onNodeDelete(testNode);
            console.log('✅ onNodeDelete executed without errors');
            
        } catch (error) {
            console.error('❌ Plugin lifecycle methods failed:', error);
            return false;
        }
        
        console.log('✅ Plugin lifecycle methods successful');
        
        // Final results
        console.log('\n🎉 All plugin system tests passed!');
        console.log('Plugin system is ready for use.');
        
        return true;
        
    } catch (error) {
        console.error('❌ Plugin system tests failed:', error);
        return false;
    }
}

/**
 * Quick test function for console use
 */
export async function quickTest() {
    return await runPluginTests();
}

/**
 * Test plugin performance
 */
export async function testPluginPerformance() {
    console.log('⚡ Testing plugin performance...');
    
    const plugin = getPlugin('text-input');
    if (!plugin) {
        console.error('Text input plugin not found');
        return;
    }
    
    const iterations = 1000;
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
        const node = createNodeFromPlugin('text-input', {
            title: `Test Node ${i}`,
            content: `Test content ${i}`,
            x: Math.random() * 1000,
            y: Math.random() * 1000
        });
        
        if (i % 2 === 0) {
            await plugin.processNode(node, [{ data: `Input ${i}` }], {});
        }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`Performance test results:
    - ${iterations} operations completed
    - Total time: ${totalTime.toFixed(2)}ms
    - Average time per operation: ${avgTime.toFixed(4)}ms
    - Operations per second: ${(1000 / avgTime).toFixed(0)}`);
}

// Export everything for global access in browser console
window.pluginTests = {
    runPluginTests,
    quickTest,
    testPluginPerformance
};

console.log('Plugin tests loaded. Run window.pluginTests.quickTest() in console to test.');