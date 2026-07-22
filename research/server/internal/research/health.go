package research

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/health", h.health)
}

func (h *HealthHandler) health(c *gin.Context) {
	response.OK(c, gin.H{
		"ok":        true,
		"zone":      "research",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
