package models

import (
	"github.com/google/uuid"
)

// ResearchProjectTag is a lightweight label attached to a project by a tenant/user.
// Uniqueness on (tenant_id, project_id, tag) is enforced by migration 002.
// ID/TenantID/CreatedAt/UpdatedAt are provided by the embedded ResearchBase.
type ResearchProjectTag struct {
	ResearchBase
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index" json:"projectId"`
	Tag       string    `gorm:"type:varchar(60);not null" json:"tag"`
	UserID    *int64    `gorm:"type:bigint" json:"userId"`
}

func (ResearchProjectTag) TableName() string { return "research_project_tags" }
