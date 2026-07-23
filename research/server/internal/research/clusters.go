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

type ClustersHandler struct {
	db *gorm.DB
}

func NewClustersHandler(db *gorm.DB) *ClustersHandler {
	return &ClustersHandler{db: db}
}

func (h *ClustersHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/clusters", auth, h.list)
	rg.GET("/clusters/:key", auth, h.byKey)
}

func (h *ClustersHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var clusters []models.ResearchCluster
	h.db.Where("tenant_id = ?", tenantID).Order("label ASC").Find(&clusters)

	items := make([]gin.H, 0, len(clusters))
	for _, cl := range clusters {
		items = append(items, gin.H{
			"key":          cl.Key,
			"label":        cl.Label,
			"projectCount": len(cl.ProjectIDs),
			"projectIds":   cl.ProjectIDs,
		})
	}
	response.OK(c, items)
}

func (h *ClustersHandler) byKey(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	key := c.Param("key")

	var cl models.ResearchCluster
	if err := h.db.Where("tenant_id = ? AND key = ?", tenantID, key).First(&cl).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Cluster not found")
		return
	}
	items := make([]gin.H, 0, len(cl.ProjectIDs))
	if len(cl.ProjectIDs) > 0 {
		var projects []models.ResearchProject
		h.db.Where("tenant_id = ? AND id IN ?", tenantID, []uuid.UUID(cl.ProjectIDs)).Find(&projects)
		for _, p := range projects {
			items = append(items, gin.H{
				"id":               p.ID,
				"name":             projectName(p),
				"verdict":          p.Verdict,
				"feasibilityIndex": p.FeasibilityIndex,
				"lifecycle":        p.Lifecycle,
			})
		}
	}
	response.OK(c, gin.H{
		"key":      cl.Key,
		"label":    cl.Label,
		"projects": items,
	})
}
