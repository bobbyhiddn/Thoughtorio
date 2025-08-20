// internal/embeddings/arc_embedding_service.go
package embeddings

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"sort"
	"sync"
)

// ArcEmbeddingService manages vector embeddings for Arc Weaver content (timelines, arcs, events)
type ArcEmbeddingService struct {
	db       *sql.DB
	provider EmbeddingProvider
	dbMutex  sync.Mutex
}

// ArcElement represents any Arc Weaver structure element
type ArcElement struct {
	ID          int64  `json:"id"`
	Type        string `json:"type"`        // "timeline", "arc", "event"
	Title       string `json:"title"`       // Name or title of the element
	Description string `json:"description"` // Content/description for embedding
	TimelineID  int64  `json:"timelineId"`  // Parent timeline ID
	ParentName  string `json:"parentName"`  // Name of parent element (for context)
}

// ArcSearchResult represents a search result from Arc Weaver embeddings
type ArcSearchResult struct {
	Element ArcElement
	Score   float32
}

// NewArcEmbeddingService creates a new Arc embedding service
func NewArcEmbeddingService(db *sql.DB, provider EmbeddingProvider) *ArcEmbeddingService {
	if provider == nil {
		log.Println("Warning: EmbeddingProvider is nil in NewArcEmbeddingService. Arc embeddings will be disabled.")
	}
	return &ArcEmbeddingService{
		db:       db,
		provider: provider,
	}
}

// CreateEmbedding delegates to the active provider
func (s *ArcEmbeddingService) CreateEmbedding(text string) ([]float32, error) {
	if s.provider == nil {
		return nil, fmt.Errorf("no embedding provider configured")
	}
	return s.provider.CreateEmbedding(text)
}

// ModelIdentifier delegates to the active provider
func (s *ArcEmbeddingService) ModelIdentifier() string {
	if s.provider == nil {
		return "unknown-provider"
	}
	return s.provider.ModelIdentifier()
}

// SaveArcEmbedding stores an embedding for an Arc Weaver element
func (s *ArcEmbeddingService) SaveArcEmbedding(elementType string, elementID int64, embedding []float32) error {
	if s.db == nil {
		return fmt.Errorf("database connection is nil")
	}
	if len(embedding) == 0 {
		return fmt.Errorf("cannot save empty embedding")
	}
	if s.provider == nil {
		return fmt.Errorf("no embedding provider configured for saving")
	}

	embeddingBytes := make([]byte, len(embedding)*4)
	for i, v := range embedding {
		binary.LittleEndian.PutUint32(embeddingBytes[i*4:], math.Float32bits(v))
	}

	s.dbMutex.Lock()
	defer s.dbMutex.Unlock()

	vectorVersion := s.provider.ModelIdentifier()

	_, err := s.db.Exec(
		`INSERT INTO arc_embeddings
         (element_type, element_id, embedding, vector_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(element_type, element_id, vector_version) DO UPDATE SET
             embedding = excluded.embedding,
             updated_at = datetime('now')`,
		elementType, elementID, embeddingBytes, vectorVersion,
	)
	if err != nil {
		log.Printf("ERROR saving arc embedding for %s ID %d (provider: %s): %v", elementType, elementID, vectorVersion, err)
		return fmt.Errorf("failed to save arc embedding to database: %w", err)
	}

	log.Printf("Saved arc embedding for %s ID %d (provider: %s)", elementType, elementID, vectorVersion)
	return nil
}

// GetArcEmbedding retrieves an embedding for an Arc Weaver element
func (s *ArcEmbeddingService) GetArcEmbedding(elementType string, elementID int64) ([]float32, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection is nil")
	}

	if s.provider == nil {
		return nil, fmt.Errorf("no embedding provider configured for retrieval")
	}
	vectorVersion := s.provider.ModelIdentifier()

	// Query database
	var embeddingBytes []byte
	err := s.db.QueryRow(
		"SELECT embedding FROM arc_embeddings WHERE element_type = ? AND element_id = ? AND vector_version = ?",
		elementType, elementID, vectorVersion,
	).Scan(&embeddingBytes)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no embedding found for %s %d", elementType, elementID)
		}
		return nil, fmt.Errorf("failed to retrieve arc embedding from database: %w", err)
	}

	// Deserialize from binary
	if len(embeddingBytes)%4 != 0 {
		log.Printf("Warning: Invalid arc embedding data length (%d bytes) for %s %d", len(embeddingBytes), elementType, elementID)
		return nil, fmt.Errorf("invalid arc embedding data length")
	}

	embedding := make([]float32, len(embeddingBytes)/4)
	for i := range embedding {
		embedding[i] = math.Float32frombits(binary.LittleEndian.Uint32(embeddingBytes[i*4:]))
	}

	return embedding, nil
}

