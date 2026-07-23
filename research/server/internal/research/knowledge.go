package research

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

// KnowledgeHandler serves the curated knowledge base: list/search, create,
// update, delete. All queries are tenant-scoped.
type KnowledgeHandler struct {
	db *gorm.DB
}

func NewKnowledgeHandler(db *gorm.DB) *KnowledgeHandler {
	return &KnowledgeHandler{db: db}
}

func (h *KnowledgeHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/knowledge", auth, h.list)
	rg.GET("/knowledge/tags", auth, h.listTags)
	rg.POST("/knowledge", auth, h.create)
	rg.PUT("/knowledge/:id", auth, h.update)
	rg.DELETE("/knowledge/:id", auth, h.remove)
}

func (h *KnowledgeHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	page := atoiDefault(c.DefaultQuery("page", "1"), 1)
	pageSize := atoiDefault(c.DefaultQuery("pageSize", "20"), 20)
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := h.db.Model(&models.ResearchKnowledgeItem{}).Where("tenant_id = ?", tenantID)
	if v := c.Query("q"); v != "" {
		like := "%" + v + "%"
		q = q.Where("title ILIKE ? OR content ILIKE ?", like, like)
	}
	if v := c.Query("tag"); v != "" {
		q = q.Where("? = ANY(tags)", v)
	}
	if v := c.Query("projectId"); v != "" {
		if pid, err := uuid.Parse(v); err == nil {
			q = q.Where("project_id = ?", pid)
		}
	}

	var total int64
	q.Count(&total)

	var items []models.ResearchKnowledgeItem
	q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	out := make([]gin.H, 0, len(items))
	for _, it := range items {
		out = append(out, serializeKnowledge(h.db, tenantID, it))
	}
	response.OK(c, gin.H{"items": out, "total": total, "page": page, "pageSize": pageSize})
}

func (h *KnowledgeHandler) listTags(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var items []models.ResearchKnowledgeItem
	h.db.Where("tenant_id = ?", tenantID).Find(&items)
	seen := map[string]bool{}
	tags := []string{}
	for _, it := range items {
		for _, t := range it.Tags {
			if !seen[t] {
				seen[t] = true
				tags = append(tags, t)
			}
		}
	}
	response.OK(c, tags)
}

func (h *KnowledgeHandler) create(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		Title     string   `json:"title"`
		Content   string   `json:"content"`
		Tags      []string `json:"tags"`
		Source    string   `json:"source"`
		ProjectID *string  `json:"projectId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Title) == "" {
		response.Error(c, http.StatusBadRequest, "缺少 title")
		return
	}
	src := body.Source
	if src == "" {
		src = "manual"
	}
	var pid *uuid.UUID
	if body.ProjectID != nil && *body.ProjectID != "" {
		if p, err := uuid.Parse(*body.ProjectID); err == nil {
			pid = &p
		}
	}

	it := models.ResearchKnowledgeItem{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Title:        strings.TrimSpace(body.Title),
		Content:      body.Content,
		Tags:         pq.StringArray(dedupeTags(body.Tags)),
		Source:       src,
		ProjectID:    pid,
	}
	if err := h.db.Create(&it).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建知识卡片失败")
		return
	}
	response.OK(c, serializeKnowledge(h.db, tenantID, it))
}

func (h *KnowledgeHandler) update(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的知识卡片 ID")
		return
	}
	var body struct {
		Title   *string   `json:"title"`
		Content *string   `json:"content"`
		Tags    []string  `json:"tags"`
		Source  *string   `json:"source"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "无效请求体")
		return
	}

	var it models.ResearchKnowledgeItem
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&it).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Knowledge item not found")
		return
	}

	updates := map[string]interface{}{}
	if body.Title != nil {
		updates["title"] = strings.TrimSpace(*body.Title)
	}
	if body.Content != nil {
		updates["content"] = *body.Content
	}
	if body.Tags != nil {
		updates["tags"] = pq.StringArray(dedupeTags(body.Tags))
	}
	if body.Source != nil {
		updates["source"] = *body.Source
	}
	if len(updates) == 0 {
		response.OK(c, serializeKnowledge(h.db, tenantID, it))
		return
	}
	if err := h.db.Model(&it).Where("id = ? AND tenant_id = ?", id, tenantID).Updates(updates).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&it)
	response.OK(c, serializeKnowledge(h.db, tenantID, it))
}

func (h *KnowledgeHandler) remove(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的知识卡片 ID")
		return
	}
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).Delete(&models.ResearchKnowledgeItem{}).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// serializeKnowledge renders a knowledge item to the public shape, resolving the
// linked project's display name when present.
func serializeKnowledge(db *gorm.DB, tenantID int64, it models.ResearchKnowledgeItem) gin.H {
	projName := ""
	if it.ProjectID != nil {
		var p models.ResearchProject
		if db.Where("id = ? AND tenant_id = ?", *it.ProjectID, tenantID).First(&p).Error == nil {
			projName = projectName(p)
		}
	}
	return gin.H{
		"id":         it.ID,
		"title":      it.Title,
		"content":    it.Content,
		"tags":       it.Tags,
		"source":     it.Source,
		"projectId":  it.ProjectID,
		"projectName": projName,
		"createdAt":  it.CreatedAt,
		"updatedAt":  it.UpdatedAt,
	}
}

func dedupeTags(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, t := range in {
		t = strings.TrimSpace(t)
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return def
	}
	return n
}
