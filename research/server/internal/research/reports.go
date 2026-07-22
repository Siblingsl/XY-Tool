package research

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/queue"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ReportsHandler struct {
	db     *gorm.DB
	worker *queue.Worker
}

func NewReportsHandler(db *gorm.DB, worker *queue.Worker) *ReportsHandler {
	return &ReportsHandler{db: db, worker: worker}
}

func (h *ReportsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/reports", auth, h.list)
	rg.GET("/reports/:date", auth, h.getByDate)
	rg.POST("/reports/generate", auth, h.generate)
}

func (h *ReportsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	q := h.db.Where("tenant_id = ?", tenantID)

	if from := c.Query("from"); from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			q = q.Where("report_date >= ?", t)
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			q = q.Where("report_date <= ?", t)
		}
	}

	var reports []models.ResearchDailyReport
	q.Order("report_date DESC").Limit(30).Find(&reports)
	response.OK(c, reports)
}

func (h *ReportsHandler) getByDate(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	dateStr := c.Param("date")
	reportDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的日期格式")
		return
	}

	var report models.ResearchDailyReport
	if err := h.db.Where("tenant_id = ? AND report_date = ?", tenantID, reportDate).First(&report).Error; err != nil {
		response.OK(c, nil)
		return
	}
	response.OK(c, report)
}

func (h *ReportsHandler) generate(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	today := time.Now().UTC().Truncate(24 * time.Hour)

	var existing models.ResearchDailyReport
	if err := h.db.Where("tenant_id = ? AND report_date = ?", tenantID, today).First(&existing).Error; err == nil {
		response.OK(c, existing)
		return
	}

	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Stage:        "report",
		Status:       "queued",
	}
	_ = h.db.Create(&job)

	report := h.createStubReport(tenantID, today)
	h.worker.Enqueue(queue.JobPayload{
		JobID:    job.ID,
		TenantID: tenantID,
		Type:     queue.JobGenerate,
	})

	response.OK(c, report)
}

func (h *ReportsHandler) createStubReport(tenantID int64, date time.Time) models.ResearchDailyReport {
	summary := map[string]interface{}{
		"total":         0,
		"do":            0,
		"watch":         0,
		"skip":          0,
		"newDirections": 0,
		"date":          date.Format("2006-01-02"),
	}
	raw, _ := json.Marshal(summary)
	body := "# Daily Research Report\n\nNo projects scored yet."

	report := models.ResearchDailyReport{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ReportDate:   date,
		SummaryJSON:  datatypes.JSON(raw),
		BodyMD:       &body,
	}
	_ = h.db.Where("tenant_id = ? AND report_date = ?", tenantID, date).FirstOrCreate(&report).Error
	return report
}

// CompleteGenerateReport marks a generate job done (stub).
func CompleteGenerateReport(db *gorm.DB, tenantID int64, jobID uuid.UUID) {
	now := time.Now()
	db.Model(&models.ResearchPipelineJob{}).Where("id = ?", jobID).Updates(map[string]interface{}{
		"status":      "done",
		"finished_at": now,
	})
}
