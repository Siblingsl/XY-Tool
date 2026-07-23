package research

import (
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type AggregateHandler struct {
	db *gorm.DB
}

func NewAggregateHandler(db *gorm.DB) *AggregateHandler {
	return &AggregateHandler{db: db}
}

func (h *AggregateHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/trends", auth, h.trends)
	rg.GET("/analytics/maturity", auth, h.maturity)
	rg.GET("/analytics/sources", auth, h.sources)
	rg.GET("/analytics/top-sources", auth, h.sources)
	rg.GET("/analytics/scores", auth, h.scores)
	// 兼容旧前端/快捷入口直接调用 /maturity 与 /sources
	rg.GET("/maturity", auth, h.maturity)
	rg.GET("/sources", auth, h.sources)
	rg.GET("/workbench", auth, h.workbench)
}

// trends aggregates heat_points into a daily time series.
func (h *AggregateHandler) trends(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	metric := c.Query("metric")
	scope := c.Query("scope")

	q := h.db.Model(&models.ResearchHeatPoint{}).
		Select("research_heat_points.date AS date, COALESCE(SUM(research_heat_points.value),0) AS value").
		Where("research_heat_points.tenant_id = ?", tenantID)

	switch {
	case scope == "favorite":
		sub := h.db.Model(&models.ResearchProject{}).Select("id").
			Where("tenant_id = ? AND favorited = ?", tenantID, true)
		q = q.Where("research_heat_points.project_id IN (?)", sub)
	case strings.HasPrefix(scope, "tag:"):
		tag := strings.TrimPrefix(scope, "tag:")
		sub := h.db.Model(&models.ResearchProjectTag{}).Select("project_id").
			Where("tenant_id = ? AND tag = ?", tenantID, tag)
		q = q.Where("research_heat_points.project_id IN (?)", sub)
	}
	if metric != "" {
		q = q.Where("research_heat_points.metric = ?", metric)
	}
	if v := c.Query("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			q = q.Where("research_heat_points.date >= ?", t)
		}
	}
	if v := c.Query("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			q = q.Where("research_heat_points.date <= ?", t)
		}
	}

	var series []struct {
		Date  time.Time `json:"date"`
		Value float64   `json:"value"`
	}
	q.Group("research_heat_points.date").Order("research_heat_points.date ASC").Find(&series)

	metrics := []string{}
	if metric != "" {
		metrics = append(metrics, metric)
	}
	response.OK(c, gin.H{"metrics": metrics, "series": series})
}

func (h *AggregateHandler) maturity(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	rows := h.maturityRows(tenantID)
	response.OK(c, rows)
}

func (h *AggregateHandler) maturityRows(tenantID int64) []gin.H {
	var rows []struct {
		Lifecycle *string `json:"lifecycle"`
		Count     int64   `json:"count"`
	}
	h.db.Model(&models.ResearchProject{}).
		Select("lifecycle, COUNT(*) AS count").
		Where("tenant_id = ?", tenantID).
		Group("lifecycle").
		Find(&rows)

	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		lc := "unknown"
		if r.Lifecycle != nil {
			lc = *r.Lifecycle
		}
		out = append(out, gin.H{"lifecycle": lc, "count": r.Count})
	}
	return out
}

func (h *AggregateHandler) sources(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	top := 10
	if v := c.Query("top"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			top = n
		}
	}

	type sourceRow struct {
		FromAddr       string  `json:"fromAddr"`
		EmailCount     int64   `json:"emailCount"`
		ProjectCount   int64   `json:"projectCount"`
		AvgFeasibility float64 `json:"avgFeasibility"`
	}
	rows := make([]sourceRow, 0)
	h.db.Raw(`
		SELECT e.from_addr AS from_addr,
		       COUNT(*) AS email_count,
		       COUNT(DISTINCT p.id) AS project_count,
		       COALESCE(AVG(p.feasibility_index), 0) AS avg_feasibility
		FROM research_emails e
		LEFT JOIN research_projects p ON p.email_id = e.id AND p.tenant_id = e.tenant_id
		WHERE e.tenant_id = ?
		GROUP BY e.from_addr
		ORDER BY email_count DESC
		LIMIT ?
	`, tenantID, top).Scan(&rows)
	if rows == nil {
		rows = []sourceRow{}
	}
	response.OK(c, rows)
}

func (h *AggregateHandler) scores(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var projects []models.ResearchProject
	h.db.Where("tenant_id = ?", tenantID).Find(&projects)

	dims := map[string]struct {
		sum float64
		n   int
	}{}
	for _, p := range projects {
		for k, v := range parseScoreMap(p.ScoreJSON) {
			d := dims[k]
			d.sum += v
			d.n++
			dims[k] = d
		}
	}
	dimensions := map[string]float64{}
	for k, d := range dims {
		dimensions[k] = d.sum / float64(d.n)
	}
	response.OK(c, gin.H{"count": len(projects), "dimensions": dimensions})
}

func (h *AggregateHandler) workbench(c *gin.Context) {
	tenantID := middleware.TenantID(c)

	summary := func(rows *gorm.DB) []gin.H {
		var projects []models.ResearchProject
		rows.Find(&projects)
		out := make([]gin.H, 0, len(projects))
		for _, p := range projects {
			out = append(out, gin.H{
				"id":               p.ID,
				"name":             projectName(p),
				"verdict":          p.Verdict,
				"feasibilityIndex": p.FeasibilityIndex,
				"favorited":        p.Favorited,
				"lifecycle":        p.Lifecycle,
				"createdAt":        p.CreatedAt,
			})
		}
		return out
	}

	favorited := summary(h.db.Where("tenant_id = ? AND favorited = ?", tenantID, true).Order("updated_at DESC").Limit(10))
	recent := summary(h.db.Where("tenant_id = ?", tenantID).Order("created_at DESC").Limit(10))

	var tagCount int64
	h.db.Model(&models.ResearchProjectTag{}).Where("tenant_id = ?", tenantID).Count(&tagCount)
	var noteCount int64
	h.db.Model(&models.ResearchProjectNote{}).Where("tenant_id = ?", tenantID).Count(&noteCount)

	response.OK(c, gin.H{
		"favorited":  favorited,
		"recent":     recent,
		"maturity":   h.maturityRows(tenantID),
		"tagCount":   tagCount,
		"noteCount":  noteCount,
	})
}
