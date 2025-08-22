# Thoughtorio - Node-Based Content Creation Platform

Thoughtorio is a powerful, visual node-based platform for creating complex content workflows using AI and structured data processing. Build everything from simple content generators to sophisticated multi-stage processing pipelines with a fully functional context engine and real-time execution feedback.

## 🌟 Core Concepts

### Nodes
Individual processing units that handle content transformation:

- **📄 Static Nodes**: Immutable content sources that provide fixed data
- **✏️ Input Nodes**: User input processors that can envelope and wrap content  
- **🤖 AI Nodes**: Dynamic processors that transform content using AI models

### Node Machines (Workflow Containers)
Groups of connected nodes that work together as unified processing units. Node machines can themselves be connected to other machines, creating a powerful node factory system.

### YAML Backend
Every node maintains a structured YAML configuration containing:
- Content and metadata
- Input/output relationships  
- Processing parameters
- Complete execution history
- Context preservation chains

## 🚀 Key Features

### Visual Workflow Builder
- **Drag & Drop Interface**: Create nodes and connections visually
- **Real-time Execution**: See processing flow with visual indicators
- **Zoom & Pan**: Navigate large workflows smoothly
- **Box Selection**: Select and manipulate multiple nodes

### Context Menus & Clipboard
Right-click any node or node machine for:
- **📄 Copy Text**: Extract content to clipboard
- **⚙️ Copy Config**: Copy complete YAML configuration
- **📋 Paste Config**: Apply configurations to other nodes
- **🗑️ Delete**: Remove nodes or entire machines

### Advanced Data Flow
- **Multi-Input Support**: Nodes can receive and process multiple inputs
- **Context Preservation**: Complete lineage tracking through processing chains
- **Type Safety**: Node type rules enforced at the data level
- **Data Propagation**: Changes automatically flow through connections

### Node Factory System
- **Machine Ports**: Node machines have input/output ports
- **Machine-to-Machine**: Connect entire workflows together
- **Hierarchical Processing**: Build complex multi-level systems
- **Execution Indicators**: Visual feedback for running processes

## 📋 Node Types & Behaviors

### Static Nodes
```yaml
node_type: static
content: "The story takes place in medieval times"
rules:
  - Cannot receive inputs
  - Immutable content
  - Output content as-is
```

### Input Nodes  
```yaml
node_type: input
content: "Generate a color"
processing:
  envelope_style: "prompt_wrapper"
  wrapper_template: "Context: {inputs}\nTask: {content}"
rules:
  - Can receive multiple inputs
  - Envelope/wrap inputs with templates
  - Process and transform data
```

### AI Nodes (Dynamic)
```yaml
node_type: dynamic
processing:
  type: "ai_completion"
  model: "gpt-4"
  parameters:
    temperature: 0.7
rules:
  - Transform inputs via AI processing
  - Maintain context chains
  - Support multiple AI providers
```

## 🔧 Technical Architecture

### Frontend Stack
- **Svelte**: Reactive UI framework
- **JavaScript**: Core application logic
- **YAML**: Structured data serialization
- **CSS**: Custom styling with animations

### Backend Integration
- **Wails v2**: Go backend with web frontend
- **Multi-Provider AI**: OpenAI, Gemini, OpenRouter, Local (Ollama)
- **File Management**: Canvas save/load functionality (.thoughtorio format)
- **Context Engine**: Complete workflow context preservation and lineage tracking
- **Execution State**: Real-time workflow execution monitoring

### Data Structures
```
Canvas
├── Nodes (Visual + YAML Backend)
├── Connections (Input/Output relationships)  
├── Node Machines (Grouped workflows)
├── Node Factories (Multi-machine containers)
├── Execution State (Real-time processing)
└── Context Engine (Complete data lineage)
```

## 🎯 Usage Examples

### Simple Color Generator
1. Create Static Node: "Medieval fantasy setting"
2. Create Input Node: "Generate a color" (connects to static)
3. Create AI Node: Connected to input node
4. Execute: AI generates contextual color description

