package research

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

// SimilarHandler recommends projects similar to a given one, scoring by shared
// cluster membership (+3) and overlapping tags (+2 each). Computed on the fly,
// no new storage.
type SimilarHandler struct {
	db *gorm.DB
}

func NewSimilarHandler(db *gorm.DB) *SimilarHandler {
	return &SimilarHandler{db: db}
}

func (h *SimilarHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/projects/:id/similar", auth, h.list)
}

type similarScore struct {
	project models.ResearchProject
	score   int
	shared  []string
}

func (h *SimilarHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}
	limit := 5
	if v := c.Query("limit"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 20 {
			limit = n
		}
	}

	var self models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&self).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Project not found")
		return
	}

	// Tags of the source project.
	var selfTags []models.ResearchProjectTag
	h.db.Where("tenant_id = ? AND project_id = ?", tenantID, id).Find(&selfTags)
	selfTagSet := map[string]bool{}
	for _, t := range selfTags {
		selfTagSet[t.Tag] = true
	}

	// All other projects of the tenant.
	var others []models.ResearchProject
	h.db.Where("tenant_id = ? AND id <> ?", tenantID, id).Find(&others)

	// Tags grouped by project (excluding self), to compute overlap.
	var otherTags []models.ResearchProjectTag
	h.db.Where("tenant_id = ? AND project_id <> ?", tenantID, id).Find(&otherTags)
	tagsByProject := map[uuid.UUID][]string{}
	for _, t := range otherTags {
		tagsByProject[t.ProjectID] = append(tagsByProject[t.ProjectID], t.Tag)
	}

	scores := make([]similarScore, 0, len(others))
	for _, o := range others {
		s := 0
		shared := []string{}
		if self.ClusterID != nil && o.ClusterID != nil && *self.ClusterID == *o.ClusterID {
			s += 3
		}
		for _, t := range tagsByProject[o.ID] {
			if selfTagSet[t] {
				s += 2
				shared = append(shared, t)
			}
		}
		if s > 0 {
			scores = append(scores, similarScore{project: o, score: s, shared: shared})
		}
	}

	sort.Slice(scores, func(i, j int) bool {
		if scores[i].score != scores[j].score {
			return scores[i].score > scores[j].score
		}
		return scores[i].project.CreatedAt.After(scores[j].project.CreatedAt)
	})
	if len(scores) > limit {
		scores = scores[:limit]
	}

	out := make([]gin.H, 0, len(scores))
	for _, s := range scores {
		out = append(out, gin.H{
			"id":               s.project.ID,
			"name":             projectName(s.project),
			"verdict":          s.project.Verdict,
			"lifecycle":        s.project.Lifecycle,
			"feasibilityIndex": s.project.FeasibilityIndex,
			"sharedTags":       s.shared,
			"score":            s.score,
			"clusterId":        s.project.ClusterID,
		})
	}
	response.OK(c, gin.H{"items": out})
}
