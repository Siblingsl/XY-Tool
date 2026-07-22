package research

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/queue"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type ProjectsHandler struct {
	db     *gorm.DB
	worker *queue.Worker
}

func NewProjectsHandler(db *gorm.DB, worker *queue.Worker) *ProjectsHandler {
	return &ProjectsHandler{db: db, worker: worker}
}

func (h *ProjectsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/projects", auth, h.list)
	rg.GET("/projects/:id", auth, h.get)
	rg.POST("/projects/:id/reverify", auth, h.reverify)
	rg.POST("/projects/:id/rescore", auth, h.rescore)
}

func (h *ProjectsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := h.db.Model(&models.ResearchProject{}).Where("tenant_id = ?", tenantID)
	if verdict := c.Query("verdict"); verdict != "" {
		q = q.Where("verdict = ?", verdict)
	}
	if clusterID := c.Query("clusterId"); clusterID != "" {
		q = q.Where("cluster_id = ?", clusterID)
	}

	var total int64
	q.Count(&total)

	var items []models.ResearchProject
	q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *ProjectsHandler) get(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var project models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&project).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Project not found")
		return
	}

	var evidences []models.ResearchEvidence
	h.db.Where("project_id = ? AND tenant_id = ?", id, tenantID).Find(&evidences)

	var competitors []models.ResearchCompetitor
	h.db.Where("project_id = ? AND tenant_id = ?", id, tenantID).Find(&competitors)

	topPlayers := make([]string, 0, len(competitors))
	for _, comp := range competitors {
		topPlayers = append(topPlayers, comp.Name)
	}

	var heatSeries []models.ResearchHeatPoint
	h.db.Where("project_id = ? AND tenant_id = ?", id, tenantID).Order("date ASC").Find(&heatSeries)

	response.OK(c, gin.H{
		"id":                project.ID,
		"tenantId":          project.TenantID,
		"emailId":           project.EmailID,
		"clusterId":         project.ClusterID,
		"cardJson":          project.CardJSON,
		"verifyStatus":      project.VerifyStatus,
		"feasibilityIndex":  project.FeasibilityIndex,
		"verdict":           project.Verdict,
		"authenticityStars": project.AuthenticityStars,
		"lifecycle":         project.Lifecycle,
		"mvpPlanJson":       project.MvpPlanJSON,
		"scoreJson":         project.ScoreJSON,
		"summary":           project.Summary,
		"stars":             project.Stars,
		"createdAt":         project.CreatedAt,
		"updatedAt":         project.UpdatedAt,
		"evidences":         evidences,
		"competitors": gin.H{
			"count":      len(competitors),
			"topPlayers": topPlayers,
			"list":       competitors,
		},
		"heatSeries": heatSeries,
	})
}

func (h *ProjectsHandler) reverify(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var project models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&project).Error; err != nil {
		response.OK(c, gin.H{"error": "Project not found"})
		return
	}

	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    &id,
		Stage:        "verify",
		Status:       "queued",
	}
	_ = h.db.Create(&job)
	h.worker.Enqueue(queue.JobPayload{
		JobID:     job.ID,
		TenantID:  tenantID,
		ProjectID: &id,
		Type:      queue.JobReverify,
	})

	response.OK(c, gin.H{"message": "Project marked for re-verification"})
}

func (h *ProjectsHandler) rescore(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var project models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&project).Error; err != nil {
		response.OK(c, gin.H{"error": "Project not found"})
		return
	}

	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    &id,
		Stage:        "score",
		Status:       "queued",
	}
	_ = h.db.Create(&job)
	h.worker.Enqueue(queue.JobPayload{
		JobID:     job.ID,
		TenantID:  tenantID,
		ProjectID: &id,
		Type:      queue.JobRescore,
	})

	response.OK(c, gin.H{"message": "Project marked for re-scoring"})
}
