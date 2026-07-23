package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/datatypes"
)

type ResearchDailyReport struct {
	ResearchBase
	ReportDate  time.Time      `gorm:"column:report_date;type:date;not null" json:"reportDate"`
	SummaryJSON datatypes.JSON `gorm:"column:summary_json;type:jsonb" json:"summaryJson"`
	BodyMD      *string        `gorm:"column:body_md;type:text" json:"bodyMd"`
	ProjectIDs  UUIDArray `gorm:"column:project_ids;type:uuid[]" json:"projectIds"`
}

func (ResearchDailyReport) TableName() string { return "research_daily_reports" }

type ResearchPipelineJob struct {
	ResearchBase
	EmailID    *uuid.UUID `gorm:"column:email_id;type:uuid;index" json:"emailId"`
	ProjectID  *uuid.UUID `gorm:"column:project_id;type:uuid;index" json:"projectId"`
	Stage      string     `gorm:"size:20;not null;index" json:"stage"`
	Status     string     `gorm:"size:20;default:queued;index" json:"status"`
	Error      *string    `gorm:"type:text" json:"error"`
	StartedAt  *time.Time `gorm:"column:started_at" json:"startedAt"`
	FinishedAt *time.Time `gorm:"column:finished_at" json:"finishedAt"`
}

func (ResearchPipelineJob) TableName() string { return "research_pipeline_jobs" }

type ResearchSettings struct {
	ResearchBase
	MarketingKeywords    pq.StringArray `gorm:"column:marketing_keywords;type:text[]" json:"marketingKeywords"`
	ReportCronLocal      string         `gorm:"column:report_cron_local;size:10;default:21:00" json:"reportCronLocal"`
	EnabledVerifySources pq.StringArray `gorm:"column:enabled_verify_sources;type:text[]" json:"enabledVerifySources"`
}

func (ResearchSettings) TableName() string { return "research_settings" }
