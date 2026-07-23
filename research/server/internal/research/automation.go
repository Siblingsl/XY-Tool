package research

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/gorm"
)

type AutomationHandler struct {
	db *gorm.DB
}

func NewAutomationHandler(db *gorm.DB) *AutomationHandler {
	return &AutomationHandler{db: db}
}

func (h *AutomationHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/automation-rules", auth, h.listRules)
	rg.POST("/automation-rules", auth, h.createRule)
	rg.PUT("/automation-rules/:id", auth, h.updateRule)
	rg.DELETE("/automation-rules/:id", auth, h.deleteRule)
	rg.GET("/automation-rules/:id/executions", auth, h.listExecutions)
	rg.POST("/automation-rules/_simulate", auth, h.simulate)
}

// safego runs fn in a new goroutine, recovering from panics so a failing hook
// never affects the main request flow.
func safego(fn func()) {
	go func() {
		defer func() { _ = recover() }()
		fn()
	}()
}

// FireProjectEvent is the unified dispatch entry: it fires the competitor scan
// and the rule engine for an event, asynchronously and safely.
func FireProjectEvent(db *gorm.DB, tenantID int64, eventType string, project models.ResearchProject, oldVerdict *string) {
	safego(func() {
		RunCompetitorScan(db, tenantID, project)
		RunRuleEngine(db, tenantID, eventType, project, oldVerdict)
	})
}

// ---- condition / action node shapes ----

type condNode struct {
	Field string      `json:"field"`
	Op    string      `json:"op"`
	Value interface{} `json:"value"`
}

type actionNode struct {
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

// ---- CRUD ----

func (h *AutomationHandler) listRules(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	q := h.db.Model(&models.ResearchAutomationRule{}).Where("tenant_id = ?", tenantID)
	if v := c.Query("enabled"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			q = q.Where("enabled = ?", b)
		}
	}
	var rules []models.ResearchAutomationRule
	q.Order("priority ASC, created_at DESC").Find(&rules)

	out := make([]gin.H, 0, len(rules))
	for _, r := range rules {
		out = append(out, h.ruleToJSON(r))
	}
	response.OK(c, out)
}

func (h *AutomationHandler) createRule(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		Name      string      `json:"name"`
		Enabled   *bool       `json:"enabled"`
		Priority  *int        `json:"priority"`
		EventType string      `json:"eventType"`
		Conditions interface{} `json:"conditions"`
		Actions   interface{} `json:"actions"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" || body.EventType == "" {
		response.Error(c, http.StatusBadRequest, "缺少 name 或 eventType")
		return
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	priority := 100
	if body.Priority != nil {
		priority = *body.Priority
	}

	uid := middleware.UserID(c)
	rule := models.ResearchAutomationRule{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Name:         body.Name,
		Enabled:      enabled,
		Priority:     priority,
		EventType:    body.EventType,
		Conditions:   toJSONString(body.Conditions),
		Actions:      toJSONString(body.Actions),
	}
	if uid != 0 {
		u := uid
		rule.UserID = &u
	}
	if err := h.db.Create(&rule).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建规则失败")
		return
	}
	response.OK(c, h.ruleToJSON(rule))
}

func (h *AutomationHandler) updateRule(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的规则 ID")
		return
	}

	var rule models.ResearchAutomationRule
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&rule).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Rule not found")
		return
	}

	var body struct {
		Name       *string     `json:"name"`
		Enabled    *bool       `json:"enabled"`
		Priority   *int        `json:"priority"`
		EventType  *string     `json:"eventType"`
		Conditions interface{} `json:"conditions"`
		Actions    interface{} `json:"actions"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "无效请求体")
		return
	}
	updates := map[string]interface{}{}
	if body.Name != nil {
		updates["name"] = *body.Name
	}
	if body.Enabled != nil {
		updates["enabled"] = *body.Enabled
	}
	if body.Priority != nil {
		updates["priority"] = *body.Priority
	}
	if body.EventType != nil {
		updates["event_type"] = *body.EventType
	}
	if body.Conditions != nil {
		updates["conditions_json"] = toJSONString(body.Conditions)
	}
	if body.Actions != nil {
		updates["actions_json"] = toJSONString(body.Actions)
	}
	if len(updates) == 0 {
		response.OK(c, h.ruleToJSON(rule))
		return
	}
	if err := h.db.Model(&rule).Where("id = ? AND tenant_id = ?", id, tenantID).Updates(updates).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	h.db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&rule)
	response.OK(c, h.ruleToJSON(rule))
}

