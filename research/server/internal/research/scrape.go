package research

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

// ScrapeHandler exposes on-demand webpage scraping (preview + save to the
// knowledge base) and CRUD over scheduled scrape jobs. All tenant-scoped.
type ScrapeHandler struct {
	db *gorm.DB
}

func NewScrapeHandler(db *gorm.DB) *ScrapeHandler {
	return &ScrapeHandler{db: db}
}

func (h *ScrapeHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.POST("/knowledge/scrape", auth, h.scrape)
	rg.GET("/scrape-jobs", auth, h.listJobs)
	rg.POST("/scrape-jobs", auth, h.createJob)
	rg.PUT("/scrape-jobs/:id", auth, h.updateJob)
	rg.DELETE("/scrape-jobs/:id", auth, h.deleteJob)
	rg.POST("/scrape-jobs/:id/run", auth, h.runJob)
}

// scrape extracts a webpage and optionally persists it as a web-sourced
// knowledge card. save=false returns only the extracted preview.
func (h *ScrapeHandler) scrape(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		URL  string `json:"url"`
		Save bool   `json:"save"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !isHTTPURL(body.URL) {
		response.Error(c, http.StatusBadRequest, "请提供合法的 http/https 链接")
		return
	}
	extracted, err := FetchAndExtract(body.URL)
	if err != nil {
		response.Error(c, http.StatusBadGateway, "抓取失败: "+err.Error())
		return
	}
	out := gin.H{"extracted": extracted}
	if body.Save {
		item := models.ResearchKnowledgeItem{
			ResearchBase: models.ResearchBase{TenantID: tenantID},
			Title:        firstNonEmpty(extracted.Title, domainOf(body.URL)),
			Content:      extracted.Text,
			Tags:         pq.StringArray(dedupeTags([]string{domainOf(body.URL), "web"})),
			Source:       "web",
		}
		if err := h.db.Create(&item).Error; err != nil {
			response.Error(c, http.StatusInternalServerError, "保存到知识库失败")
			return
		}
		out["item"] = serializeKnowledge(h.db, tenantID, item)
	}
	response.OK(c, out)
}

func (h *ScrapeHandler) listJobs(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var jobs []models.ResearchScrapeJob
	h.db.Where("tenant_id = ?", tenantID).Order("created_at DESC").Find(&jobs)
	out := make([]gin.H, 0, len(jobs))
	for _, j := range jobs {
		out = append(out, serializeJob(j))
	}
	response.OK(c, gin.H{"items": out})
}

func (h *ScrapeHandler) createJob(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		URL             string `json:"url"`
		Title           string `json:"title"`
		IntervalMinutes int    `json:"intervalMinutes"`
		Enabled         *bool  `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !isHTTPURL(body.URL) {
		response.Error(c, http.StatusBadRequest, "请提供合法的 http/https 链接")
		return
	}
	iv := body.IntervalMinutes
	if iv < 1 {
		iv = 1440
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	job := models.ResearchScrapeJob{
		ResearchBase:    models.ResearchBase{TenantID: tenantID},
		URL:             body.URL,
		Title:           body.Title,
		IntervalMinutes: iv,
		Enabled:         enabled,
		LastStatus:      "pending",
	}
	if err := h.db.Create(&job).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建抓取任务失败")
		return
	}
	response.OK(c, serializeJob(job))
}

func (h *ScrapeHandler) updateJob(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的任务 ID")
		return
	}
	var body struct {
		URL             *string `json:"url"`
		Title           *string `json:"title"`
		IntervalMinutes *int    `json:"intervalMinutes"`
		Enabled         *bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "无效请求体")
		return
	}
	var job models.ResearchScrapeJob
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&job).Error; err != nil {
		response.Error(c, http.StatusNotFound, "scrape job not found")
		return
	}
	updates := map[string]interface{}{}
	if body.URL != nil {
		if !isHTTPURL(*body.URL) {
			response.Error(c, http.StatusBadRequest, "请提供合法的 http/https 链接")
			return
		}
		updates["url"] = *body.URL
	}
	if body.Title != nil {
		updates["title"] = *body.Title
	}
	if body.IntervalMinutes != nil {
		if *body.IntervalMinutes < 1 {
			response.Error(c, http.StatusBadRequest, "间隔分钟需 ≥ 1")
			return
		}
		updates["interval_minutes"] = *body.IntervalMinutes
	}
	if body.Enabled != nil {
		updates["enabled"] = *body.Enabled
	}
	if len(updates) == 0 {
		response.OK(c, serializeJob(job))
		return
	}
	if err := h.db.Model(&job).Where("id = ? AND tenant_id = ?", id, tenantID).Updates(updates).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&job)
	response.OK(c, serializeJob(job))
}

func (h *ScrapeHandler) deleteJob(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的任务 ID")
		return
	}
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).Delete(&models.ResearchScrapeJob{}).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// runJob triggers a single scrape immediately and persists the result.
func (h *ScrapeHandler) runJob(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的任务 ID")
		return
	}
	var job models.ResearchScrapeJob
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&job).Error; err != nil {
		response.Error(c, http.StatusNotFound, "scrape job not found")
		return
	}
	runOneScrapeJob(h.db, job)
	response.OK(c, gin.H{"ok": true})
}

func serializeJob(j models.ResearchScrapeJob) gin.H {
	return gin.H{
		"id":              j.ID,
		"url":             j.URL,
		"title":           j.Title,
		"intervalMinutes": j.IntervalMinutes,
		"enabled":         j.Enabled,
		"lastRunAt":       j.LastRunAt,
		"lastStatus":      j.LastStatus,
		"lastError":       j.LastError,
		"createdAt":       j.CreatedAt,
		"updatedAt":       j.UpdatedAt,
	}
}
