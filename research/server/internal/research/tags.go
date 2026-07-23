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

type TagsHandler struct {
	db *gorm.DB
}

func NewTagsHandler(db *gorm.DB) *TagsHandler {
	return &TagsHandler{db: db}
}

func (h *TagsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/projects/:id/tags", auth, h.list)
	rg.POST("/projects/:id/tags", auth, h.create)
	rg.DELETE("/projects/:id/tags/:tag", auth, h.remove)
}

func (h *TagsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var tags []models.ResearchProjectTag
	h.db.Where("tenant_id = ? AND project_id = ?", tenantID, id).Order("tag ASC").Find(&tags)

	items := make([]gin.H, 0, len(tags))
	for _, t := range tags {
		items = append(items, gin.H{
			"id":        t.ID,
			"tag":       t.Tag,
			"createdAt": t.CreatedAt,
		})
	}
	response.OK(c, items)
}

func (h *TagsHandler) create(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var body struct {
		Tag string `json:"tag"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Tag == "" {
		response.Error(c, http.StatusBadRequest, "缺少 tag")
		return
	}

	// Existence check (de-dup against the unique index).
	var existing models.ResearchProjectTag
	if err := h.db.Where("tenant_id = ? AND project_id = ? AND tag = ?", tenantID, id, body.Tag).First(&existing).Error; err == nil {
		response.OK(c, gin.H{"id": existing.ID, "tag": existing.Tag})
		return
	}

	uid := middleware.UserID(c)
	tag := models.ResearchProjectTag{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    id,
		Tag:          body.Tag,
	}
	if uid != 0 {
		u := uid
		tag.UserID = &u
	}
	if err := h.db.Create(&tag).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建标签失败")
		return
	}
	response.OK(c, gin.H{"id": tag.ID, "tag": tag.Tag})
}

func (h *TagsHandler) remove(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}
	tag := c.Param("tag")

	if err := h.db.Where("tenant_id = ? AND project_id = ? AND tag = ?", tenantID, id, tag).
		Delete(&models.ResearchProjectTag{}).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "删除标签失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}
