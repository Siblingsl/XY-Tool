package models

import (
	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/datatypes"
)

type ResearchCluster struct {
	ResearchBase
	Key        string          `gorm:"size:100;not null" json:"key"`
	Label      string          `gorm:"size:255;not null" json:"label"`
	ProjectIDs pq.StringArray  `gorm:"column:project_ids;type:uuid[]" json:"projectIds"`
}

func (ResearchCluster) TableName() string { return "research_clusters" }

type ResearchProject struct {
	ResearchBase
	EmailID            uuid.UUID      `gorm:"column:email_id;type:uuid;not null" json:"emailId"`
	ClusterID          *uuid.UUID     `gorm:"column:cluster_id;type:uuid;index" json:"clusterId"`
	CardJSON           datatypes.JSON `gorm:"column:card_json;type:jsonb" json:"cardJson"`
	VerifyStatus       string         `gorm:"column:verify_status;size:30;default:pending" json:"verifyStatus"`
	FeasibilityIndex   *int           `gorm:"column:feasibility_index" json:"feasibilityIndex"`
	Verdict            *string        `gorm:"size:10;index" json:"verdict"`
	AuthenticityStars  *int           `gorm:"column:authenticity_stars" json:"authenticityStars"`
	Lifecycle          *string        `gorm:"size:20" json:"lifecycle"`
	MvpPlanJSON        datatypes.JSON `gorm:"column:mvp_plan_json;type:jsonb" json:"mvpPlanJson"`
	ScoreJSON          datatypes.JSON `gorm:"column:score_json;type:jsonb" json:"scoreJson"`
	Summary            *string        `gorm:"size:500" json:"summary"`
	Stars              *int           `json:"stars"`
}

func (ResearchProject) TableName() string { return "research_projects" }
