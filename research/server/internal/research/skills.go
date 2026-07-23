package research

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"github.com/siblingsl/xy-tool/research-server/internal/skill"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type SkillsHandler struct {
	db       *gorm.DB
	registry *skill.Registry
}

func NewSkillsHandler(db *gorm.DB, registry *skill.Registry) *SkillsHandler {
	return &SkillsHandler{db: db, registry: registry}
}

func (h *SkillsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/skills", auth, h.list)
	rg.PUT("/skills/:key", auth, h.update)
	rg.POST("/skills/:key/test", auth, h.test)
	rg.GET("/skills/results/:emailId", auth, h.results)
}

type skillDTO struct {
	Key            string          `json:"key"`
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Enabled        bool            `json:"enabled"`
	Priority       int             `json:"priority"`
	ConfigJSON     json.RawMessage `json:"configJson"`
}

// list 返回所有可用技能及当前租户的启用状态
func (h *SkillsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)

	// 加载租户已保存的技能配置
	var saved []models.ResearchSkill
	h.db.Where("tenant_id = ?", tenantID).Find(&saved)
	savedMap := map[string]models.ResearchSkill{}
	for _, s := range saved {
		savedMap[s.SkillKey] = s
	}

	// 合并注册表 + 租户配置
	items := []skillDTO{}
	for _, sk := range h.registry.All() {
		dto := skillDTO{
			Key:         sk.Key(),
			Name:        sk.Name(),
			Description: sk.Description(),
			Enabled:     sk.DefaultEnabled(),
			Priority:    sk.DefaultPriority(),
			ConfigJSON:  nil,
		}
		if s, ok := savedMap[sk.Key()]; ok {
			dto.Enabled = s.Enabled
			dto.Priority = s.Priority
			// Empty non-nil RawMessage fails JSON marshal → HTTP 500
			if len(s.ConfigJSON) > 0 {
				dto.ConfigJSON = json.RawMessage(s.ConfigJSON)
			}
		}
		items = append(items, dto)
	}

	response.OK(c, items)
}

type updateSkillDTO struct {
	Enabled    *bool           `json:"enabled"`
	Priority   *int            `json:"priority"`
	ConfigJSON json.RawMessage `json:"configJson"`
}

// update 启用/禁用/配置某个技能
func (h *SkillsHandler) update(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	key := c.Param("key")

	if _, ok := h.registry.Get(key); !ok {
		response.Error(c, http.StatusNotFound, "技能不存在")
		return
	}

	var req updateSkillDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "请求参数无效")
		return
	}

	var record models.ResearchSkill
	err := h.db.Where("tenant_id = ? AND skill_key = ?", tenantID, key).First(&record).Error
	if err == gorm.ErrRecordNotFound {
		sk, _ := h.registry.Get(key)
		record = models.ResearchSkill{
			ResearchBase: models.ResearchBase{TenantID: tenantID},
			SkillKey:     key,
			Enabled:      sk.DefaultEnabled(),
			Priority:     sk.DefaultPriority(),
		}
	} else if err != nil {
		response.Error(c, http.StatusInternalServerError, "数据库错误")
		return
	}

	if req.Enabled != nil {
		record.Enabled = *req.Enabled
	}
	if req.Priority != nil {
		record.Priority = *req.Priority
	}
	if req.ConfigJSON != nil && len(req.ConfigJSON) > 0 {
		record.ConfigJSON = datatypes.JSON(req.ConfigJSON)
	}

	h.db.Save(&record)

	response.OK(c, gin.H{"message": "ok", "skillKey": key, "enabled": record.Enabled})
}

type testSkillDTO struct {
	Subject  string `json:"subject"`
	BodyText string `json:"bodyText"`
}

// test 用自定义文本测试某个技能
func (h *SkillsHandler) test(c *gin.Context) {
	key := c.Param("key")
	sk, ok := h.registry.Get(key)
	if !ok {
		response.Error(c, http.StatusNotFound, "技能不存在")
		return
	}

	var req testSkillDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "请求参数无效")
		return
	}

	input := skill.EmailInput{
		Subject:  req.Subject,
		BodyText: req.BodyText,
	}

	output, err := sk.Execute(c.Request.Context(), input, nil)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "技能执行失败: "+err.Error())
		return
	}

	response.OK(c, output.Result)
}

// results 查看某封邮件的所有技能执行结果
func (h *SkillsHandler) results(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	emailID := c.Param("emailId")

	var results []models.ResearchSkillResult
	h.db.Where("tenant_id = ? AND email_id = ?", tenantID, emailID).
		Order("created_at ASC").Find(&results)

	response.OK(c, results)
}
