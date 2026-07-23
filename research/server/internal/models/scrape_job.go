package models

import "time"

// ResearchScrapeJob defines a webpage to be scraped periodically and persisted
// into the knowledge base as a web-sourced card. Tenant-scoped. The scheduler
// (internal/research/scheduler.go) runs enabled jobs whose interval has elapsed.
type ResearchScrapeJob struct {
	ResearchBase
	URL             string     `gorm:"type:varchar(1024);not null" json:"url"`
	Title           string     `gorm:"type:varchar(255)" json:"title"`
	IntervalMinutes int        `gorm:"not null;default:1440" json:"intervalMinutes"`
	Enabled         bool       `gorm:"not null;default:true" json:"enabled"`
	LastRunAt       *time.Time `json:"lastRunAt"`
	LastStatus      string     `gorm:"type:varchar(40);not null;default:pending" json:"lastStatus"`
	LastError       string     `gorm:"type:text" json:"lastError"`
}

func (ResearchScrapeJob) TableName() string { return "research_scrape_jobs" }
