<script>
    import { viewport, canvasState, viewportActions } from '../stores/canvas.js';
    import { nodes, connections, nodeActions, connectionActions } from '../stores/nodes.js';
    import { workflowContainers } from '../stores/workflows.js';
    import Node from './Node.svelte';
    import ConnectionLine from './ConnectionLine.svelte';
    import NodePalette from './NodePalette.svelte';
    import WorkflowContainer from './WorkflowContainer.svelte';
    import SettingsPanel from './SettingsPanel.svelte';
    import ConfigPanel from './ConfigPanel.svelte';
    import CanvasContextMenu from './CanvasContextMenu.svelte';
    
    let canvasElement;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let lastPanPoint = { x: 0, y: 0 };
    let isConnecting = false;
    let tempConnection = null;
    let mousePosition = { x: 0, y: 0 };
    let isBoxSelecting = false;
    let boxSelectionStart = { x: 0, y: 0 };
    let lastBoxSelectionTime = 0;
    let hasMovedDuringDrag = false;
    let suppressNextDoubleClick = false;
    
    // Global flag to immediately block node interactions
    let blockNodeInteractions = false;
    
    // Settings panel state
    let showSettings = false;
    
    // Config panel state
    let showConfigPanel = false;
    
    // Global context menu state
    let showCanvasContextMenu = false;
    let canvasContextMenuX = 0;
    let canvasContextMenuY = 0;
    let canvasContextMenuItems = [];
    
    // File management state
    let showRecents = false;
    let recentCanvases = [];
    let currentCanvasPath = null;
    let currentCanvasName = null;
    
    // Convert screen coordinates to canvas coordinates
    function screenToCanvas(screenX, screenY) {
        const rect = canvasElement.getBoundingClientRect();
        const x = (screenX - rect.left - $viewport.x) / $viewport.zoom;
        const y = (screenY - rect.top - $viewport.y) / $viewport.zoom;
        return { x, y };
    }
    
    // Global context menu function
    function showGlobalContextMenu(x, y, items) {
        canvasContextMenuX = x;
        canvasContextMenuY = y;
        canvasContextMenuItems = items;
        showCanvasContextMenu = true;
    }
    
    // Make context menu function available globally
    if (typeof window !== 'undefined') {
        window.showCanvasContextMenu = showGlobalContextMenu;
    }
    
    // Handle global context menu actions
    async function handleGlobalContextMenuAction(event) {
        const action = event.detail;
        if (action.handler && typeof action.handler === 'function') {
            await action.handler();
        }
    }
    
    // Handle mouse wheel for zooming and trackpad pan
    function handleWheel(event) {
        event.preventDefault();
        
        // Check if this is a trackpad (has deltaX) vs mouse wheel (only deltaY)
        const isTrackpad = Math.abs(event.deltaX) > 0;
        
        if (isTrackpad) {
            // Two-finger trackpad gestures
            const isVertical = Math.abs(event.deltaY) > Math.abs(event.deltaX);
            
            if (isVertical && Math.abs(event.deltaY) > 2) {
                // Two-finger up/down = pan vertically
                viewportActions.pan(0, -event.deltaY);
            } else if (!isVertical && Math.abs(event.deltaX) > 2) {
                // Two-finger left/right = pan horizontally
                viewportActions.pan(-event.deltaX, 0);
            } else if (Math.abs(event.deltaX) > 0 && Math.abs(event.deltaY) > 0) {
                // Both directions = pan both ways
                viewportActions.pan(-event.deltaX, -event.deltaY);
            }
        } else {
            // Regular mouse wheel zoom from viewport center
            const rect = canvasElement.getBoundingClientRect();
            const viewportCenterX = rect.width / 2;
            const viewportCenterY = rect.height / 2;
            
            const zoomFactor = event.deltaY > 0 ? 0.95 : 1.05;
            viewportActions.zoom(zoomFactor, viewportCenterX, viewportCenterY);
        }
    }
    
    // Handle mouse down for panning or box selection
    function handleMouseDown(event) {
        if (event.button === 1 || (event.button === 0 && event.shiftKey) || event.button === 2) {
            // Middle mouse, Shift+Left mouse, or Right mouse for panning
            event.preventDefault();
            isDragging = true;
            lastPanPoint = { x: event.clientX, y: event.clientY };
            canvasState.update(s => ({ ...s, mode: 'pan' }));
            
            // Use global listeners for robust panning
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else if (event.button === 0) {
            // Check if clicking on empty space (not a node or connection)
            const clickedOnNode = event.target.closest('.node-card');
            const clickedOnConnection = event.target.closest('.connection-group');
            const clickedOnPalette = event.target.closest('.node-palette');
            const clickedOnSettings = event.target.closest('.settings-button');
            
            console.log('Mouse down check - clickedOnNode:', !!clickedOnNode, 'clickedOnConnection:', !!clickedOnConnection, 'clickedOnPalette:', !!clickedOnPalette, 'target:', event.target.tagName, 'classes:', event.target.className);
            
            if (!clickedOnNode && !clickedOnConnection && !clickedOnPalette && !clickedOnSettings) {
                // Left mouse on empty canvas - start box selection
                console.log('Starting box selection on empty space');
                
                // CRUCIAL: Prevent native browser drag behavior
                event.preventDefault();
                
                // IMMEDIATELY set state to prevent node interference
                isBoxSelecting = true;
                hasMovedDuringDrag = false;
                blockNodeInteractions = true;
                
                const canvasCoords = screenToCanvas(event.clientX, event.clientY);
                boxSelectionStart = canvasCoords;
                
                // Set canvas state synchronously
                canvasState.update(s => ({ 
                    ...s, 
                    mode: 'box-selecting',
                    boxSelection: {
                        x: canvasCoords.x,
                        y: canvasCoords.y,
                        width: 0,
                        height: 0
                    }
                }));
                
                // Use global listeners for robust selection
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
            }
        }
    }
    
    // Handle mouse move for panning, connection drawing, and box selection
    function handleMouseMove(event) {
        mousePosition = { x: event.clientX, y: event.clientY };
        
        if (isDragging && $canvasState.mode === 'pan') {
            const deltaX = event.clientX - lastPanPoint.x;
            const deltaY = event.clientY - lastPanPoint.y;
            
            viewportActions.pan(deltaX, deltaY);
            lastPanPoint = { x: event.clientX, y: event.clientY };
        }
        
        if (isConnecting && tempConnection) {
            const canvasCoords = screenToCanvas(event.clientX, event.clientY);
            tempConnection.endX = canvasCoords.x;
            tempConnection.endY = canvasCoords.y;
            tempConnection = { ...tempConnection }; // Trigger reactivity
        }
        
        if (isBoxSelecting) {
            console.log('Mouse move during box selection - isBoxSelecting:', isBoxSelecting, 'mode:', $canvasState.mode);
            const canvasCoords = screenToCanvas(event.clientX, event.clientY);
            const selection = {
                x: Math.min(boxSelectionStart.x, canvasCoords.x),
                y: Math.min(boxSelectionStart.y, canvasCoords.y),
                width: Math.abs(canvasCoords.x - boxSelectionStart.x),
                height: Math.abs(canvasCoords.y - boxSelectionStart.y)
            };
            
            // Mark as moved if we've dragged more than a few pixels
            if (!hasMovedDuringDrag && (selection.width > 2 || selection.height > 2)) {
                hasMovedDuringDrag = true;
                console.log('Started actual drag movement at:', selection.width, 'x', selection.height);
            }
            
            console.log('Box selection size:', selection.width, 'x', selection.height, 'hasMoved:', hasMovedDuringDrag);
            canvasState.update(s => ({ 
                ...s, 
                boxSelection: selection,
                mode: 'box-selecting'  // Ensure mode stays consistent
            }));
        }
    }
    
    // Handle mouse up
    function handleMouseUp(event) {
        console.log('Mouse up - isBoxSelecting:', isBoxSelecting, 'hasMovedDuringDrag:', hasMovedDuringDrag, 'event.target:', event.target.tagName);
        
        // Remove global listeners
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        
        isDragging = false;
        
        if (isConnecting) {
            // Cancel connection if not dropped on a valid target
            isConnecting = false;
            tempConnection = null;
        }
        
        if (isBoxSelecting) {
            // Finish box selection - find nodes within selection
            const selection = $canvasState.boxSelection;
            console.log('Finishing box selection:', selection, 'hasMoved:', hasMovedDuringDrag);
            
            if (selection && (selection.width > 5 || selection.height > 5)) {
                const selectedNodeIds = $nodes.filter(node => {
                    const intersects = node.x < selection.x + selection.width &&
                           node.x + node.width > selection.x &&
                           node.y < selection.y + selection.height &&
                           node.y + node.height > selection.y;
                    return intersects;
                }).map(node => node.id);
                
                console.log('Box selected nodes:', selectedNodeIds);
                canvasState.update(s => ({ 
                    ...s, 
                    selectedNodes: selectedNodeIds,
                    selectedNode: selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
                }));
                
                // Only suppress double-click if we actually selected something or moved significantly
                if (hasMovedDuringDrag && selectedNodeIds.length > 0) {
                    suppressNextDoubleClick = true;
                    setTimeout(() => {
                        suppressNextDoubleClick = false;
                    }, 300);
                }
            } else {
                // If box selection was too small, clear selection
                canvasState.update(s => ({ 
                    ...s, 
                    selectedNodes: [],
                    selectedNode: null
                }));
            }
            
            isBoxSelecting = false;
            lastBoxSelectionTime = Date.now();
            hasMovedDuringDrag = false;
            blockNodeInteractions = false;
        }
        
        // Always clear box selection and reset state
        canvasState.update(s => ({ 
            ...s, 
            mode: 'select',
            boxSelection: null
        }));
        
        // Ensure all selection state is properly reset
        if (!isBoxSelecting) {
            hasMovedDuringDrag = false;
        }
    }
    
    // Handle double click to create text node
    function handleDoubleClick(event) {
        console.log('Double click detected - suppressed:', suppressNextDoubleClick, 'isBoxSelecting:', isBoxSelecting, 'lastBoxSelectionTime:', Date.now() - lastBoxSelectionTime);
        
        if (suppressNextDoubleClick || isBoxSelecting) {
            console.log('Suppressing double-click due to box selection state');
            return;
        }
        
        // Only create node if double-clicking on empty space
        const clickedOnNode = event.target.closest('.node-card');
        const clickedOnConnection = event.target.closest('.connection-group');
        const clickedOnPalette = event.target.closest('.node-palette');
        const clickedOnSettings = event.target.closest('.settings-button');
        
        if (!clickedOnNode && !clickedOnConnection && !clickedOnPalette && !clickedOnSettings) {
            console.log('Creating new INPUT node via double-click');
            const canvasCoords = screenToCanvas(event.clientX, event.clientY);
            nodeActions.add('input', canvasCoords.x, canvasCoords.y, '');
        }
    }
    
    // Handle drop from node palette
    function handleDrop(event) {
        console.log('handleDrop called, dataTransfer:', event.dataTransfer.getData('text/plain'), 'isBoxSelecting:', isBoxSelecting);
        
        // Don't handle drops during box selection
        if (isBoxSelecting) {
            console.log('Ignoring drop during box selection');
            return;
        }
        
        event.preventDefault();
        const nodeType = event.dataTransfer.getData('text/plain');
        const canvasCoords = screenToCanvas(event.clientX, event.clientY);
        
        // Only create node if we have a valid nodeType from actual drag operation
        if (nodeType && nodeType.trim() !== '') {
            console.log('Creating node from palette drop:', nodeType);
            nodeActions.add(nodeType, canvasCoords.x, canvasCoords.y);
        } else {
            console.log('No valid nodeType from drop, ignoring');
        }
    }
    
    function handleDragOver(event) {
        // Only prevent default for actual drag operations from palette, not box selection
        if (!isBoxSelecting) {
            event.preventDefault();
        }
    }
    
    // Touch support for mobile/trackpad
    let touchStartDistance = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    
    function handleTouchStart(event) {
        console.log('Touch start, fingers:', event.touches.length);
        if (event.touches.length === 2) {
            // Two finger pan/zoom
            event.preventDefault();
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            
            touchStartDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) + 
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            lastTouchCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }
    }
    
    function handleTouchMove(event) {
        console.log('Touch move, fingers:', event.touches.length);
        if (event.touches.length === 2) {
            event.preventDefault();
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) + 
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            const currentCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
            
            // Pan - only if we have a previous center
            if (lastTouchCenter.x !== 0 || lastTouchCenter.y !== 0) {
                const panDeltaX = currentCenter.x - lastTouchCenter.x;
                const panDeltaY = currentCenter.y - lastTouchCenter.y;
                
                // Add some sensitivity multiplier for trackpad
                const sensitivity = 1.5;
                viewportActions.pan(panDeltaX * sensitivity, panDeltaY * sensitivity);
            }
            
            // Zoom - only if distance changed significantly
            if (touchStartDistance > 0) {
                const distanceChange = Math.abs(currentDistance - touchStartDistance);
                if (distanceChange > 5) { // Minimum threshold to prevent jitter
                    const zoomFactor = currentDistance / touchStartDistance;
                    // Clamp zoom factor to prevent extreme zooming
                    const clampedZoomFactor = Math.max(0.8, Math.min(1.2, zoomFactor));
                    viewportActions.zoom(clampedZoomFactor, currentCenter.x, currentCenter.y);
                    touchStartDistance = currentDistance;
                }
            }
            
            lastTouchCenter = currentCenter;
        }
    }
    
    function handleTouchEnd(event) {
        if (event.touches.length < 2) {
            touchStartDistance = 0;
            lastTouchCenter = { x: 0, y: 0 };
        }
    }
    
    // Connection handling functions
    function startConnection(fromNodeId, fromPort) {
        // Check if it's a node or a machine
        const fromNode = $nodes.find(n => n.id === fromNodeId);
        const fromMachine = $workflowContainers.find(c => c.id === fromNodeId);
        
        if (!fromNode && !fromMachine) return;
        
        isConnecting = true;
        let portX, portY;
        
        if (fromNode) {
            // Regular node connection
            portX = fromPort === 'output' ? fromNode.x + fromNode.width : fromNode.x;
            portY = fromNode.y + fromNode.height / 2;
        } else if (fromMachine) {
            // Machine connection - only from output port
            portX = fromMachine.bounds.x + fromMachine.bounds.width;
            portY = fromMachine.bounds.y + fromMachine.bounds.height / 2;
        }
        
        tempConnection = {
            fromNodeId,
            fromPort,
            startX: portX,
            startY: portY,
            endX: portX,
            endY: portY,
            isFromMachine: !!fromMachine
        };
        
        canvasState.update(s => ({ ...s, mode: 'connecting' }));
    }
    
    function completeConnection(toNodeId, toPort) {
        if (!isConnecting || !tempConnection) return;
        
        // Don't connect to same node/machine
        if (tempConnection.fromNodeId === toNodeId) {
            cancelConnection();
            return;
        }
        
        // Only allow machine-to-node connections (not machine-to-machine)
        const toNode = $nodes.find(n => n.id === toNodeId);
        const toMachine = $workflowContainers.find(c => c.id === toNodeId);
        
        if (tempConnection.isFromMachine && toMachine) {
            console.log('Machine-to-machine connections not allowed');
            cancelConnection();
            return;
        }
        
        if (tempConnection.isFromMachine && toNode && toPort !== 'input') {
            console.log('Machine can only connect to node input ports');
            cancelConnection();
            return;
        }
        
        // Create the connection
        try {
            connectionActions.add(tempConnection.fromNodeId, toNodeId, tempConnection.fromPort, toPort);
            console.log('Connection created:', tempConnection.fromNodeId, '->', toNodeId);
        } catch (error) {
            console.error('Failed to create connection:', error.message);
        }
        
        cancelConnection();
    }
    
    function cancelConnection() {
        isConnecting = false;
        tempConnection = null;
        canvasState.update(s => ({ ...s, mode: 'select' }));
    }
    
    // Handle global keyboard events
    function handleKeyDown(event) {
        const target = event.target;
        const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        // If typing in an input, don't trigger global shortcuts for deletion
        if (isTextInput && (event.key === 'Delete' || event.key === 'Backspace')) {
            return;
        }

        console.log('Key pressed:', event.key, 'Selected connection:', $canvasState.selectedConnection, 'Selected node:', $canvasState.selectedNode, 'Selected nodes:', $canvasState.selectedNodes);
        
        // Zoom shortcuts
        if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
            event.preventDefault();
            const rect = canvasElement.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            viewportActions.zoom(1.2, centerX, centerY);
        } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
            event.preventDefault();
            const rect = canvasElement.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            viewportActions.zoom(0.8, centerX, centerY);
        }
        
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if ($canvasState.selectedConnection) {
                console.log('Deleting connection:', $canvasState.selectedConnection);
                connectionActions.delete($canvasState.selectedConnection);
                canvasState.update(s => ({ ...s, selectedConnection: null }));
                event.preventDefault();
            } else if ($canvasState.selectedNodes && $canvasState.selectedNodes.length > 0) {
                console.log('Deleting multiple nodes:', $canvasState.selectedNodes);
                // Delete all selected nodes
                $canvasState.selectedNodes.forEach(nodeId => {
                    nodeActions.delete(nodeId);
                });
                canvasState.update(s => ({ ...s, selectedNodes: [], selectedNode: null }));
                event.preventDefault();
            } else if ($canvasState.selectedNode) {
                console.log('Deleting node:', $canvasState.selectedNode);
                nodeActions.delete($canvasState.selectedNode);
                canvasState.update(s => ({ ...s, selectedNode: null }));
                event.preventDefault();
            }
        }
        if (event.key === 'Escape') {
            if (isConnecting) {
                cancelConnection();
            } else {
                canvasState.update(s => ({ 
                    ...s, 
                    selectedNode: null, 
                    selectedConnection: null,
                    selectedNodes: []
                }));
            }
        }
    }
    
    // Clear selection when clicking canvas (but not after box selection)
    function handleCanvasClick(event) {
        // Focus canvas for keyboard events
        if (canvasElement) {
            canvasElement.focus();
        }
        
        // Only clear selection if this wasn't a box selection and we're not clicking on nodes
        const clickedOnNode = event.target.closest('.node-card');
        const clickedOnConnection = event.target.closest('.connection-group');
        const clickedOnPalette = event.target.closest('.node-palette');
        const clickedOnSettings = event.target.closest('.settings-button');
        
        if (!isBoxSelecting && !clickedOnNode && !clickedOnConnection && !clickedOnPalette && !clickedOnSettings && Date.now() - lastBoxSelectionTime > 100) {
            canvasState.update(s => ({ 
                ...s, 
                selectedNode: null, 
                selectedConnection: null,
                selectedNodes: [],
                boxSelection: null  // Also clear any stuck box selection
            }));
        }
    }
    
    // File management functions
    async function saveCanvas() {
        if (currentCanvasPath) {
            // We have a current file, just save to it
            await saveToCurrentFile();
        } else {
            // No current file, show save dialog
            await saveAsCanvas();
        }
    }
    
    async function saveAsCanvas() {
        try {
            // Create canvas data structure
            const canvasData = {
                version: "1.0",
                created: Date.now(),
                modified: Date.now(),
                viewport: $viewport,
                nodes: $nodes,
                connections: $connections,
                metadata: {
                    nodeCount: $nodes.length,
                    connectionCount: $connections.length
                }
            };
            
            console.log('Saving canvas data:', canvasData);
            
            // Check if Wails runtime is available
            if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.SaveCanvas) {
                console.warn('Wails runtime not available - simulating save');
                alert('Save functionality requires the desktop app. Please run `wails generate` to update bindings.');
                return;
            }
            
            // Call backend save function
            const result = await window.go.main.App.SaveCanvas(JSON.stringify(canvasData));
            if (result.success) {
                currentCanvasPath = result.path;
                currentCanvasName = result.path.split('/').pop().replace('.thoughtorio', '');
                await loadRecentCanvases();
                console.log('Canvas saved successfully to:', result.path);
            } else {
                throw new Error(result.error || 'Failed to save canvas');
            }
        } catch (error) {
            console.error('Failed to save canvas:', error);
            alert('Failed to save canvas: ' + error.message);
        }
    }
    
    async function saveToCurrentFile() {
        try {
            // Create canvas data structure
            const canvasData = {
                version: "1.0",
                created: Date.now(),
                modified: Date.now(),
                viewport: $viewport,
                nodes: $nodes,
                connections: $connections,
                metadata: {
                    nodeCount: $nodes.length,
                    connectionCount: $connections.length
                }
            };
            
            // Use backend to overwrite current file
            if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.SaveCanvas) {
                console.warn('Wails runtime not available');
                return;
            }
            
            // For now, just use save-as since we need a backend function for direct file writes
            await saveAsCanvas();
        } catch (error) {
            console.error('Failed to save to current file:', error);
            await saveAsCanvas();
        }
    }
    
    function newCanvas() {
        if ($nodes.length > 0 || $connections.length > 0) {
            if (!confirm('Create new canvas? All unsaved changes will be lost.')) {
                return;
            }
        }
        
        // Clear canvas state
        nodes.set([]);
        connections.set([]);
        viewportActions.reset();
        currentCanvasPath = null;
        currentCanvasName = null;
        
        // Reset canvas state
        canvasState.update(s => ({
            ...s,
            selectedNode: null,
            selectedConnection: null,
            selectedNodes: [],
            mode: 'select'
        }));
        
        console.log('New canvas created');
    }
    
    async function loadCanvas() {
        try {
            console.log('Loading canvas...');
            
            // Check if Wails runtime is available
            if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.LoadCanvas) {
                console.warn('Wails runtime not available - simulating load');
                alert('Load functionality requires the desktop app. Please run `wails generate` to update bindings.');
                return;
            }
            
            // Call backend load function
            const result = await window.go.main.App.LoadCanvas();
            if (result.success && result.data) {
                const canvasData = JSON.parse(result.data);
                
                // Restore canvas state
                if (canvasData.viewport) {
                    viewportActions.setViewport(canvasData.viewport);
                }
                
                // Clear existing data and load new data
                nodes.set(canvasData.nodes || []);
                connections.set(canvasData.connections || []);
                
                currentCanvasPath = result.path;
                currentCanvasName = result.path.split('/').pop().replace('.thoughtorio', '');
                await loadRecentCanvases();
                
                console.log('Canvas loaded successfully from:', result.path);
            } else {
                throw new Error(result.error || 'Failed to load canvas');
            }
        } catch (error) {
            console.error('Failed to load canvas:', error);
            alert('Failed to load canvas: ' + error.message);
        }
    }
    
    async function loadRecentCanvas(recent) {
        try {
            console.log('Loading recent canvas:', recent);
            showRecents = false;
            
            // Check if Wails runtime is available
            if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.LoadCanvasFromPath) {
                console.warn('Wails runtime not available');
                return;
            }
            
            // Call backend to load specific file
            const result = await window.go.main.App.LoadCanvasFromPath(recent.path);
            if (result.success && result.data) {
                const canvasData = JSON.parse(result.data);
                
                // Restore canvas state
                if (canvasData.viewport) {
                    viewportActions.setViewport(canvasData.viewport);
                }
                
                // Clear existing data and load new data
                nodes.set(canvasData.nodes || []);
                connections.set(canvasData.connections || []);
                
                currentCanvasPath = recent.path;
                await loadRecentCanvases();
                
                console.log('Recent canvas loaded successfully');
            } else {
                throw new Error(result.error || 'Failed to load recent canvas');
            }
        } catch (error) {
            console.error('Failed to load recent canvas:', error);
            alert('Failed to load recent canvas: ' + error.message);
        }
    }
    
    async function loadRecentCanvases() {
        try {
            if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.GetRecentCanvases) {
                // Fallback for development
                recentCanvases = [];
                return;
            }
            
            const result = await window.go.main.App.GetRecentCanvases();
            if (result.success) {
                recentCanvases = result.recents || [];
            }
        } catch (error) {
            console.error('Failed to load recent canvases:', error);
            recentCanvases = [];
        }
    }
    
    function toggleRecents() {
        if (!showRecents) {
            loadRecentCanvases();
        }
        showRecents = !showRecents;
    }
    
    // Fix recents dropdown functionality
    async function handleRecentClick(recent) {
        try {
            console.log('Loading recent canvas:', recent);
            showRecents = false;
            
            // Check if Wails runtime is available
            if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.LoadCanvasFromPath) {
                console.warn('Wails runtime not available');
                return;
            }
            
            // Call backend to load specific file
            const result = await window.go.main.App.LoadCanvasFromPath(recent.path);
            if (result.success && result.data) {
                const canvasData = JSON.parse(result.data);
                
                // Restore canvas state
                if (canvasData.viewport) {
                    viewportActions.setViewport(canvasData.viewport);
                }
                
                // Clear existing data and load new data
                nodes.set(canvasData.nodes || []);
                connections.set(canvasData.connections || []);
                
                currentCanvasPath = result.path;
                currentCanvasName = result.path.split('/').pop().replace('.thoughtorio', '');
                await loadRecentCanvases();
                
                console.log('Recent canvas loaded successfully:', result.path);
            } else {
                throw new Error(result.error || 'Failed to load recent canvas');
            }
        } catch (error) {
            console.error('Failed to load recent canvas:', error);
            alert('Failed to load recent canvas: ' + error.message);
        }
    }
    
    function formatDate(timestamp) {
        const date = new Date(Number(timestamp));
        const now = new Date();
        const diffMs = Number(now) - Number(date);
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    // Load recent canvases on mount
    import { onMount } from 'svelte';
    onMount(() => {
        loadRecentCanvases();
    });
    
    // Expose connection functions to child components
    export { startConnection, completeConnection, cancelConnection };
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="canvas-container">
    <!-- Node Palette -->
    <NodePalette />
    
    <!-- Main Canvas -->
    <div 
        class="canvas-viewport"
        bind:this={canvasElement}
        tabindex="-1"
        on:wheel={handleWheel}
        on:mousedown={handleMouseDown}
        on:mousemove={handleMouseMove}
        on:mouseup={handleMouseUp}
        on:dblclick={handleDoubleClick}
        on:drop={handleDrop}
        on:dragover={handleDragOver}
        on:touchstart={handleTouchStart}
        on:touchmove={handleTouchMove}
        on:touchend={handleTouchEnd}
        on:contextmenu|preventDefault
        on:click={handleCanvasClick}
        on:keydown={handleKeyDown}
    >
        <div 
            class="canvas-content"
            style="transform: translate({$viewport.x}px, {$viewport.y}px) scale({$viewport.zoom})"
        >
            <!-- SVG layer for connections -->
            <svg class="connections-layer">
                <!-- Arrow marker definition -->
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                            refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                    </marker>
                </defs>
                
                <!-- Render connections -->
                {#each $connections as connection}
                    <ConnectionLine {connection} />
                {/each}
                
                <!-- Render temporary connection while dragging -->
                {#if tempConnection}
                    <path
                        d="M {tempConnection.startX} {tempConnection.startY} C {tempConnection.startX + 50} {tempConnection.startY}, {tempConnection.endX - 50} {tempConnection.endY}, {tempConnection.endX} {tempConnection.endY}"
                        stroke="#2196f3"
                        stroke-width="2"
                        stroke-dasharray="5,5"
                        fill="none"
                        marker-end="url(#arrowhead)"
                        class="temp-connection"
                    />
                {/if}
            </svg>
            
            <!-- Workflow containers layer (behind nodes) -->
            <div class="containers-layer">
                {#each $workflowContainers as container}
                    <WorkflowContainer 
                        {container}
                        {blockNodeInteractions}
                        {startConnection}
                        {completeConnection}
                        {isConnecting}
                    />
                {/each}
            </div>
            
            <!-- Nodes layer -->
            <div class="nodes-layer">
                {#each $nodes as node (node.id)}
                    <Node 
                        {node} 
                        {startConnection} 
                        {completeConnection} 
                        isConnecting={$canvasState.mode === 'connecting'}
                        isSelected={$canvasState.selectedNodes.includes(node.id) || $canvasState.selectedNode === node.id}
                        {blockNodeInteractions}
                    />
                {/each}
            </div>
            
            <!-- Box selection overlay -->
            {#if $canvasState.boxSelection}
                <div 
                    class="box-selection"
                    style="
                        left: {$canvasState.boxSelection.x}px;
                        top: {$canvasState.boxSelection.y}px;
                        width: {$canvasState.boxSelection.width}px;
                        height: {$canvasState.boxSelection.height}px;
                    "
                ></div>
            {/if}
        </div>
        
        <!-- Canvas info overlay -->
        <div class="canvas-info">
            <div class="info-left">
                <div class="zoom-info">Zoom: {Math.round($viewport.zoom * 100)}%</div>
                <div class="node-count">{$nodes.length} nodes</div>
            </div>
            <div class="info-right">
                <div class="toolbar-buttons">
                    <!-- New Canvas Button -->
                    <button 
                        class="toolbar-button" 
                        on:click={newCanvas}
                        title="New Canvas"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                        </svg>
                    </button>
                    <!-- Save Button -->
                    <button 
                        class="toolbar-button" 
                        on:click={saveCanvas}
                        title={currentCanvasPath ? `Save ${currentCanvasName || 'Canvas'}` : 'Save Canvas'}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3M19,19H5V5H16.17L19,7.83V19M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12Z"/>
                        </svg>
                    </button>
                    <!-- Save As Button (only show if we have a current file) -->
                    {#if currentCanvasPath}
                        <button 
                            class="toolbar-button" 
                            on:click={saveAsCanvas}
                            title="Save As..."
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12M6,19V17H8V19H6M6,15V13H8V15H6M6,11V9H8V11H6M6,7V5H8V7H6Z"/>
                            </svg>
                        </button>
                    {/if}

                    <!-- Load Button -->
                    <button 
                        class="toolbar-button" 
                        on:click={loadCanvas}
                        title="Load Canvas"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                    </button>

                    <!-- Recents Button -->
                    <button 
                        class="toolbar-button recents-button" 
                        on:click={toggleRecents}
                        title="Recent Canvases"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3"/>
                        </svg>
                        {#if showRecents}
                            <div class="recents-dropdown">
                                <div class="recents-header">Recent Canvases</div>
                                {#if recentCanvases.length === 0}
                                    <div class="recents-empty">No recent canvases</div>
                                {:else}
                                    {#each recentCanvases as recent}
                                        <button 
                                            class="recent-item"
                                            on:click={() => handleRecentClick(recent)}
                                            title={recent.path}
                                        >
                                            <div class="recent-name">{recent.name}</div>
                                            <div class="recent-date">{formatDate(recent.lastOpened)}</div>
                                        </button>
                                    {/each}
                                {/if}
                            </div>
                        {/if}
                    </button>

                    <!-- Config Panel Button -->
                    <button 
                        class="toolbar-button config-button" 
                        class:active={showConfigPanel}
                        on:click={() => showConfigPanel = !showConfigPanel}
                        title="View Configuration"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                    </button>

                    <!-- Settings Button -->
                    <button 
                        class="toolbar-button settings-button" 
                        on:click={() => showSettings = true}
                        title="Settings"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11.03L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11.03C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Settings Panel -->
    <SettingsPanel bind:isOpen={showSettings} />
    
    <!-- Config Panel -->
    <ConfigPanel bind:visible={showConfigPanel} />
    
    <!-- Global Context Menu -->
    <CanvasContextMenu 
        bind:visible={showCanvasContextMenu}
        x={canvasContextMenuX}
        y={canvasContextMenuY}
        items={canvasContextMenuItems}
        on:item-click={handleGlobalContextMenuAction}
    />
</div>

<style>
    .canvas-container {
        display: flex;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #f5f5f5;
    }
    
    .canvas-viewport {
        flex: 1;
        position: relative;
        cursor: url('../assets/cursor-grab.svg') 16 16, grab;
        background: 
            radial-gradient(circle, #ddd 1px, transparent 1px);
        background-size: 20px 20px;
        overflow: hidden;
    }
    
    .canvas-viewport:active {
        cursor: url('../assets/cursor-grabbing.svg') 16 16, grabbing;
    }
    
    .canvas-viewport:focus {
        outline: none;
    }
    
    .canvas-content {
        position: relative;
        width: 100%;
        height: 100%;
        transform-origin: 0 0;
    }
    
    .connections-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
        overflow: visible;
    }
    
    .connections-layer :global(.connection-group) {
        pointer-events: all;
    }
    
    .containers-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
    }
    
    .nodes-layer {
        position: relative;
        z-index: 2;
    }
    
    .canvas-info {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        pointer-events: none;
    }
    
    .info-left {
        background: rgba(255, 255, 255, 0.9);
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        color: #666;
    }
    
    .info-right {
        pointer-events: all;
    }
    
    .zoom-info, .node-count {
        margin: 2px 0;
    }
    
    .toolbar-buttons {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    
    .toolbar-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: #6b7280;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        position: relative;
    }
    
    .toolbar-button:hover {
        background: white;
        color: #4f46e5;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
    
    .toolbar-button.active {
        background: #4f46e5;
        color: white;
        box-shadow: 0 4px 8px rgba(79, 70, 229, 0.3);
    }
    
    .recents-button {
        position: relative;
    }
    
    .recents-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 8px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        min-width: 280px;
        max-width: 400px;
        z-index: 1000;
        overflow: hidden;
    }
    
    .recents-header {
        padding: 12px 16px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        font-weight: 600;
        font-size: 14px;
        color: #374151;
    }
    
    .recents-empty {
        padding: 20px 16px;
        text-align: center;
        color: #9ca3af;
        font-size: 14px;
    }
    
    .recent-item {
        display: block;
        width: 100%;
        padding: 12px 16px;
        border: none;
        background: none;
        text-align: left;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        transition: background-color 0.15s ease;
        border-bottom: 1px solid #f3f4f6;
    }
    
    .recent-item:last-child {
        border-bottom: none;
    }
    
    .recent-item:hover {
        background: #f9fafb;
    }
    
    .recent-name {
        font-weight: 500;
        font-size: 14px;
        color: #374151;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .recent-date {
        font-size: 12px;
        color: #9ca3af;
    }
    
    :global(.temp-connection) {
        animation: dash 1s linear infinite;
    }
    
    @keyframes dash {
        to {
            stroke-dashoffset: -10;
        }
    }
    
    .box-selection {
        position: absolute;
        border: 2px dashed #2196f3;
        background: rgba(33, 150, 243, 0.1);
        pointer-events: none;
        z-index: 10;
    }
</style>