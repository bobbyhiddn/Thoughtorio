# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Thoughtorio is a visual node-based content creation platform built with **Wails v2** (Go backend + Svelte frontend). It enables users to create complex AI-powered workflows through a drag-and-drop interface with visual execution feedback.

### Core Architecture

**Frontend Stack (Svelte)**:
- `thoughtorio/frontend/src/lib/` - Core UI components
- `thoughtorio/frontend/src/stores/` - State management
- Visual canvas with drag-and-drop node editing
- Real-time execution state visualization
- Context menus and clipboard operations

**Backend Stack (Go)**:
- `thoughtorio/app.go` - Main Wails application with AI provider integrations
- `thoughtorio/main.go` - Application entry point
- Multi-provider AI support (OpenRouter, OpenAI, Gemini, Ollama)
- File management (canvas save/load with .thoughtorio format)
- System clipboard integration

### Key Components

**Node System**:
- **Static Nodes**: Immutable content sources (`node_type: static`)
- **Input Nodes**: User input processors with envelope/wrapper capabilities (`node_type: input`)
- **AI Nodes**: Dynamic content transformation via LLM (`node_type: dynamic`)
- Complete YAML-based data serialization for each node

**Workflow System**:
- **Node Machines**: Groups of connected nodes working as unified processors
- **Node Factories**: Higher-level containers that can connect multiple machines
- **Execution Engine**: Real-time workflow processing with visual feedback
- **Context Preservation**: Complete data lineage tracking through processing chains

**Data Management**:
- YAML backend for all node configurations (`lib/NodeData.js`)
- Canvas state management with zoom/pan capabilities
- Connection system for data flow between nodes
- Persistent storage with recent files tracking

### Multi-Provider AI Integration

The Go backend (`app.go`) supports:
- **OpenRouter**: `FetchOpenRouterModels()`, `getOpenRouterCompletion()`
- **OpenAI**: `FetchOpenAIModels()`, `getOpenAICompletion()`
- **Gemini**: `FetchGeminiModels()`, `getGeminiCompletion()`  
- **Ollama**: `FetchOllamaModels()`, `getOllamaCompletion()`
- Unified interface through `GetAICompletion(provider, model, prompt, apiKey)`

### Key Features

**Visual Workflow Builder**:
- Drag-and-drop node creation and connection
- Box selection and multi-node operations
- Zoom/pan canvas navigation with smooth transitions
- Real-time execution indicators and status

**Advanced Data Flow**:
- Multi-input node support with envelope/wrapper processing
- Complete context chain preservation across transformations
- Node type enforcement and validation
- Hierarchical workflow composition (machines within factories)

**File Operations**:
- Save/load canvas files (.thoughtorio format)
- Recent files tracking in user config directory
- JSON-based canvas serialization
- Clipboard operations for text and configurations

## Common Development Tasks

### Node Operations
- Create nodes: Use node type factories in `NodeData.js`
- Connect nodes: Visual connection system with port validation
- Execute workflows: `workflowActions.execute(containerId)` in `workflows.js`
- Access node data: `nodeDataStore.get(nodeId).toCleanYAML()`

### AI Integration
- Get AI completion: `GetAICompletion(provider, model, prompt, apiKey)` 
- Fetch available models: Provider-specific functions (e.g., `FetchOpenAIModels()`)
- Handle responses: All providers return standardized `AICompletionResponse`

### Canvas Management
- Save canvas: `SaveCanvas(canvasData)` opens save dialog
- Load canvas: `LoadCanvas()` opens file dialog or `LoadCanvasFromPath(path)`
- Recent files: `GetRecentCanvases()` returns recent canvas list

### Execution State
- Track execution: `executionState` store manages active/completed/error nodes
- Visual feedback: Automatic UI updates for execution status
- Workflow control: Start/stop execution via workflow containers

## Development Patterns

- **Component Architecture**: Svelte components with reactive stores
- **State Management**: Centralized stores for nodes, canvas, workflows, settings
- **Error Handling**: Comprehensive error reporting with user feedback
- **Type Safety**: Node type validation and connection rules
- **Data Persistence**: YAML serialization for configuration export/import
- **Cross-Platform**: Wails provides native desktop app experience

## Project Structure

```
thoughtorio/
├── app.go                    # Go backend (AI providers, file ops, clipboard)
├── main.go                   # Wails application entry point
├── frontend/src/
│   ├── lib/
│   │   ├── Canvas.svelte           # Main canvas component
│   │   ├── Node.svelte            # Individual node component
│   │   ├── WorkflowContainer.svelte # Node machine/factory containers
│   │   ├── NodeData.js            # YAML data serialization system
│   │   └── clipboard.js           # Copy/paste operations
│   └── stores/
│       ├── nodes.js               # Node state and operations
│       ├── canvas.js              # Canvas viewport and selection
│       ├── workflows.js           # Execution and container management
│       ├── executionState.js      # Real-time execution tracking
│       └── settings.js            # AI provider configuration
└── NODE_ARCHITECTURE.md      # Detailed node type specifications
```

## Dependencies

**Backend (Go)**:
- `github.com/wailsapp/wails/v2` - Desktop app framework
- Standard library for HTTP, JSON, file operations

**Frontend (Svelte)**:
- Svelte reactive framework
- Custom YAML serialization
- Canvas-based UI with CSS animations