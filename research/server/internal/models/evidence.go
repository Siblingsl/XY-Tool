package models

import (
	"time"

	"github.com/google/uuid"
)

type ResearchEvidence struct {
	ResearchBase
	ProjectID uuid.UUID `gorm:"column:project_id;type:uuid;not null;index" json:"projectId"`
	Source    string    `gorm:"size:50;not null" json:"source"`
	URL       string    `gorm:"type:text;not null" json:"url"`
	Claim     string    `gorm:"size:100;not null" json:"claim"`
	Value     string    `gorm:"type:text;not null" json:"value"`
	Snippet   *string   `gorm:"type:text" json:"snippet"`
	FetchedAt time.Time `gorm:"column:fetched_at;not null" json:"fetchedAt"`
}

func (ResearchEvidence) TableName() string { return "research_evidences" }

type ResearchCompetitor struct {
	ResearchBase
	ProjectID uuid.UUID `gorm:"column:project_id;type:uuid;not null;index" json:"projectId"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	URL       *string   `gorm:"size:500" json:"url"`
	Notes     *string   `gorm:"type:text" json:"notes"`
}

func (ResearchCompetitor) TableName() string { return "research_competitors" }

type ResearchHeatPoint struct {
	ResearchBase
	ProjectID uuid.UUID `gorm:"column:project_id;type:uuid;not null;index" json:"projectId"`
	Date      time.Time `gorm:"type:date;not null" json:"date"`
	Metric    string    `gorm:"size:50;not null" json:"metric"`
	Value     float64   `gorm:"not null" json:"value"`
}

func (ResearchHeatPoint) TableName() string { return "research_heat_points" }
