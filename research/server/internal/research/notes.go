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

type NotesHandler struct {
	db *gorm.DB
}

func NewNotesHandler(db *gorm.DB) *NotesHandler {
	return &NotesHandler{db: db}
}

func (h *NotesHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/projects/:id/notes", auth, h.list)
	rg.POST("/projects/:id/notes", auth, h.create)
	rg.PUT("/notes/:noteId", auth, h.update)
	rg.DELETE("/notes/:noteId", auth, h.remove)
}

func (h *NotesHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var notes []models.ResearchProjectNote
	h.db.Where("tenant_id = ? AND project_id = ?", tenantID, id).Order("updated_at DESC").Find(&notes)

	items := make([]gin.H, 0, len(notes))
	for _, n := range notes {
		items = append(items, gin.H{
			"id":        n.ID,
			"content":   n.Content,
			"createdAt": n.CreatedAt,
			"updatedAt": n.UpdatedAt,
		})
	}
	response.OK(c, items)
}

func (h *NotesHandler) create(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的项目 ID")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Content == "" {
		response.Error(c, http.StatusBadRequest, "缺少 content")
		return
	}

	uid := middleware.UserID(c)
	note := models.ResearchProjectNote{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    id,
		Content:      body.Content,
	}
	if uid != 0 {
		u := uid
		note.UserID = &u
	}
	if err := h.db.Create(&note).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建笔记失败")
		return
	}
	response.OK(c, gin.H{
		"id":        note.ID,
		"content":   note.Content,
		"createdAt": note.CreatedAt,
		"updatedAt": note.UpdatedAt,
	})
}

func (h *NotesHandler) update(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	noteID, err := uuid.Parse(c.Param("noteId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的笔记 ID")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Content == "" {
		response.Error(c, http.StatusBadRequest, "缺少 content")
		return
	}

	var note models.ResearchProjectNote
	if err := h.db.Where("id = ? AND tenant_id = ?", noteID, tenantID).First(&note).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Note not found")
		return
	}
	if err := h.db.Model(&note).Where("id = ? AND tenant_id = ?", noteID, tenantID).Update("content", body.Content).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新笔记失败")
		return
	}
	note.Content = body.Content
	response.OK(c, gin.H{
		"id":        note.ID,
		"content":   note.Content,
		"createdAt": note.CreatedAt,
		"updatedAt": note.UpdatedAt,
	})
}

func (h *NotesHandler) remove(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	noteID, err := uuid.Parse(c.Param("noteId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的笔记 ID")
		return
	}

	if err := h.db.Where("id = ? AND tenant_id = ?", noteID, tenantID).
		Delete(&models.ResearchProjectNote{}).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "删除笔记失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}
