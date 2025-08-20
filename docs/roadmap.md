# Thoughtorio Development Roadmap

## Project Vision

Transform the existing Go-based story writing "legos" into a lightweight, AI-powered infinite canvas tool for building "thought factories" - visual workflows that compute insights through connected nodes and AI generation.

## Development Phases

### Phase 1: Foundation (MVP) 🚀
**Goal**: Basic working canvas with core functionality
**Timeline**: 2-3 weeks

#### Core Features
- ✅ Architecture documentation
- ⏳ Basic Go HTTP server with routing
- ⏳ Canvas database schema implementation
- ⏳ Simple web frontend with HTML5 Canvas
- ⏳ Basic node types (Input, Dynamic)
- ⏳ Simple node connections
- ⏳ Play button workflow execution

#### Technical Milestones
1. **Backend Setup**
   - HTTP server with Gorilla Mux or similar
   - Canvas database manager using existing database lego
   - Basic CRUD API for nodes and connections
   
2. **Frontend MVP**
   - HTML page with Canvas element
   - Drag & drop node creation
   - Basic node rendering and positioning
   - Simple connection drawing

3. **Workflow Engine**
   - Dependency graph resolution
   - Simple execution for Input → Dynamic node chains
   - Basic LLM integration using existing llm lego

#### Success Criteria
- Can create a workflow: `[Input: "me"] → [Dynamic: AI output]`
- Play button generates coherent AI response
- Nodes persist across page reloads

---

### Phase 2: Intelligence (RAG Integration) 🧠
**Goal**: Context-aware AI generation using embeddings
**Timeline**: 2-3 weeks

#### Core Features
- ⏳ RAG system integration using existing embeddings lego
- ⏳ Node content indexing and search
- ⏳ Context-aware dynamic node generation
- ⏳ Execution history tracking
- ⏳ Improved UI/UX for canvas interactions

#### Technical Milestones
1. **RAG Implementation**
   - Automatic embedding generation for all node content
   - Similarity search for workflow context
   - Context injection into LLM prompts

2. **Enhanced Execution**
   - Multi-node context gathering
   - Execution history and caching
   - Error handling and graceful degradation

3. **UI Improvements**
   - Node styling and theming
   - Loading states during generation
   - Basic zoom and pan functionality

#### Success Criteria
- Dynamic nodes use relevant context from other canvas nodes
- Can handle complex workflows with 5+ connected nodes
- Generated content shows clear contextual awareness

---

### Phase 3: Advanced Workflows (Node Variety) ⚡
**Goal**: Rich node ecosystem with logic and transformation
**Timeline**: 3-4 weeks

#### Core Features
- ⏳ Static nodes for reference content
- ⏳ Connector nodes (Combine, Filter, Transform)
- ⏳ Conditional logic and branching
- ⏳ Multi-port node connections
- ⏳ Canvas organization tools (grouping, layers)

#### Technical Milestones
1. **Node Type Expansion**
   - Static node implementation
   - Connector node framework
   - Multi-input/output support

2. **Advanced Execution**
   - Parallel execution where possible
   - Conditional node processing
   - Loop detection and prevention

3. **Canvas Management**
   - Node grouping and organization
   - Canvas metadata and properties
   - Workflow templates

#### Success Criteria
- Can build complex logical workflows with branching
- Connector nodes properly transform and combine data
- Canvas remains performant with 20+ nodes

---

### Phase 4: User Experience (Polish & Sharing) ✨
**Goal**: Production-ready tool with collaboration features
**Timeline**: 3-4 weeks

#### Core Features
- ⏳ Canvas sharing and collaboration
- ⏳ Workflow import/export
- ⏳ Template library
- ⏳ Advanced canvas navigation
- ⏳ Performance optimizations

#### Technical Milestones
1. **Collaboration**
   - Multi-user canvas access
   - Real-time updates (WebSocket)
   - Version control for workflows

2. **Data Portability**
   - JSON export/import
   - Template system
   - Integration with story writing tools

3. **Performance & Polish**
   - Canvas virtualization for large workflows
   - Advanced UI components
   - Mobile responsiveness

#### Success Criteria
- Multiple users can collaborate on same canvas
- Workflows can be shared and reused as templates
- Tool feels polished and professional

---

### Phase 5: Ecosystem (Extensions & Integrations) 🔌
**Goal**: Extensible platform with plugin support
**Timeline**: 4-6 weeks

#### Core Features
- ⏳ Plugin architecture for custom nodes
- ⏳ External API integrations
- ⏳ Advanced RAG with external knowledge bases
- ⏳ Workflow automation and scheduling
- ⏳ Analytics and insights

#### Technical Milestones
1. **Extensibility**
   - Go plugin system for backend nodes
   - JavaScript plugin system for frontend
   - Plugin marketplace/registry

2. **Integrations**
   - REST API connectors
   - Database connectors
   - File system integrations
   - Third-party AI services

3. **Enterprise Features**
   - User management and permissions
   - Audit logging
   - Backup and recovery
   - Performance monitoring

#### Success Criteria
- Third-party developers can create custom node types
- Workflows can integrate with external systems
- Tool suitable for team/enterprise deployment

---

## Technical Dependencies

### Existing Legos (Reused)
- ✅ **Database module**: Canvas persistence
- ✅ **Embeddings module**: RAG system
- ✅ **LLM module**: AI generation
- ✅ **Arc parser**: Potential workflow serialization

### New Components (To Build)
- ⏳ **Canvas manager**: Database and workflow orchestration
- ⏳ **Node execution engine**: Workflow processing
- ⏳ **HTTP API**: Frontend-backend communication
- ⏳ **Web frontend**: Infinite canvas interface

### External Dependencies
- **Frontend**: HTML5 Canvas or SVG libraries (Fabric.js, Konva.js)
- **HTTP**: Gorilla Mux or Gin for Go routing
- **WebSocket**: For real-time collaboration (Phase 4)
- **Auth**: JWT or session-based authentication (Phase 4+)

---

## Development Methodology

### Incremental Approach
- Each phase builds on the previous
- Regular user testing and feedback integration
- Continuous refactoring using Go best practices

### Quality Assurance
- Unit tests for all core modules
- Integration tests for API endpoints
- Frontend testing with Cypress or similar
- Performance benchmarking for large canvases

### Documentation
- Keep architecture docs updated
- API documentation with examples
- User guides and tutorials
- Plugin development documentation (Phase 5)

---

## Success Metrics

### Technical Metrics
- **Performance**: Canvas with 100+ nodes remains responsive
- **Reliability**: 99.9% uptime for canvas operations
- **Scalability**: Support multiple concurrent users

### User Experience Metrics
- **Usability**: New users can create first workflow in < 5 minutes
- **Engagement**: Users create workflows with 10+ nodes regularly
- **Adoption**: Tool becomes part of daily workflow

### Business Metrics
- **Growth**: Active user base expansion
- **Retention**: Users return weekly to build workflows
- **Extension**: Third-party plugin development (Phase 5)

---

## Risk Mitigation

### Technical Risks
- **Canvas Performance**: Implement virtualization early
- **AI Generation Quality**: Continuous prompt engineering and testing
- **Database Scalability**: Monitor and optimize query performance

### Product Risks
- **User Adoption**: Regular user testing and feedback loops
- **Feature Complexity**: Keep MVP simple, add complexity incrementally
- **Platform Dependencies**: Maintain compatibility with existing legos

### Timeline Risks
- **Scope Creep**: Strict phase boundaries and feature freeze periods
- **Technical Debt**: Regular refactoring sprints
- **Integration Challenges**: Early prototyping of complex integrations