func (h *AutomationHandler) deleteRule(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的规则 ID")
		return
	}
	if err := h.db.Where("id = ? AND tenant_id = ?", id, tenantID).Delete(&models.ResearchAutomationRule{}).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}
	response.OK(c, gin.H{"ok": true})
}

func (h *AutomationHandler) listExecutions(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	ruleID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的规则 ID")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := h.db.Model(&models.ResearchRuleExecution{}).Where("tenant_id = ? AND rule_id = ?", tenantID, ruleID)
	var total int64
	q.Count(&total)

	var execs []models.ResearchRuleExecution
	q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&execs)

	out := make([]gin.H, 0, len(execs))
	for _, e := range execs {
		var results interface{}
		_ = json.Unmarshal([]byte(e.ActionResults), &results)
		out = append(out, gin.H{
			"id":            e.ID,
			"ruleId":        e.RuleID,
			"eventType":     e.EventType,
			"projectId":     e.ProjectID,
			"triggered":     e.Triggered,
			"matched":       e.Matched,
			"actionResults": results,
			"error":         e.Error,
			"createdAt":     e.CreatedAt,
		})
	}
	response.OK(c, gin.H{
		"items":    out,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (h *AutomationHandler) simulate(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	var body struct {
		ProjectID uuid.UUID `json:"projectId"`
		EventType string    `json:"eventType"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.ProjectID == uuid.Nil {
		response.Error(c, http.StatusBadRequest, "缺少 projectId")
		return
	}
	eventType := body.EventType
	if eventType == "" {
		eventType = "project.created"
	}

	var project models.ResearchProject
	if err := h.db.Where("id = ? AND tenant_id = ?", body.ProjectID, tenantID).First(&project).Error; err != nil {
		response.Error(c, http.StatusNotFound, "Project not found")
		return
	}

	// Run synchronously for demo purposes (no pipeline needed).
	RunCompetitorScan(h.db, tenantID, project)
	RunRuleEngine(h.db, tenantID, eventType, project, nil)

	response.OK(c, gin.H{"message": "模拟执行完成，请查看竞品命中与规则执行记录"})
}

// ---- helpers ----

// toJSONString normalizes a conditions/actions payload (object or string) into a
// JSON text column value.
func toJSONString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

// ruleToJSON builds the API representation, deserializing conditions/actions
// from JSON text back into objects for the frontend.
func (h *AutomationHandler) ruleToJSON(rule models.ResearchAutomationRule) gin.H {
	var condObj, actObj interface{}
	_ = json.Unmarshal([]byte(rule.Conditions), &condObj)
	_ = json.Unmarshal([]byte(rule.Actions), &actObj)
	return gin.H{
		"id":         rule.ID,
		"name":       rule.Name,
		"enabled":    rule.Enabled,
		"priority":   rule.Priority,
		"eventType":  rule.EventType,
		"conditions": condObj,
		"actions":    actObj,
		"createdAt":  rule.CreatedAt,
		"updatedAt":  rule.UpdatedAt,
	}
}

// ---- rule engine ----

// RunRuleEngine evaluates all enabled rules whose event_type matches, in
// priority order. Each rule records a ResearchRuleExecution regardless of
// outcome, and a single rule failing never blocks others.
func RunRuleEngine(db *gorm.DB, tenantID int64, eventType string, project models.ResearchProject, oldVerdict *string) {
	var rules []models.ResearchAutomationRule
	db.Where("tenant_id = ? AND enabled = ? AND event_type = ?", tenantID, true, eventType).
		Order("priority ASC, created_at ASC").Find(&rules)

	projName := projectName(project)

	for _, rule := range rules {
		matched := true
		var condErr error

		var conds []condNode
		if rule.Conditions != "" {
			if err := json.Unmarshal([]byte(rule.Conditions), &conds); err != nil {
				matched = false
				condErr = err
			} else {
				for _, cond := range conds {
					if !evalCondition(db, tenantID, project, cond) {
						matched = false
						break
					}
				}
			}
		}

		var actionResults []interface{}
		var actionErr error
		if matched && rule.Actions != "" {
			var acts []actionNode
			if err := json.Unmarshal([]byte(rule.Actions), &acts); err != nil {
				actionErr = err
			} else {
				for _, act := range acts {
					actionResults = append(actionResults, execAction(db, tenantID, project, projName, rule.Name, act))
				}
			}
		}

		resultsJSON := ""
		if b, err := json.Marshal(actionResults); err == nil {
			resultsJSON = string(b)
		}

		exec := models.ResearchRuleExecution{
			ResearchBase: models.ResearchBase{TenantID: tenantID},
			RuleID:       rule.ID,
			EventType:    eventType,
			ProjectID:    project.ID,
			Triggered:    true,
			Matched:      matched,
			ActionResults: resultsJSON,
		}
		if condErr != nil {
			s := condErr.Error()
			exec.Error = &s
		} else if actionErr != nil {
			s := actionErr.Error()
			exec.Error = &s
		}
		_ = db.Create(&exec).Error
	}
}

// evalCondition evaluates a single condition node against the project's current
// state.
func evalCondition(db *gorm.DB, tenantID int64, p models.ResearchProject, c condNode) bool {
	switch c.Field {
	case "verdict":
		return compareStr(strOrNil(p.Verdict), c.Value, c.Op)
	case "lifecycle":
		return compareStr(strOrNil(p.Lifecycle), c.Value, c.Op)
	case "clusterId":
		cur := ""
		if p.ClusterID != nil {
			cur = p.ClusterID.String()
		}
		return compareStr(cur, c.Value, c.Op)
	case "feasibilityIndex":
		return compareNum(p.FeasibilityIndex, c.Value, c.Op)
	case "authenticityStars":
		return compareNum(p.AuthenticityStars, c.Value, c.Op)
	case "tag":
		tagVal := fmt.Sprint(c.Value)
		var cnt int64
		db.Model(&models.ResearchProjectTag{}).
			Where("tenant_id = ? AND project_id = ? AND tag = ?", tenantID, p.ID, tagVal).
			Count(&cnt)
		has := cnt > 0
		if c.Op == "ne" {
			return !has
		}
		return has
	}
	return false
}

func toFloat(v interface{}) (float64, error) {
	switch t := v.(type) {
	case float64:
		return t, nil
	case float32:
		return float64(t), nil
	case int:
		return float64(t), nil
	case int64:
		return float64(t), nil
	case string:
		return strconv.ParseFloat(t, 64)
	}
	return 0, fmt.Errorf("not numeric")
}

func compareNum(cur *int, target interface{}, op string) bool {
	if cur == nil {
		return false
	}
	cf := float64(*cur)
	tf, err := toFloat(target)
	if err != nil {
		return compareStr(strconv.Itoa(*cur), target, op)
	}
	switch op {
	case "eq":
		return cf == tf
	case "ne":
		return cf != tf
	case "gte":
		return cf >= tf
	case "lte":
		return cf <= tf
	}
	return false
}

func compareStr(cur string, target interface{}, op string) bool {
	ts := fmt.Sprint(target)
	switch op {
	case "eq":
		return cur == ts
	case "ne":
		return cur != ts
	case "gte":
		if cf, e1 := strconv.ParseFloat(cur, 64); e1 == nil {
			if tf, e2 := toFloat(target); e2 == nil {
				return cf >= tf
			}
		}
		return strings.Compare(cur, ts) >= 0
	case "lte":
		if cf, e1 := strconv.ParseFloat(cur, 64); e1 == nil {
			if tf, e2 := toFloat(target); e2 == nil {
				return cf <= tf
			}
		}
		return strings.Compare(cur, ts) <= 0
	}
	return false
}

// execAction executes a single rule action via the shared projectsvc functions.
func execAction(db *gorm.DB, tenantID int64, project models.ResearchProject, projName, ruleName string, act actionNode) gin.H {
	res := gin.H{"type": act.Type, "ok": false}
	var err error
	switch act.Type {
	case "add_tag":
		tag := stringField(act.Payload, "tag")
		if tag == "" {
			err = errors.New("缺少 tag")
		} else {
			err = AddTag(db, tenantID, project.ID, tag, nil)
		}
	case "set_verdict":
		v := stringField(act.Payload, "verdict")
		err = SetVerdict(db, tenantID, project.ID, v)
	case "favorite":
		err = ToggleFavorite(db, tenantID, project.ID, true)
	case "set_lifecycle":
		lc := stringField(act.Payload, "lifecycle")
		err = PatchLifecycle(db, tenantID, project.ID, lc)
	case "notify":
		title := stringField(act.Payload, "title")
		if title == "" {
			title = ruleName + " 触发"
		}
		body := stringField(act.Payload, "body")
		if body == "" {
			body = "规则「" + ruleName + "」对《" + projName + "》执行了动作"
		}
		err = CreateNotification(db, tenantID, nil, "rule_notify", title, body, "project", project.ID.String())
	default:
		err = fmt.Errorf("未知动作类型: %s", act.Type)
	}
	if err != nil {
		res["error"] = err.Error()
	} else {
		res["ok"] = true
	}
	return res
}

func stringField(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok {
		return fmt.Sprint(v)
	}
	return ""
}
