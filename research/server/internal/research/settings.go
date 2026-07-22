package research

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

var defaultMarketingKeywords = []string{
	"Earn $", "Get Rich", "AI Millionaire", "No Code", "Passive Income",
	"10000/month", "$10,000/month", "Make Money Online", "Work From Home",
	"Limited Time Offer", "Act Now", "Buy Now", "Click Here", "Free Trial",
	"Subscribe Now", "Unsubscribe", "You won", "Congratulations",
	"Claim your prize", "Double your income",
}

var defaultVerifySources = []string{"google", "github", "producthunt", "reddit"}

type SettingsHandler struct {
	db *gorm.DB
}

func NewSettingsHandler(db *gorm.DB) *SettingsHandler {
	return &SettingsHandler{db: db}
}

func (h *SettingsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/settings", auth, h.get)
	rg.PUT("/settings", auth, h.update)
}

type settingsDTO struct {
	MarketingKeywords    []string `json:"marketingKeywords"`
	ReportCronLocal      string   `json:"reportCronLocal"`
	EnabledVerifySources []string `json:"enabledVerifySources"`
}

type updateSettingsDTO struct {
	MarketingKeywords    []string `json:"marketingKeywords"`
	ReportCronLocal      string   `json:"reportCronLocal"`
	EnabledVerifySources []string `json:"enabledVerifySources"`
}

func (h *SettingsHandler) get(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	response.OK(c, h.resolveSettings(tenantID))
}

func (h *SettingsHandler) update(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var req updateSettingsDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "请求参数无效")
		return
	}

	var settings models.ResearchSettings
	err := h.db.Where("tenant_id = ?", tenantID).First(&settings).Error
	if err == gorm.ErrRecordNotFound {
		settings = models.ResearchSettings{
			ResearchBase:         models.ResearchBase{TenantID: tenantID},
			MarketingKeywords:    pq.StringArray(defaultMarketingKeywords),
			ReportCronLocal:      "21:00",
			EnabledVerifySources: pq.StringArray(defaultVerifySources),
		}
	}

	if req.MarketingKeywords != nil {
		settings.MarketingKeywords = pq.StringArray(req.MarketingKeywords)
	}
	if req.ReportCronLocal != "" {
		settings.ReportCronLocal = req.ReportCronLocal
	}
	if req.EnabledVerifySources != nil {
		settings.EnabledVerifySources = pq.StringArray(req.EnabledVerifySources)
	}

	h.db.Save(&settings)

	response.OK(c, settingsDTO{
		MarketingKeywords:    []string(settings.MarketingKeywords),
		ReportCronLocal:      settings.ReportCronLocal,
		EnabledVerifySources: []string(settings.EnabledVerifySources),
	})
}

func (h *SettingsHandler) resolveSettings(tenantID int64) settingsDTO {
	var settings models.ResearchSettings
	if err := h.db.Where("tenant_id = ?", tenantID).First(&settings).Error; err != nil {
		return settingsDTO{
			MarketingKeywords:    defaultMarketingKeywords,
			ReportCronLocal:      "21:00",
			EnabledVerifySources: defaultVerifySources,
		}
	}

	mk := defaultMarketingKeywords
	if len(settings.MarketingKeywords) > 0 {
		mk = []string(settings.MarketingKeywords)
	}
	ev := defaultVerifySources
	if len(settings.EnabledVerifySources) > 0 {
		ev = []string(settings.EnabledVerifySources)
	}
	cron := settings.ReportCronLocal
	if cron == "" {
		cron = "21:00"
	}

	return settingsDTO{
		MarketingKeywords:    mk,
		ReportCronLocal:      cron,
		EnabledVerifySources: ev,
	}
}
