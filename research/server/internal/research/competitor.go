package research

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type CompetitorHandler struct {
	db *gorm.DB
}

func NewCompetitorHandler(db *gorm.DB) *CompetitorHandler {
	return &CompetitorHandler{db: db}
}

func (h *CompetitorHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/competitor-watches", auth, h.listWatches)
	rg.POST("/competitor-watches", auth, h.createWatch)
	rg.PUT("/competitor-watches/:id", auth, h.updateWatch)
	rg.DELETE("/competitor-watches/:id", auth, h.deleteWatch)
	rg.GET("/competitor-watches/hits", auth, h.listHits)
	rg.GET("/competitor-watches/analytics", auth, h.analytics)
}

func (h *CompetitorHandler) listWatches(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var watches []models.ResearchCompetitorWatch
	h.db.Where("tenant_id = ?", tenantID).Order("created_at DESC").Find(&watches)
	response.OK(c, watches)
}

func (h *CompetitorHandler) createWatch(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		Keyword    string `json:"keyword"`
		MatchScope string `json:"matchScope"`
		Enabled    *bool  `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Keyword == "" {
		response.Error(c, http.StatusBadRequest, "缺少 keyword")
		return
	}
	scope := body.MatchScope
	if scope == "" {
		scope = "all"
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	uid := middleware.UserID(c)
	w := models.ResearchCompetitorWatch{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Keyword:      body.Keyword,
		MatchScope:   scope,
		Enabled:      enabled,
	}
	if uid != 0 {
		u := uid
		w.UserID = &u
	}
	if err := h.db.Create(&w).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建监控词失败")
		return
	}
	response.OK(c, w)
}

func (h *CompetitorHandler) updateWatch(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的监控词 ID")
		return
	}

	var w models.ResearchCompetitorWatch
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&w).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Watch not found")
		return
	}

	var body struct {
		Keyword    *string `json:"keyword"`
		MatchScope *string `json:"matchScope"`
		Enabled    *bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "无效请求体")
		return
	}
	updates := map[string]interface{}{}
	if body.Keyword != nil {
		updates["keyword"] = *body.Keyword
	}
	if body.MatchScope != nil {
		updates["match_scope"] = *body.MatchScope
	}
	if body.Enabled != nil {
		updates["enabled"] = *body.Enabled
	}
	if len(updates) == 0 {
		response.OK(c, w)
		return
	}
	if err := h.db.Model(&w).Where("id = ? AND tenant_id = ?", id, tenantID).Updates(updates).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&w)
	response.OK(c, w)
}

func (h *CompetitorHandler) deleteWatch(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的监控词 ID")
		return
	}
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).Delete(&models.ResearchCompetitorWatch{}).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}

func (h *CompetitorHandler) listHits(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := h.db.Model(&models.ResearchCompetitorHit{}).Where("tenant_id = ?", tenantID)
	if v := c.Query("watchId"); v != "" {
		if wid, err := uuid.Parse(v); err == nil {
			q = q.Where("watch_id = ?", wid)
		}
	}
	if v := c.Query("projectId"); v != "" {
		if pid, err := uuid.Parse(v); err == nil {
			q = q.Where("project_id = ?", pid)
		}
	}

	var total int64
	q.Count(&total)

	var hits []models.ResearchCompetitorHit
	q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&hits)

	out := make([]gin.H, 0, len(hits))
	for _, hit := range hits {
		out = append(out, gin.H{
			"id":           hit.ID,
			"watchId":      hit.WatchID,
			"projectId":    hit.ProjectID,
			"keyword":      hit.Keyword,
			"matchedField": hit.MatchedField,
			"createdAt":    hit.CreatedAt,
		})
	}
	response.OK(c, gin.H{
		"items":    out,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *CompetitorHandler) analytics(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var watches []models.ResearchCompetitorWatch
	h.db.Where("tenant_id = ?", tenantID).Find(&watches)

	var hits []models.ResearchCompetitorHit
	h.db.Where("tenant_id = ?", tenantID).Find(&hits)

	byWatch := map[uuid.UUID][]models.ResearchCompetitorHit{}
	for _, hit := range hits {
		byWatch[hit.WatchID] = append(byWatch[hit.WatchID], hit)
	}

	// Collect project ids to resolve names once.
	projIDs := map[uuid.UUID]bool{}
	for _, hit := range hits {
		projIDs[hit.ProjectID] = true
	}
	names := map[uuid.UUID]string{}
	if len(projIDs) > 0 {
		ids := make([]uuid.UUID, 0, len(projIDs))
		for id := range projIDs {
			ids = append(ids, id)
		}
		var projects []models.ResearchProject
		h.db.Where("tenant_id = ? AND id IN ?", tenantID, ids).Find(&projects)
		for _, p := range projects {
			names[p.ID] = cardField(p, "name")
		}
	}

	items := make([]gin.H, 0, len(watches))
	for _, w := range watches {
		wh := byWatch[w.ID]
		projectCounts := map[uuid.UUID]int{}
		for _, hit := range wh {
			projectCounts[hit.ProjectID]++
		}

		type pc struct {
			id  uuid.UUID
			cnt int
		}
		top := make([]pc, 0, len(projectCounts))
		for pid, cnt := range projectCounts {
			top = append(top, pc{pid, cnt})
		}
		sort.Slice(top, func(i, j int) bool { return top[i].cnt > top[j].cnt })
		if len(top) > 5 {
			top = top[:5]
		}
		topProjects := make([]gin.H, 0, len(top))
		for _, t := range top {
			name := names[t.id]
			if name == "" {
				name = t.id.String()
			}
			topProjects = append(topProjects, gin.H{
				"projectId": t.id,
				"name":      name,
				"hitCount":  t.cnt,
			})
		}

		items = append(items, gin.H{
			"watchId":     w.ID,
			"keyword":     w.Keyword,
			"matchScope":  w.MatchScope,
			"hitCount":    len(wh),
			"projectCount": len(projectCounts),
			"topProjects": topProjects,
		})
	}
	response.OK(c, gin.H{"items": items})
}

// extractCompetitorNames pulls the "competitors" array's "name" fields from the
// project's card_json. Only card_json is scanned (not the email extracted_json).
func extractCompetitorNames(cardJSON []byte) []string {
	names := []string{}
	if len(cardJSON) == 0 {
		return names
	}
	var m map[string]interface{}
	if err := json.Unmarshal(cardJSON, &m); err != nil {
		return names
	}
	raw, ok := m["competitors"]
	if !ok {
		return names
	}
	arr, ok := raw.([]interface{})
	if !ok {
		return names
	}
	for _, item := range arr {
		obj, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if nm, ok := obj["name"].(string); ok && nm != "" {
			names = append(names, nm)
		}
	}
	return names
}

// matchKeyword reports whether keyword matches under the given scope, and which
// field was matched. Case-insensitive contains.
func matchKeyword(scope, keyword, name string, compNames []string) (bool, string) {
	kw := strings.ToLower(keyword)
	nameHit := strings.Contains(strings.ToLower(name), kw)
	compHit := false
	for _, c := range compNames {
		if strings.Contains(strings.ToLower(c), kw) {
			compHit = true
			break
		}
	}
	switch scope {
	case "name":
		if nameHit {
			return true, "name"
		}
	case "competitors":
		if compHit {
			return true, "competitors"
		}
	default: // "all" and anything unknown -> both
		if nameHit {
			return true, "name"
		}
		if compHit {
			return true, "competitors"
		}
	}
	return false, ""
}

// RunCompetitorScan scans a project's card_json (name + competitors) against the
// tenant's enabled watch keywords. Matching hits are de-duplicated and produce
// a competitor_hit notification. It never returns an error to the caller and is
// intended to run inside a safego goroutine.
func RunCompetitorScan(db *gorm.DB, tenantID int64, project models.ResearchProject) {
	var watches []models.ResearchCompetitorWatch
	db.Where("tenant_id = ? AND enabled = ?", tenantID, true).Find(&watches)
	if len(watches) == 0 {
		return
	}

	name := cardField(project, "name")
	compNames := extractCompetitorNames(project.CardJSON)

	for _, w := range watches {
		matched, field := matchKeyword(w.MatchScope, w.Keyword, name, compNames)
		if !matched {
			continue
		}

		// De-duplicate: skip if an identical (watch, project, field) hit exists.
		var existing models.ResearchCompetitorHit
		err := db.Where("tenant_id = ? AND watch_id = ? AND project_id = ? AND matched_field = ?",
			tenantID, w.ID, project.ID, field).First(&existing).Error
		if err == nil {
			continue
		} else if err != gorm.ErrRecordNotFound {
			continue
		}

		hit := models.ResearchCompetitorHit{
			ResearchBase: models.ResearchBase{TenantID: tenantID},
			WatchID:      w.ID,
			ProjectID:    project.ID,
			Keyword:      w.Keyword,
			MatchScope:   w.MatchScope,
			MatchedField: field,
		}
		if err := db.Create(&hit).Error; err != nil {
			continue
		}
		_ = CreateNotification(db, tenantID, nil, "competitor_hit",
			"命中监控词「"+w.Keyword+"」",
			"项目《"+name+"》命中你的竞品监控词",
			"project", project.ID.String())
	}
}