// FindSimilarArcElements finds Arc Weaver elements similar to the query using cosine similarity
func (s *ArcEmbeddingService) FindSimilarArcElements(query string, limit int) ([]ArcSearchResult, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection is nil")
	}
	if s.provider == nil {
		return nil, fmt.Errorf("no embedding provider configured")
	}

	// Generate embedding for query
	queryEmbedding, err := s.CreateEmbedding(query)
	if err != nil {
		log.Printf("ERROR in FindSimilarArcElements: failed to create query embedding: %v", err)
		return nil, fmt.Errorf("failed to create query embedding: %w", err)
	}

	vectorVersion := s.provider.ModelIdentifier()

	// Get all Arc elements with embeddings - simplified approach
	rows, err := s.db.Query(`
		SELECT element_type, element_id, embedding
		FROM arc_embeddings 
		WHERE vector_version = ?`, vectorVersion)
	if err != nil {
		log.Printf("ERROR in FindSimilarArcElements: failed to query arc elements with embeddings: %v", err)
		return nil, fmt.Errorf("failed to query arc elements with embeddings: %w", err)
	}
	defer rows.Close()

	var results []ArcSearchResult

	for rows.Next() {
		var elementType string
		var elementID int64
		var embeddingBytes sql.RawBytes

		err := rows.Scan(&elementType, &elementID, &embeddingBytes)
		if err != nil {
			log.Printf("Warning: Failed to scan arc element row during search: %v", err)
			continue
		}

		// Check if embedding is NULL
		if embeddingBytes == nil {
			continue // Skip elements without embeddings
		}

		// Get element details based on type
		element, err := s.getElementDetails(elementType, elementID)
		if err != nil {
			log.Printf("Warning: Failed to get details for %s ID %d: %v", elementType, elementID, err)
			continue
		}

		// Deserialize embedding
		elementEmbedding := deserializeEmbedding(embeddingBytes)
		if len(elementEmbedding) == 0 {
			continue // Skip invalid embeddings
		}

		// Calculate similarity
		similarity := cosineSimilarity(queryEmbedding, elementEmbedding)

		// Only include results if similarity is valid
		if !math.IsNaN(float64(similarity)) {
			results = append(results, ArcSearchResult{
				Element: element,
				Score:   similarity,
			})
		}
	}

	if err = rows.Err(); err != nil {
		log.Printf("Warning: Error during row iteration in FindSimilarArcElements: %v", err)
	}

	// Sort by similarity (highest first)
	sort.Slice(results, func(i, j int) bool {
		if math.IsNaN(float64(results[i].Score)) {
			return false
		}
		if math.IsNaN(float64(results[j].Score)) {
			return true
		}
		return results[i].Score > results[j].Score
	})

	// Limit results
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// getElementDetails retrieves detailed information for an arc element
func (s *ArcEmbeddingService) getElementDetails(elementType string, elementID int64) (ArcElement, error) {
	var element ArcElement
	element.Type = elementType
	element.ID = elementID

	switch elementType {
	case "timeline":
		err := s.db.QueryRow("SELECT name, description FROM timelines WHERE id = ?", elementID).Scan(
			&element.Title, &element.Description)
		if err != nil {
			return element, err
		}
		element.TimelineID = elementID
		element.ParentName = ""

	case "arc":
		var timelineID int64
		err := s.db.QueryRow(`
			SELECT a.name, a.description, a.timeline_id, t.name 
			FROM arcs a 
			JOIN timelines t ON a.timeline_id = t.id 
			WHERE a.id = ?`, elementID).Scan(
			&element.Title, &element.Description, &timelineID, &element.ParentName)
		if err != nil {
			return element, err
		}
		element.TimelineID = timelineID

	case "event":
		var timelineID int64
		err := s.db.QueryRow(`
			SELECT e.title, e.description, a.timeline_id, a.name 
			FROM arc_events e 
			JOIN arcs a ON e.arc_id = a.id 
			WHERE e.id = ?`, elementID).Scan(
			&element.Title, &element.Description, &timelineID, &element.ParentName)
		if err != nil {
			return element, err
		}
		element.TimelineID = timelineID

	default:
		return element, fmt.Errorf("unknown element type: %s", elementType)
	}

	return element, nil
}