### Complex Story Pipeline
1. Multiple Static Nodes: Character, setting, genre info
2. Input Nodes: Combine and structure the static content  
3. AI Nodes: Generate story elements, dialogue, descriptions
4. Group into Node Machine: Save entire pipeline as reusable unit
5. Connect Machines: Chain multiple story generators together

### Node Factory Workflow
```
[Setting Machine] → [Character Machine] → [Story Machine] → [Editor Machine]
     ↓                    ↓                   ↓              ↓
  World details      Character profiles   Story content   Final polish
```

## ⚡ Quick Start

### Creating Your First Workflow
1. **Add Nodes**: Right-click canvas → Add node type
2. **Connect Nodes**: Drag from output port to input port  
3. **Configure Content**: Double-click nodes to edit content
4. **Execute**: Click play button on workflow container

### Using Context Menus
- **Right-click Node**: Copy/paste configs, copy text, delete
- **Right-click Machine**: Copy all text, copy machine config, run/stop

### Keyboard Shortcuts
- **Delete**: Remove selected node
- **Escape**: Close context menus
- **Scroll**: Zoom in/out (centers on viewport)
- **Shift + Drag**: Pan canvas
- **Right-click + Drag**: Pan canvas

## 🔄 Data Flow Examples

### Single Chain Processing
```
Static("Setting") → Input("Prompt") → AI("Generate") → Output
```

### Multi-Input Processing  
```
Static("Character") ↘
                    Input("Combine") → AI("Story") → Output
Static("Setting")  ↗
```

### Machine-to-Machine
```
[World Builder] → [Character Creator] → [Story Generator]
```

## 📁 Project Structure

```
thoughtorio/
├── frontend/                 # Svelte web application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── Canvas.svelte         # Main canvas component
│   │   │   ├── Node.svelte          # Individual node component  
│   │   │   ├── WorkflowContainer.svelte  # Node machine/factory component
│   │   │   ├── NodeData.js          # YAML backend system
│   │   │   ├── ContextMenu.svelte   # Right-click menus
│   │   │   ├── ConfigPanel.svelte   # Node configuration viewer
│   │   │   └── clipboard.js         # Copy/paste utilities
│   │   ├── stores/
│   │   │   ├── nodes.js            # Node state management
│   │   │   ├── canvas.js           # Canvas viewport state  
│   │   │   ├── workflows.js        # Execution & machines
│   │   │   ├── executionState.js   # Real-time execution tracking
│   │   │   └── settings.js         # AI provider settings
│   │   └── assets/                # SVG cursors and icons
├── app.go                    # Go backend (Wails + AI providers)
├── main.go                   # Application entry point
├── NODE_ARCHITECTURE.md      # Technical specification
└── README.md                # This file
```

## 🔮 Future Roadmap

### Advanced Features
- **Node Templates**: Pre-built node configurations
- **Machine Library**: Shareable workflow components  
- **Version Control**: Git-like versioning for workflows
- **Collaborative Editing**: Real-time multi-user workflows
- **Plugin System**: Custom node types and processors

### Data & Export
- **Workflow Marketplace**: Share and discover workflows
- **Multiple Export Formats**: JSON, XML, CSV output
- **Batch Processing**: Run workflows on multiple inputs
- **Scheduling**: Automated workflow execution

### AI Integration
- **Model Fine-tuning**: Train custom models on workflow data
- **Smart Suggestions**: AI-powered workflow optimization
- **Auto-routing**: Intelligent connection suggestions
- **Performance Analytics**: Execution time and cost tracking

## 🤝 Contributing

Thoughtorio is built with extensibility in mind. The YAML backend system makes it easy to add new node types, and the modular architecture supports custom processors and integrations.

### Adding New Node Types
1. Define behavior rules in `NODE_ARCHITECTURE.md`
2. Extend `NodeData.js` with factory methods
3. Update `Node.svelte` for visual representation  
4. Add processing logic in `workflows.js`

### Architecture Principles
- **Separation of Concerns**: Visual layer + data layer + processing layer
- **Type Safety**: Enforce node rules at the data level
- **Context Preservation**: Maintain complete data lineage
- **Composability**: Enable hierarchical workflow construction

---

**Thoughtorio** transforms content creation from linear processes into visual, interactive systems. Build once, use everywhere, connect everything. 🚀