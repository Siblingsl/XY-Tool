package models

import (
	"github.com/google/uuid"
)

// ResearchAutomationRule is a tenant automation rule. conditions_json and
// actions_json are stored as TEXT (JSON) to avoid extra dependencies.
// ID/TenantID/CreatedAt/UpdatedAt are provided by the embedded ResearchBase.
type ResearchAutomationRule struct {
	ResearchBase
	UserID     *int64  `gorm:"column:user_id;type:bigint" json:"userId"`
	Name       string  `gorm:"column:name;size:255;not null" json:"name"`
	Enabled    bool    `gorm:"column:enabled;not null;default:true" json:"enabled"`
	Priority   int     `gorm:"column:priority;not null;default:100" json:"priority"`
	EventType  string  `gorm:"column:event_type;size:40;not null;index" json:"eventType"`
	Conditions string  `gorm:"column:conditions_json;type:text" json:"conditions"`
	Actions    string  `gorm:"column:actions_json;type:text" json:"actions"`
}

func (ResearchAutomationRule) TableName() string { return "research_automation_rules" }

// ResearchRuleExecution is a record of a single rule evaluation/execution for
// an event. action_results_json holds a JSON array of per-action results.
type ResearchRuleExecution struct {
	ResearchBase
	RuleID        uuid.UUID `gorm:"column:rule_id;type:uuid;not null;index" json:"ruleId"`
	EventType     string    `gorm:"column:event_type;size:40;not null" json:"eventType"`
	ProjectID     uuid.UUID `gorm:"column:project_id;type:uuid;not null;index" json:"projectId"`
	Triggered     bool      `gorm:"column:triggered;not null;default:false" json:"triggered"`
	Matched       bool      `gorm:"column:matched;not null;default:false" json:"matched"`
	ActionResults string    `gorm:"column:action_results_json;type:text" json:"actionResults"`
	Error         *string   `gorm:"column:error;type:text" json:"error"`
}

func (ResearchRuleExecution) TableName() string { return "research_rule_executions" }
