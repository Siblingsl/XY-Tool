package research

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	// Static segments registered before parameterized ones (Gin gives static priority anyway).
	rg.GET("/projects/export", auth, h.export)
	rg.GET("/projects", auth, h.list)
	rg.GET("/projects/:id", auth, h.get)
	rg.POST("/projects/:id/reverify", auth, h.reverify)
	rg.POST("/projects/:id/rescore", auth, h.rescore)
	rg.POST("/projects/:id/favorite", auth, h.favorite)
	rg.PATCH("/projects/:id/lifecycle", auth, h.patchLifecycle)
	rg.PATCH("/projects/:id/verdict", auth, h.setVerdict)
}

// ProjectListItem extends the project with its tags and the favorited flag.
type ProjectListItem struct {
	models.ResearchProject
	Tags []string `json:"tags"`
}

// projectQuery builds a tenant-scoped, filtered query shared by list and export.
// Note: name/type/author are stored inside card_json, so the `q` search covers
// summary plus the card_json text; scoreMin is applied as a Go post-filter.
func (h *ProjectsHandler) projectQuery(c *gin.Context, tenantID int64) *gorm.DB {
	q := h.db.Model(&models.ResearchProject{}).Where("tenant_id = ?", tenantID)

	if v := c.Query("verdict"); v != "" {
		q = q.Where("verdict = ?", v)
	}
	if v := c.Query("clusterId"); v != "" {
		q = q.Where("cluster_id = ?", v)
	}
	if v := c.Query("q"); v != "" {
		like := "%" + v + "%"
		q = q.Where("summary ILIKE ? OR card_json::text ILIKE ?", like, like)
	}
	if v := c.Query("lifecycle"); v != "" {
		q = q.Where("lifecycle = ?", v)
	}
	if v := c.Query("favorited"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			q = q.Where("favorited = ?", b)
		}
	}
	if v := c.Query("minStars"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			q = q.Where("stars >= ?", n)
		}
	}
	if v := c.Query("fromDate"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			q = q.Where("created_at >= ?", t)
		}
	}
	if v := c.Query("toDate"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			q = q.Where("created_at <= ?", t)
		}
	}
	if tags := parseTagsQuery(c); len(tags) > 0 {
		sub := h.db.Model(&models.ResearchProjectTag{}).
			Select("project_id").
			Where("tenant_id = ?", tenantID).
			Where("tag IN ?", tags)
		q = q.Where("id IN (?)", sub)
	}
	return q
}

func parseTagsQuery(c *gin.Context) []string {
	tags := c.QueryArray("tags")
	if len(tags) == 0 {
		if v := c.Query("tags"); v != "" {
			tags = []string{v}
		}
	}
	out := make([]string, 0, len(tags))
	for _, t := range tags {
		for _, part := range strings.Split(t, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
	}
	return out
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

	q := h.projectQuery(c, tenantID)
	var total int64
	q.Count(&total)

	var projects []models.ResearchProject
	q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&projects)

	projects = filterByScoreMin(projects, c.Query("scoreMin"))
	items := h.attachTags(tenantID, projects)

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *ProjectsHandler) attachTags(tenantID int64, projects []models.ResearchProject) []ProjectListItem {
	items := make([]ProjectListItem, len(projects))
	if len(projects) == 0 {
		return items
	}
	ids := make([]uuid.UUID, len(projects))
	for i, p := range projects {
		ids[i] = p.ID
		items[i].ResearchProject = p
	}
	var tags []models.ResearchProjectTag
	h.db.Where("tenant_id = ? AND project_id IN ?", tenantID, ids).Find(&tags)
	byProject := make(map[uuid.UUID][]string)
	for _, t := range tags {
		byProject[t.ProjectID] = append(byProject[t.ProjectID], t.Tag)
	}
	for i := range items {
		items[i].Tags = byProject[items[i].ID]
	}
	return items
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

	var tags []models.ResearchProjectTag
	h.db.Where("project_id = ? AND tenant_id = ?", id, tenantID).Find(&tags)
	tagStrs := make([]string, 0, len(tags))
	for _, t := range tags {
		tagStrs = append(tagStrs, t.Tag)
	}

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
		"favorited":         project.Favorited,
		"tags":              tagStrs,
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

func (h *ProjectsHandler) favorite(c *gin.Context) {
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
	newVal := !project.Favorited
	if err := h.db.Model(&project).Where("id = ? AND tenant_id = ?", id, tenantID).Update("favorited", newVal).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	response.OK(c, gin.H{"favorited": newVal})
}

var validLifecycles = map[string]bool{
	"idea":       true,
	"validating": true,
	"watch":      true,
	"do":         true,
	"landed":     true,
}

func (h *ProjectsHandler) patchLifecycle(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var body struct {
		Lifecycle string `json:"lifecycle"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Lifecycle == "" {
		response.Error(c, http.StatusBadRequest, "缺少 lifecycle")
		return
	}
	if !validLifecycles[body.Lifecycle] {
		response.Error(c, http.StatusBadRequest, "无效的 lifecycle 取值")
		return
	}

	var project models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&project).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Project not found")
		return
	}
	if err := h.db.Model(&project).Where("id = ? AND tenant_id = ?", id, tenantID).Update("lifecycle", body.Lifecycle).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	// Fire lifecycle-changed event (async, never blocks the response).
	var latest models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&latest).Error; err == nil {
		safego(func() {
			FireProjectEvent(h.db, tenantID, "project.lifecycle.changed", latest, nil)
		})
	}
	response.OK(c, gin.H{"lifecycle": body.Lifecycle})
}

func (h *ProjectsHandler) setVerdict(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var body struct {
		Verdict string `json:"verdict"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Verdict == "" {
		response.Error(c, http.StatusBadRequest, "缺少 verdict")
		return
	}

	var project models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&project).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Project not found")
		return
	}
	oldVerdict := project.Verdict
	if err := SetVerdict(h.db, tenantID, id, body.Verdict); err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	safego(func() {
		FireProjectEvent(h.db, tenantID, "project.verdict.changed", project, oldVerdict)
	})
	response.OK(c, gin.H{"verdict": body.Verdict})
}

