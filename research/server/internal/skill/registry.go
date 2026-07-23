package skill

import (
	"context"
	"encoding/json"
)

// EmailInput 技能执行时的邮件上下文
type EmailInput struct {
	EmailID   string
	Subject   string
	FromAddr  string
	BodyText  string
	Links     []string
	Categories []string
}

// SkillOutput 技能执行结果
type SkillOutput struct {
	Result map[string]interface{} `json:"result"`
}

// Skill 技能统一接口
type Skill interface {
	// Key 唯一标识
	Key() string
	// Name 显示名称
	Name() string
	// Description 描述
	Description() string
	// DefaultEnabled 默认是否启用
	DefaultEnabled() bool
	// DefaultPriority 默认执行优先级（越小越先执行）
	DefaultPriority() int
	// Execute 执行技能，返回结构化结果
	Execute(ctx context.Context, input EmailInput, config json.RawMessage) (*SkillOutput, error)
}

// Registry 技能注册表
type Registry struct {
	skills map[string]Skill
	order  []string
}

func NewRegistry() *Registry {
	return &Registry{
		skills: make(map[string]Skill),
	}
}

func (r *Registry) Register(s Skill) {
	r.skills[s.Key()] = s
	r.order = append(r.order, s.Key())
}

func (r *Registry) Get(key string) (Skill, bool) {
	s, ok := r.skills[key]
	return s, ok
}

func (r *Registry) All() []Skill {
	out := make([]Skill, 0, len(r.order))
	for _, k := range r.order {
		out = append(out, r.skills[k])
	}
	return out
}

// DefaultRegistry 全局默认注册表（含内置技能）
func DefaultRegistry() *Registry {
	reg := NewRegistry()
	reg.Register(&ClassifySkill{})
	reg.Register(&SummarizeSkill{})
	reg.Register(&SentimentSkill{})
	reg.Register(&KeywordExtractSkill{})
	return reg
}
