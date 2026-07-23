package models

import (
	"gorm.io/datatypes"
)

// ResearchSkill 存储每个租户的技能启用/配置状态
type ResearchSkill struct {
	ResearchBase
	SkillKey   string         `gorm:"column:skill_key;size:50;not null" json:"skillKey"`
	Enabled    bool           `gorm:"not null;default:false" json:"enabled"`
	Priority   int            `gorm:"not null;default:0" json:"priority"`
	ConfigJSON datatypes.JSON `gorm:"column:config_json;type:jsonb" json:"configJson"`
}

func (ResearchSkill) TableName() string { return "research_skills" }

// ResearchSkillResult 存储技能对某封邮件的执行结果
type ResearchSkillResult struct {
	ResearchBase
	EmailID    string         `gorm:"column:email_id;type:uuid;not null;index" json:"emailId"`
	SkillKey   string         `gorm:"column:skill_key;size:50;not null;index" json:"skillKey"`
	Status     string         `gorm:"size:20;not null;default:pending" json:"status"` // pending / done / failed / skipped
	OutputJSON datatypes.JSON `gorm:"column:output_json;type:jsonb" json:"outputJson"`
	Error      *string        `gorm:"type:text" json:"error"`
}

func (ResearchSkillResult) TableName() string { return "research_skill_results" }
