package research

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type NotificationHandler struct {
	db *gorm.DB
}

func NewNotificationHandler(db *gorm.DB) *NotificationHandler {
	return &NotificationHandler{db: db}
}

func (h *NotificationHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/notifications", auth, h.list)
	rg.GET("/notifications/unread-count", auth, h.unreadCount)
	rg.POST("/notifications/:id/read", auth, h.markRead)
	rg.POST("/notifications/read-all", auth, h.markAllRead)
}

func (h *NotificationHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := h.db.Model(&models.ResearchNotification{}).Where("tenant_id = ?", tenantID)
	if v := c.Query("unread"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			q = q.Where("read = ?", !b) // unread=true => read=false
		}
	}
	if v := c.Query("type"); v != "" {
		q = q.Where("type = ?", v)
	}

	var total int64
	q.Count(&total)

	var items []models.ResearchNotification
	q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	out := make([]gin.H, 0, len(items))
	for _, n := range items {
		out = append(out, gin.H{
			"id":        n.ID,
			"type":      n.Type,
			"title":     n.Title,
			"body":      n.Body,
			"refType":   n.RefType,
			"refId":     n.RefID,
			"read":      n.Read,
			"createdAt": n.CreatedAt,
		})
	}
	response.OK(c, gin.H{
		"items":    out,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *NotificationHandler) unreadCount(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var count int64
	h.db.Model(&models.ResearchNotification{}).
		Where("tenant_id = ? AND read = ?", tenantID, false).Count(&count)
	response.OK(c, gin.H{"count": count})
}

func (h *NotificationHandler) markRead(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的通知 ID")
		return
	}
	if err := h.db.Model(&models.ResearchNotification{}).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		Update("read", true).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}

func (h *NotificationHandler) markAllRead(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	if err := h.db.Model(&models.ResearchNotification{}).
		Where("tenant_id = ?", tenantID).
		Update("read", true).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// CreateNotification builds and persists a ResearchNotification. It is a
// package-level helper so the competitor scan and rule engine can reuse it.
// userID may be nil for tenant-shared notifications. refID is the referenced
// entity id as a string (e.g. project id).
func CreateNotification(db *gorm.DB, tenantID int64, userID *int64, typ, title, body, refType, refID string) error {
	n := models.ResearchNotification{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Type:         typ,
		Title:        title,
		Body:         body,
		RefType:      refType,
	}
	if userID != nil {
		u := *userID
		n.UserID = &u
	}
	if refID != "" {
		r := refID
		n.RefID = &r
	}
	return db.Create(&n).Error
}
