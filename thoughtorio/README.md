# Thoughtorio

A powerful visual workflow system for building hierarchical AI processing pipelines with recursive DAG execution.

## ✨ Features

### 🔗 **Hierarchical Workflow System**
- **Nodes**: Individual processing units (input, static, dynamic AI)
- **Machines**: Connected node groups with blue containers
- **Factories**: Machine + node combinations with orange containers  
- **Networks**: Factory combinations with teal containers

### 🚀 **Recursive DAG Execution**
- **Individual Execution**: Execute any container at any hierarchy level
- **Recursive Processing**: Networks execute factories, factories execute machines, machines execute nodes
- **Context Preservation**: Full context chains maintained across hierarchy levels
- **Dependency Resolution**: Automatic topological sorting at each level

### 🤖 **Multi-Provider AI Integration**
- **OpenRouter**: Access to 100+ AI models
- **OpenAI**: GPT models with API key support
- **Google Gemini**: Gemini models integration
- **Ollama**: Local model execution

### 📋 **Configuration Management**
- **YAML Export**: Copy configurations at any hierarchy level
- **Metadata Export**: Technical details and connection graphs
- **Cross-Platform Clipboard**: Wails + browser clipboard support

### 🎨 **Visual Interface**
- **Canvas-Based Editor**: Drag, connect, and organize workflows
- **Hierarchical Containers**: Visual nesting with proper z-index layering
- **Real-Time Execution**: Live status indicators and progress tracking
- **Context Menus**: Right-click operations for all container types

## 🏗️ Architecture

### Node Hierarchy
```
Network (Teal Container)
├── Factory A (Orange Container)
│   ├── Machine 1 (Blue Container)
│   │   ├── Input Node
│   │   └── AI Node
│   └── Standalone Node
└── Factory B (Orange Container)
    └── Machine 2 (Blue Container)
        └── Output Node
```

### Execution Flow
```javascript
executeContainer(network) → 
  executeContainer(factory1) → 
    executeContainer(machine1) → executeNode1, executeNode2
    executeStandaloneNode
  executeContainer(factory2) → 
    executeContainer(machine2) → executeNode3
```

### Connection Rules
- **Node → Node**: Creates Machine
- **Machine → Node**: Creates Factory
- **Factory → Node/Factory**: Creates Network

## 🛠️ Development

### Prerequisites
- **Go**: 1.21 or later
- **Node.js**: 16 or later
- **Wails**: v2.8.0 or later

### Live Development
```bash
wails dev
```
Runs with hot reload at `http://localhost:34115`

### Building
```bash
wails build
```
Creates production executable

### Project Structure
```
thoughtorio/
├── internal/           # Go backend modules
│   ├── providers/     # AI provider interfaces
│   └── config/        # Configuration management
├── frontend/          # Svelte frontend
│   ├── src/
│   │   ├── stores/    # State management
│   │   ├── lib/       # Core components
│   │   └── plugins/   # Node type plugins
│   └── wailsjs/       # Generated Wails bindings
└── app.go             # Main application entry
```

## 🎯 Usage

### Creating Workflows
1. **Add Nodes**: Drag from the toolbar or use shortcuts
2. **Connect Nodes**: Click and drag between node ports
3. **Configure**: Right-click for settings and content
4. **Execute**: Click play buttons on containers

### Hierarchy Creation
- Connect 2+ nodes → **Machine** appears
- Connect machine to node → **Factory** appears  
- Connect factory to anything → **Network** appears

### AI Configuration
1. **Settings Panel**: Configure provider and API keys
2. **Model Selection**: Choose from available models
3. **Dynamic Nodes**: Will use configured AI for processing

### Context Management  
- **Automatic Context Chains**: Context flows through hierarchy levels
- **Structured Data**: Facts, history, and tasks properly merged
- **Source Tracking**: Full provenance of data transformations

## 🔧 Configuration

### AI Providers
Set up in the settings panel:
- **OpenRouter**: Requires API key for cloud models
- **OpenAI**: Direct OpenAI API integration  
- **Gemini**: Google's AI models
- **Ollama**: Local model execution (no API key needed)

### Storage
- **Canvas State**: Auto-saved locally
- **Recent Files**: Quick access to previous workflows
- **Export/Import**: YAML-based configuration files

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## 📄 License

[Insert your license here]

## 🚀 Getting Started

1. **Install Wails**: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
2. **Clone Repository**: `git clone [repo-url]`
3. **Run Development**: `wails dev`
4. **Configure AI**: Add API keys in settings
5. **Create Workflow**: Start connecting nodes!

---

**Thoughtorio** - Where ideas flow through intelligent hierarchies.