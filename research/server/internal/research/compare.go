package research

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type CompareHandler struct {
	db *gorm.DB
}

func NewCompareHandler(db *gorm.DB) *CompareHandler {
	return &CompareHandler{db: db}
}

func (h *CompareHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.POST("/projects/compare", auth, h.compare)
}

// compare returns side-by-side project summaries with per-metric heat averages.
func (h *CompareHandler) compare(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		IDs []uuid.UUID `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		response.Error(c, http.StatusBadRequest, "缺少 ids")
		return
	}
	if len(body.IDs) > 50 {
		body.IDs = body.IDs[:50]
	}

	var projects []models.ResearchProject
	h.db.Where("tenant_id = ? AND id IN ?", tenantID, body.IDs).Find(&projects)

	var heat []struct {
		ProjectID uuid.UUID `json:"projectId"`
		Metric    string    `json:"metric"`
		Avg       float64   `json:"avg"`
	}
	h.db.Model(&models.ResearchHeatPoint{}).
		Select("project_id, metric, AVG(value) AS avg").
		Where("tenant_id = ? AND project_id IN ?", tenantID, body.IDs).
		Group("project_id, metric").
		Find(&heat)

	heatMap := make(map[uuid.UUID]map[string]float64)
	for _, hh := range heat {
		if heatMap[hh.ProjectID] == nil {
			heatMap[hh.ProjectID] = map[string]float64{}
		}
		heatMap[hh.ProjectID][hh.Metric] = hh.Avg
	}

	items := make([]gin.H, 0, len(projects))
	for _, p := range projects {
		items = append(items, gin.H{
			"id":               p.ID,
			"name":             projectName(p),
			"scoreJson":        p.ScoreJSON,
			"feasibilityIndex": p.FeasibilityIndex,
			"lifecycle":        p.Lifecycle,
			"heatAvg":          heatMap[p.ID],
		})
	}
	response.OK(c, items)
}
