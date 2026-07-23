package skill

import (
	"context"
	"encoding/json"
	"log"
	"sort"

	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"gorm.io/gorm"
)

// Executor 负责按租户配置执行已启用的技能
type Executor struct {
	db       *gorm.DB
	registry *Registry
}

func NewExecutor(db *gorm.DB, registry *Registry) *Executor {
	return &Executor{db: db, registry: registry}
}

// RunForEmail 对单封邮件执行所有已启用的技能
func (e *Executor) RunForEmail(ctx context.Context, tenantID int64, email *models.ResearchEmail) {
	// 加载租户已启用的技能配置
	var configs []models.ResearchSkill
	e.db.Where("tenant_id = ? AND enabled = ?", tenantID, true).
		Order("priority ASC").Find(&configs)

	if len(configs) == 0 {
		return
	}

	// 构建输入
	var links []string
	if email.ExtractedJSON != nil {
		var extracted struct {
			Links []string `json:"links"`
		}
		if err := json.Unmarshal(email.ExtractedJSON, &extracted); err == nil {
			links = extracted.Links
		}
	}

	bodyText := ""
	if email.BodyText != nil {
		bodyText = *email.BodyText
	}

	input := EmailInput{
		EmailID:    email.ID.String(),
		Subject:    email.Subject,
		FromAddr:   email.FromAddr,
		BodyText:   bodyText,
		Links:      links,
		Categories: []string(email.Categories),
	}

	// 按优先级排序执行
	sort.Slice(configs, func(i, j int) bool {
		return configs[i].Priority < configs[j].Priority
	})

	for _, cfg := range configs {
		sk, ok := e.registry.Get(cfg.SkillKey)
		if !ok {
			continue
		}

		// 检查是否已有结果（幂等）
		var existing int64
		e.db.Model(&models.ResearchSkillResult{}).
			Where("email_id = ? AND skill_key = ? AND status = ?", email.ID.String(), cfg.SkillKey, "done").
			Count(&existing)
		if existing > 0 {
			continue
		}

		result := models.ResearchSkillResult{
			ResearchBase: models.ResearchBase{TenantID: tenantID},
			EmailID:      email.ID.String(),
			SkillKey:     cfg.SkillKey,
			Status:       "running",
		}
		e.db.Create(&result)

		var cfgJSON json.RawMessage
		if len(cfg.ConfigJSON) > 0 {
			cfgJSON = json.RawMessage(cfg.ConfigJSON)
		}
		output, err := sk.Execute(ctx, input, cfgJSON)
		if err != nil {
			errMsg := err.Error()
			e.db.Model(&result).Updates(map[string]interface{}{
				"status": "failed",
				"error":  errMsg,
			})
			log.Printf("skill %s failed for email %s: %v", cfg.SkillKey, email.ID, err)
			continue
		}

		outJSON, _ := json.Marshal(output.Result)
		e.db.Model(&result).Updates(map[string]interface{}{
			"status":      "done",
			"output_json": outJSON,
		})

		// 如果是分类技能，回写 categories 到邮件
		if cfg.SkillKey == "classify" {
			if cats, ok := output.Result["categories"].([]string); ok && len(cats) > 0 {
				e.db.Model(email).Update("categories", cats)
			}
		}
	}
}

// RunForTenant 对租户所有 pending 状态的邮件执行技能
func (e *Executor) RunForTenant(ctx context.Context, tenantID int64) int {
	var emails []models.ResearchEmail
	e.db.Where("tenant_id = ? AND status = ?", tenantID, "pending").
		Limit(100).Find(&emails)

	count := 0
	for i := range emails {
		e.RunForEmail(ctx, tenantID, &emails[i])
		count++
	}
	return count
}
