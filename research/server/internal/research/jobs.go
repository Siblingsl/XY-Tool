package research

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/queue"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type JobsHandler struct {
	db     *gorm.DB
	worker *queue.Worker
}

func NewJobsHandler(db *gorm.DB, worker *queue.Worker) *JobsHandler {
	return &JobsHandler{db: db, worker: worker}
}

func (h *JobsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/jobs", auth, h.list)
	rg.GET("/jobs/:id", auth, h.get)
	rg.POST("/jobs/:id/retry", auth, h.retry)
}

func (h *JobsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	q := h.db.Where("tenant_id = ?", tenantID)

	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if stage := c.Query("stage"); stage != "" {
		q = q.Where("stage = ?", stage)
	}

	var jobs []models.ResearchPipelineJob
	q.Order("created_at DESC").Limit(50).Find(&jobs)
	response.OK(c, jobs)
}

func (h *JobsHandler) get(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的任务 ID")
		return
	}

	var job models.ResearchPipelineJob
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&job).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Job not found")
		return
	}
	response.OK(c, job)
}

func (h *JobsHandler) retry(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的任务 ID")
		return
	}

	var job models.ResearchPipelineJob
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&job).Error; err != nil {
		response.OK(c, gin.H{"error": "Job not found"})
		return
	}

	h.db.Model(&job).Updates(map[string]interface{}{
		"status":      "queued",
		"error":       nil,
		"started_at":  nil,
		"finished_at": nil,
	})

	jobType := queue.JobSync
	switch job.Stage {
	case "verify":
		jobType = queue.JobReverify
	case "score":
		jobType = queue.JobRescore
	case "report":
		jobType = queue.JobGenerate
	}

	h.worker.Enqueue(queue.JobPayload{
		JobID:     job.ID,
		TenantID:  tenantID,
		ProjectID: job.ProjectID,
		Type:      jobType,
	})

	response.OK(c, gin.H{"message": "Job queued for retry"})
}
