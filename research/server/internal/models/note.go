package models

import (
	"github.com/google/uuid"
)

// ResearchProjectNote is a free-form note attached to a project.
// ID/TenantID/CreatedAt/UpdatedAt are provided by the embedded ResearchBase.
type ResearchProjectNote struct {
	ResearchBase
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index" json:"projectId"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	UserID    *int64    `gorm:"type:bigint" json:"userId"`
}

func (ResearchProjectNote) TableName() string { return "research_project_notes" }
