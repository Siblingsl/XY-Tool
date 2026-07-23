package research

import (
	"log"
	"time"

	"github.com/lib/pq"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"gorm.io/gorm"
)

// StartScheduler launches a background goroutine that periodically runs enabled
// scrape jobs whose interval has elapsed. Failures are logged and recorded on
// the job but never crash the loop.
func StartScheduler(db *gorm.DB) {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			runDueScrapeJobs(db)
		}
	}()
}

func runDueScrapeJobs(db *gorm.DB) {
	now := time.Now()
	var jobs []models.ResearchScrapeJob
	if err := db.Where("enabled = ?", true).Find(&jobs).Error; err != nil {
		log.Printf("scrape scheduler: list jobs failed: %v", err)
		return
	}
	for _, job := range jobs {
		if job.LastStatus == "running" {
			continue
		}
		if job.LastRunAt != nil && now.Sub(*job.LastRunAt) < time.Duration(job.IntervalMinutes)*time.Minute {
			continue
		}
		runOneScrapeJob(db, job)
	}
}

// runOneScrapeJob scrapes a single job's URL and saves the result as a
// web-sourced knowledge card, updating the job's last-run metadata.
func runOneScrapeJob(db *gorm.DB, job models.ResearchScrapeJob) {
	db.Model(&models.ResearchScrapeJob{}).Where("id = ? AND tenant_id = ?", job.ID, job.TenantID).
		Update("last_status", "running")

	extracted, err := FetchAndExtract(job.URL)
	now := time.Now()
	status := "success"
	lastErr := ""
	if err != nil {
		status = "failed"
		lastErr = err.Error()
		log.Printf("scrape job %s (%s) failed: %v", job.ID, job.URL, err)
	} else {
		title := firstNonEmpty(extracted.Title, job.Title, domainOf(job.URL))
		item := models.ResearchKnowledgeItem{
			ResearchBase: models.ResearchBase{TenantID: job.TenantID},
			Title:        title,
			Content:      extracted.Text,
			Tags:         pq.StringArray(dedupeTags([]string{domainOf(job.URL), "web"})),
			Source:       "web",
		}
		if err := db.Create(&item).Error; err != nil {
			status = "failed"
			lastErr = "save failed: " + err.Error()
			log.Printf("scrape job %s save failed: %v", job.ID, err)
		}
	}

	db.Model(&models.ResearchScrapeJob{}).Where("id = ? AND tenant_id = ?", job.ID, job.TenantID).
		Updates(map[string]interface{}{
			"last_run_at": &now,
			"last_status": status,
			"last_error":  lastErr,
		})
}