// GenerateMissingArcEmbeddings generates embeddings for Arc elements that don't have them
func (s *ArcEmbeddingService) GenerateMissingArcEmbeddings() error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if s.provider == nil {
		log.Println("Skipping GenerateMissingArcEmbeddings: No embedding provider configured.")
		return nil
	}

	vectorVersion := s.provider.ModelIdentifier()
	log.Printf("Starting background check for missing arc embeddings for provider: %s", vectorVersion)

	// Find timelines without embeddings
	timelineRows, err := s.db.Query(`
		SELECT t.id, t.name, t.description
		FROM timelines t
		LEFT JOIN arc_embeddings ae ON ae.element_type = 'timeline' AND ae.element_id = t.id AND ae.vector_version = ?
		WHERE ae.id IS NULL
	`, vectorVersion)
	if err != nil {
		return fmt.Errorf("failed to query timelines missing embeddings: %w", err)
	}
	defer timelineRows.Close()

	// Process timelines
	for timelineRows.Next() {
		var id int64
		var name, description string
		if err := timelineRows.Scan(&id, &name, &description); err != nil {
			log.Printf("Error scanning timeline row: %v", err)
			continue
		}

		// Create embedding text from name + description
		embeddingText := name
		if description != "" {
			embeddingText += "\n\n" + description
		}

		embedding, err := s.CreateEmbedding(embeddingText)
		if err != nil {
			log.Printf("Failed to create embedding for timeline %d (%s): %v", id, name, err)
			continue
		}

		if err := s.SaveArcEmbedding("timeline", id, embedding); err != nil {
			log.Printf("Failed to save embedding for timeline %d (%s): %v", id, name, err)
		}
	}

	// Find arcs without embeddings
	arcRows, err := s.db.Query(`
		SELECT a.id, a.name, a.description
		FROM arcs a
		LEFT JOIN arc_embeddings ae ON ae.element_type = 'arc' AND ae.element_id = a.id AND ae.vector_version = ?
		WHERE ae.id IS NULL
	`, vectorVersion)
	if err != nil {
		return fmt.Errorf("failed to query arcs missing embeddings: %w", err)
	}
	defer arcRows.Close()

	// Process arcs
	for arcRows.Next() {
		var id int64
		var name, description string
		if err := arcRows.Scan(&id, &name, &description); err != nil {
			log.Printf("Error scanning arc row: %v", err)
			continue
		}

		embeddingText := name
		if description != "" {
			embeddingText += "\n\n" + description
		}

		embedding, err := s.CreateEmbedding(embeddingText)
		if err != nil {
			log.Printf("Failed to create embedding for arc %d (%s): %v", id, name, err)
			continue
		}

		if err := s.SaveArcEmbedding("arc", id, embedding); err != nil {
			log.Printf("Failed to save embedding for arc %d (%s): %v", id, name, err)
		}
	}

	// Find events without embeddings
	eventRows, err := s.db.Query(`
		SELECT e.id, e.title, e.description
		FROM arc_events e
		LEFT JOIN arc_embeddings ae ON ae.element_type = 'event' AND ae.element_id = e.id AND ae.vector_version = ?
		WHERE ae.id IS NULL
	`, vectorVersion)
	if err != nil {
		return fmt.Errorf("failed to query events missing embeddings: %w", err)
	}
	defer eventRows.Close()

	// Process events
	for eventRows.Next() {
		var id int64
		var title, description string
		if err := eventRows.Scan(&id, &title, &description); err != nil {
			log.Printf("Error scanning event row: %v", err)
			continue
		}

		embeddingText := title
		if description != "" {
			embeddingText += "\n\n" + description
		}

		embedding, err := s.CreateEmbedding(embeddingText)
		if err != nil {
			log.Printf("Failed to create embedding for event %d (%s): %v", id, title, err)
			continue
		}

		if err := s.SaveArcEmbedding("event", id, embedding); err != nil {
			log.Printf("Failed to save embedding for event %d (%s): %v", id, title, err)
		}
	}

	log.Printf("Completed generating missing arc embeddings for provider: %s", vectorVersion)
	return nil
}

// GetAllArcElements retrieves all Arc Weaver elements for display/search purposes
func (s *ArcEmbeddingService) GetAllArcElements() ([]ArcElement, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database connection is nil")
	}

	rows, err := s.db.Query(`
		SELECT 'timeline' as type, t.id, t.name as title, t.description, t.id as timeline_id, '' as parent_name
		FROM timelines t
		UNION ALL
		SELECT 'arc' as type, a.id, a.name as title, a.description, a.timeline_id, tt.name as parent_name
		FROM arcs a
		JOIN timelines tt ON a.timeline_id = tt.id
		UNION ALL  
		SELECT 'event' as type, e.id, e.title, e.description, ta.timeline_id, aa.name as parent_name
		FROM arc_events e
		JOIN arcs aa ON e.arc_id = aa.id
		JOIN timelines ta ON aa.timeline_id = ta.id
		ORDER BY type, timeline_id, id
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query arc elements: %w", err)
	}
	defer rows.Close()

	var elements []ArcElement
	for rows.Next() {
		var element ArcElement
		err := rows.Scan(&element.Type, &element.ID, &element.Title, &element.Description, &element.TimelineID, &element.ParentName)
		if err != nil {
			log.Printf("Error scanning arc element: %v", err)
			continue
		}
		elements = append(elements, element)
	}

	return elements, nil
}