func (h *ProjectsHandler) export(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	q := h.projectQuery(c, tenantID)

	var projects []models.ResearchProject
	q.Order("created_at DESC").Find(&projects)
	projects = filterByScoreMin(projects, c.Query("scoreMin"))

	format := c.Query("format")
	if format == "json" {
		out, _ := json.MarshalIndent(projects, "", "  ")
		c.Header("Content-Disposition", "attachment; filename=projects.json")
		c.Data(http.StatusOK, "application/json", out)
		return
	}

	// Default: CSV.
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"name", "type", "price", "audience", "verdict", "feasibilityIndex", "authenticityStars", "lifecycle", "summary"})
	for _, p := range projects {
		_ = w.Write([]string{
			cardField(p, "name"),
			cardField(p, "type"),
			cardField(p, "price"),
			cardField(p, "audience"),
			strOrNil(p.Verdict),
			intOrEmpty(p.FeasibilityIndex),
			intOrEmpty(p.AuthenticityStars),
			strOrNil(p.Lifecycle),
			strOrNil(p.Summary),
		})
	}
	w.Flush()
	c.Header("Content-Disposition", "attachment; filename=projects.csv")
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
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

	// Real verification: mark verified and compute an authenticity heuristic
	// from the project's signal strength (links, competitors, price clarity).
	authenticity := computeAuthenticity(project)
	updates := map[string]interface{}{
		"verify_status":      "verified",
		"authenticity_stars": authenticity,
	}
	if err := h.db.Model(&project).Where("id = ? AND tenant_id = ?", id, tenantID).Updates(updates).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}

	// Fire the verified event (drives automation rules) and keep the job record
	// for traceability.
	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    &id,
		Stage:        "verify",
		Status:       "done",
	}
	_ = h.db.Create(&job)
	safego(func() {
		var latest models.ResearchProject
		if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&latest).Error; err == nil {
			FireProjectEvent(h.db, tenantID, "project.verified", latest, nil)
		}
	})

	response.OK(c, gin.H{"message": "Project re-verified", "authenticityStars": authenticity, "verifyStatus": "verified"})
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

	// Real scoring: compute a deterministic multi-dimension score from the
	// project's card data and persist it. No external LLM required.
	scores := computeScores(project)
	raw, _ := json.Marshal(scores)
	feasibility := int(avgScore(raw))
	updates := map[string]interface{}{
		"score_json":         raw,
		"feasibility_index":  feasibility,
	}
	if err := h.db.Model(&project).Where("id = ? AND tenant_id = ?", id, tenantID).Updates(updates).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}

	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    &id,
		Stage:        "score",
		Status:       "done",
	}
	_ = h.db.Create(&job)
	safego(func() {
		var latest models.ResearchProject
		if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&latest).Error; err == nil {
			FireProjectEvent(h.db, tenantID, "project.verdict.changed", latest, nil)
		}
	})

	response.OK(c, gin.H{"message": "Project re-scored", "scoreJson": scores, "feasibilityIndex": feasibility})
}
