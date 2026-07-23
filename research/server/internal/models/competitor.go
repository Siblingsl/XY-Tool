package models

import (
	"github.com/google/uuid"
)

// ResearchCompetitorWatch is a keyword the tenant wants to monitor against
// project card_json (name + competitors). ID/TenantID/CreatedAt/UpdatedAt are
// provided by the embedded ResearchBase.
type ResearchCompetitorWatch struct {
	ResearchBase
	UserID     *int64  `gorm:"column:user_id;type:bigint" json:"userId"`
	Keyword    string  `gorm:"column:keyword;size:255;not null" json:"keyword"`
	MatchScope string  `gorm:"column:match_scope;size:20;not null;default:'all'" json:"matchScope"`
	Enabled    bool    `gorm:"column:enabled;not null;default:true" json:"enabled"`
}

func (ResearchCompetitorWatch) TableName() string { return "research_competitor_watches" }

// ResearchCompetitorHit records a single match of a watch keyword against a
// project. Used both as an audit trail and as a de-duplication source.
type ResearchCompetitorHit struct {
	ResearchBase
	WatchID      uuid.UUID `gorm:"column:watch_id;type:uuid;not null;index" json:"watchId"`
	ProjectID    uuid.UUID `gorm:"column:project_id;type:uuid;not null;index" json:"projectId"`
	Keyword      string    `gorm:"column:keyword;size:255;not null" json:"keyword"`
	MatchScope   string    `gorm:"column:match_scope;size:20;not null" json:"matchScope"`
	MatchedField string    `gorm:"column:matched_field;size:30" json:"matchedField"`
}

func (ResearchCompetitorHit) TableName() string { return "research_competitor_hits" }
