// internal/context/builder.go
package context

import (
	"Llore/internal/embeddings" // Use the embeddings package
	"fmt"
	"log" // Added for logging
	"sort"
	"strings"
)

// UnifiedSearchResult represents a search result from either Codex or Arc Weaver
type UnifiedSearchResult struct {
	Type        string  // "codex" or "arc"
	Name        string  // Entry name or element title
	Content     string  // Entry content or element description
	Score       float32 // Similarity score
	ElementType string  // For arc results: "timeline", "arc", "event"
	ParentName  string  // For arc results: parent context
}

// ContextBuilder builds context for LLM prompts using embeddings
type ContextBuilder struct {
	embeddingService    *embeddings.EmbeddingService
	arcEmbeddingService *embeddings.ArcEmbeddingService
	maxEntries          int     // Max number of entries to retrieve
	similarityThreshold float32 // Minimum similarity score to include
}

// NewContextBuilder creates a new context builder
func NewContextBuilder(embeddingService *embeddings.EmbeddingService) *ContextBuilder {
	if embeddingService == nil {
		log.Fatal("FATAL: EmbeddingService cannot be nil in NewContextBuilder") // Use Fatal as this is critical
	}
	return &ContextBuilder{
		embeddingService:    embeddingService,
		arcEmbeddingService: nil, // Will be set separately
		maxEntries:          20,  // Default max entries (increased from 10)
		similarityThreshold: 0.4, // Default minimum similarity score
	}
}

// SetArcEmbeddingService sets the Arc Weaver embedding service
func (b *ContextBuilder) SetArcEmbeddingService(arcEmbeddingService *embeddings.ArcEmbeddingService) {
	b.arcEmbeddingService = arcEmbeddingService
}

// SetMaxEntries allows customizing the maximum number of context entries
func (b *ContextBuilder) SetMaxEntries(max int) {
	if max > 0 {
		b.maxEntries = max
	}
}

// SetSimilarityThreshold allows customizing the minimum similarity score
func (b *ContextBuilder) SetSimilarityThreshold(threshold float32) {
	if threshold >= 0.0 && threshold <= 1.0 {
		b.similarityThreshold = threshold
	}
}

// BuildContextForQuery creates a context string based on similarity search results from both Codex and Arc Weaver
func (b *ContextBuilder) BuildContextForQuery(query string) (string, error) {
	if b.embeddingService == nil {
		return "", fmt.Errorf("embedding service is not initialized in ContextBuilder")
	}

	var allResults []UnifiedSearchResult

	// Search Codex entries
	codexResults, err := b.embeddingService.FindSimilarEntries(query, b.maxEntries)
	if err != nil {
		log.Printf("Warning: Failed to find similar Codex entries for context: %v", err)
	} else {
		// Convert Codex results to unified format
		for _, result := range codexResults {
			allResults = append(allResults, UnifiedSearchResult{
				Type:    "codex",
				Name:    result.Entry.Name,
				Content: result.Entry.Content,
				Score:   result.Score,
			})
		}
	}

	// Search Arc Weaver elements if service is available
	if b.arcEmbeddingService != nil {
		arcResults, err := b.arcEmbeddingService.FindSimilarArcElements(query, b.maxEntries)
		if err != nil {
			log.Printf("Warning: Failed to find similar Arc elements for context: %v", err)
		} else {
			// Convert Arc results to unified format
			for _, result := range arcResults {
				allResults = append(allResults, UnifiedSearchResult{
					Type:        "arc",
					Name:        result.Element.Title,
					Content:     result.Element.Description,
					Score:       result.Score,
					ElementType: result.Element.Type,
					ParentName:  result.Element.ParentName,
				})
			}
		}
	}

	// Sort all results by score descending (most similar first)
	sort.Slice(allResults, func(i, j int) bool {
		return allResults[i].Score > allResults[j].Score
	})

	// Build context string
	var sb strings.Builder
	includedCount := 0
	var includedEntryInfo []string
	codexCount := 0
	arcCount := 0

	if len(allResults) == 0 {
		log.Println("No relevant context found for query.")
		return "", nil
	}

	sb.WriteString("CONTEXT INFORMATION (ordered by relevance, including both lore and plot elements):\n")

	// Include up to maxEntries results above the threshold
	for _, result := range allResults {
		if includedCount >= b.maxEntries {
			break
		}

		// Skip entries below the similarity threshold
		if result.Score < b.similarityThreshold {
			break
		}

		// Add entry to context string with appropriate formatting
		sb.WriteString(fmt.Sprintf("--- %s Start ---\n", strings.Title(result.Type)))
		
		if result.Type == "codex" {
			sb.WriteString(fmt.Sprintf("Name: %s (Lore Entry)\n", result.Name))
			sb.WriteString(fmt.Sprintf("Content:\n%s\n", result.Content))
			codexCount++
		} else {
			// Arc Weaver element
			contextInfo := result.Name
			if result.ParentName != "" {
				contextInfo += fmt.Sprintf(" (from %s)", result.ParentName)
			}
			sb.WriteString(fmt.Sprintf("Story Element: %s (%s)\n", contextInfo, strings.Title(result.ElementType)))
			sb.WriteString(fmt.Sprintf("Description:\n%s\n", result.Content))
			arcCount++
		}
		
		sb.WriteString(fmt.Sprintf("(Relevance Score: %.2f)\n", result.Score))
		sb.WriteString(fmt.Sprintf("--- %s End ---\n\n", strings.Title(result.Type)))

		includedCount++
		entryTypePrefix := ""
		if result.Type == "arc" {
			entryTypePrefix = fmt.Sprintf("[%s] ", result.ElementType)
		}
		includedEntryInfo = append(includedEntryInfo, fmt.Sprintf("%s%s (Score: %.2f)", entryTypePrefix, result.Name, result.Score))
	}

	if includedCount == 0 {
		log.Println("No entries met the similarity threshold for the query.")
		return "", nil
	}

	// Add timeline creation guidance for any timeline-related queries
	sb.WriteString("\n--- SPECIAL INSTRUCTIONS ---\n")
	sb.WriteString("For timeline creation requests, use this exact Arc Weaver format:\n\n")
	sb.WriteString("# Timeline: [Story Name]\n\n")
	sb.WriteString("*Duration: [timespan]*\n\n")
	sb.WriteString("[Timeline description]\n\n")
	sb.WriteString("## Arc: [Arc Name]\n\n")
	sb.WriteString("*Duration: [timespan]*\n\n")
	sb.WriteString("[Arc description]\n\n")
	sb.WriteString("### Chapter [N]: [Chapter Title]\n\n")
	sb.WriteString("*Time: [when it happens]*\n")
	sb.WriteString("*Participants: [[Character1]], [[Character2]]*\n\n")
	sb.WriteString("[Chapter/scene description]\n\n")
	sb.WriteString("IMPORTANT: The system will automatically detect and create timelines when you use this format!\n")
	sb.WriteString("--- END INSTRUCTIONS ---\n")

	// Format the included entries as a bulleted list for logging
	formattedEntries := "\n - " + strings.Join(includedEntryInfo, "\n - ")
	log.Printf("Built unified context with %d entries (%d codex, %d arc) for query:%s", 
		includedCount, codexCount, arcCount, formattedEntries)
	
	return sb.String(), nil
}
