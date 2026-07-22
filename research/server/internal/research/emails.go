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

type EmailsHandler struct {
	db *gorm.DB
}

func NewEmailsHandler(db *gorm.DB) *EmailsHandler {
	return &EmailsHandler{db: db}
}

func (h *EmailsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/emails", auth, h.list)
	rg.GET("/emails/:id", auth, h.get)
}

func (h *EmailsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := h.db.Model(&models.ResearchEmail{}).Where("tenant_id = ?", tenantID)
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if category := c.Query("category"); category != "" {
		q = q.Where("? = ANY(categories)", category)
	}

	var total int64
	q.Count(&total)

	var items []models.ResearchEmail
	q.Order("received_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items)

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *EmailsHandler) get(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的邮件 ID")
		return
	}

	var email models.ResearchEmail
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&email).Error; err != nil {
		response.OK(c, nil)
		return
	}

	response.OK(c, email)
}
