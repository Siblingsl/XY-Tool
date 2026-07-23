package models

import (
	"github.com/google/uuid"
	"github.com/lib/pq"
)

// ResearchKnowledgeItem is a curated knowledge card authored manually or
// distilled from a research project. Tenant-scoped; optionally linked to a
// project via ProjectID. ID/TenantID/CreatedAt/UpdatedAt come from ResearchBase.
type ResearchKnowledgeItem struct {
	ResearchBase
	Title     string         `gorm:"type:varchar(255);not null" json:"title"`
	Content   string         `gorm:"type:text;not null" json:"content"`
	Tags      pq.StringArray `gorm:"column:tags;type:text[]" json:"tags"`
	Source    string         `gorm:"type:varchar(40);not null;default:manual" json:"source"`
	ProjectID *uuid.UUID     `gorm:"column:project_id;type:uuid;index" json:"projectId"`
}

func (ResearchKnowledgeItem) TableName() string { return "research_knowledge_items" }
