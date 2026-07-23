package skill

import (
	"context"
	"encoding/json"
	"strings"
)

// ============ classify 自动分类 ============

type ClassifySkill struct{}

func (s *ClassifySkill) Key() string            { return "classify" }
func (s *ClassifySkill) Name() string           { return "智能分类" }
func (s *ClassifySkill) Description() string    { return "根据邮件内容自动分类（技术/商业/营销/产品/其他）" }
func (s *ClassifySkill) DefaultEnabled() bool   { return true }
func (s *ClassifySkill) DefaultPriority() int   { return 10 }

func (s *ClassifySkill) Execute(_ context.Context, input EmailInput, _ json.RawMessage) (*SkillOutput, error) {
	text := strings.ToLower(input.Subject + " " + input.BodyText)

	categories := []string{}
	if containsAny(text, "github", "api", "sdk", "open source", "release", "commit", "framework", "library", "code") {
		categories = append(categories, "技术")
	}
	if containsAny(text, "revenue", "funding", "startup", "business", "market", "pricing", "customer", "saas") {
		categories = append(categories, "商业")
	}
	if containsAny(text, "product", "launch", "feature", "beta", "demo", "app", "tool", "platform") {
		categories = append(categories, "产品")
	}
	if containsAny(text, "discount", "offer", "subscribe", "free trial", "limited", "deal", "buy now", "earn $") {
		categories = append(categories, "营销")
	}
	if len(categories) == 0 {
		categories = append(categories, "其他")
	}

	return &SkillOutput{Result: map[string]interface{}{
		"categories": categories,
	}}, nil
}

// ============ summarize 摘要提取 ============

type SummarizeSkill struct{}

func (s *SummarizeSkill) Key() string            { return "summarize" }
func (s *SummarizeSkill) Name() string           { return "摘要提取" }
func (s *SummarizeSkill) Description() string    { return "提取邮件核心内容，生成一句话摘要" }
func (s *SummarizeSkill) DefaultEnabled() bool   { return true }
func (s *SummarizeSkill) DefaultPriority() int   { return 20 }

func (s *SummarizeSkill) Execute(_ context.Context, input EmailInput, _ json.RawMessage) (*SkillOutput, error) {
	body := input.BodyText
	if body == "" {
		body = input.Subject
	}

	// 取前200字符作为摘要基础，截断到句子边界
	summary := body
	if len(summary) > 200 {
		summary = summary[:200]
		if idx := strings.LastIndexAny(summary, ".。!！?？\n"); idx > 50 {
			summary = summary[:idx+1]
		}
	}
	summary = strings.TrimSpace(summary)

	return &SkillOutput{Result: map[string]interface{}{
		"summary":    summary,
		"subject":    input.Subject,
		"bodyLength": len(body),
	}}, nil
}

// ============ sentiment 情感分析 ============

type SentimentSkill struct{}

func (s *SentimentSkill) Key() string            { return "sentiment" }
func (s *SentimentSkill) Name() string           { return "情感分析" }
func (s *SentimentSkill) Description() string    { return "分析邮件情感倾向（正面/中性/负面）" }
func (s *SentimentSkill) DefaultEnabled() bool   { return false }
func (s *SentimentSkill) DefaultPriority() int   { return 30 }

func (s *SentimentSkill) Execute(_ context.Context, input EmailInput, _ json.RawMessage) (*SkillOutput, error) {
	text := strings.ToLower(input.Subject + " " + input.BodyText)

	positiveWords := []string{"great", "amazing", "exciting", "love", "awesome", "fantastic", "congratulations", "success", "growth", "impressive", "innovative"}
	negativeWords := []string{"urgent", "warning", "problem", "issue", "fail", "error", "spam", "scam", "risk", "threat", "expired", "last chance"}

	posCount := 0
	negCount := 0
	for _, w := range positiveWords {
		posCount += strings.Count(text, w)
	}
	for _, w := range negativeWords {
		negCount += strings.Count(text, w)
	}

	sentiment := "neutral"
	if posCount > negCount+1 {
		sentiment = "positive"
	} else if negCount > posCount+1 {
		sentiment = "negative"
	}

	return &SkillOutput{Result: map[string]interface{}{
		"sentiment":  sentiment,
		"posScore":   posCount,
		"negScore":   negCount,
	}}, nil
}

// ============ keyword_extract 关键词提取 ============

type KeywordExtractSkill struct{}

func (s *KeywordExtractSkill) Key() string            { return "keyword_extract" }
func (s *KeywordExtractSkill) Name() string           { return "关键词提取" }
func (s *KeywordExtractSkill) Description() string    { return "从邮件中提取高频关键词和关键链接" }
func (s *KeywordExtractSkill) DefaultEnabled() bool   { return true }
func (s *KeywordExtractSkill) DefaultPriority() int   { return 40 }

func (s *KeywordExtractSkill) Execute(_ context.Context, input EmailInput, _ json.RawMessage) (*SkillOutput, error) {
	text := strings.ToLower(input.Subject + " " + input.BodyText)

	// 简单词频统计（过滤短词和停用词）
	stopWords := map[string]bool{
		"the": true, "and": true, "for": true, "that": true, "this": true,
		"with": true, "from": true, "have": true, "will": true, "your": true,
		"you": true, "are": true, "was": true, "not": true, "but": true,
		"can": true, "has": true, "our": true, "all": true, "been": true,
		"more": true, "than": true, "its": true, "into": true, "also": true,
	}

	words := strings.FieldsFunc(text, func(r rune) bool {
		return !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'))
	})

	freq := map[string]int{}
	for _, w := range words {
		if len(w) < 3 || stopWords[w] {
			continue
		}
		freq[w]++
	}

	// 取 top 10
	type kv struct {
		Word  string `json:"word"`
		Count int    `json:"count"`
	}
	top := []kv{}
	for w, c := range freq {
		top = append(top, kv{Word: w, Count: c})
	}
	// 简单排序
	for i := 0; i < len(top); i++ {
		for j := i + 1; j < len(top); j++ {
			if top[j].Count > top[i].Count {
				top[i], top[j] = top[j], top[i]
			}
		}
	}
	if len(top) > 10 {
		top = top[:10]
	}

	return &SkillOutput{Result: map[string]interface{}{
		"keywords":  top,
		"linkCount": len(input.Links),
	}}, nil
}

// ============ helpers ============

func containsAny(text string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(text, kw) {
			return true
		}
	}
	return false
}
