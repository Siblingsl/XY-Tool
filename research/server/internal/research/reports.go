package research

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/queue"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)



type ReportsHandler struct {
	db     *gorm.DB
	worker *queue.Worker
}

func NewReportsHandler(db *gorm.DB, worker *queue.Worker) *ReportsHandler {
	return &ReportsHandler{db: db, worker: worker}
}

func (h *ReportsHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/reports", auth, h.list)
	rg.GET("/reports/:date", auth, h.getByDate)
	rg.GET("/reports/:date/groups", auth, h.groups)
	rg.POST("/reports/generate", auth, h.generate)
}

func (h *ReportsHandler) list(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	q := h.db.Where("tenant_id = ?", tenantID)

	if from := c.Query("from"); from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			q = q.Where("report_date >= ?", t)
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			q = q.Where("report_date <= ?", t)
		}
	}

	var reports []models.ResearchDailyReport
	q.Order("report_date DESC").Limit(30).Find(&reports)
	response.OK(c, reports)
}

func (h *ReportsHandler) getByDate(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	dateStr := c.Param("date")
	reportDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的日期格式")
		return
	}

	var report models.ResearchDailyReport
	if err := h.db.Where("tenant_id = ? AND report_date = ?", tenantID, reportDate).First(&report).Error; err != nil {
		response.OK(c, nil)
		return
	}
	response.OK(c, report)
}

func (h *ReportsHandler) groups(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	dateStr := c.Param("date")
	reportDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "无效的日期格式")
		return
	}

	var report models.ResearchDailyReport
	if err := h.db.Where("tenant_id = ? AND report_date = ?", tenantID, reportDate).First(&report).Error; err != nil {
		response.OK(c, gin.H{"do": []gin.H{}, "watch": []gin.H{}, "skip": []gin.H{}})
		return
	}
	if len(report.ProjectIDs) == 0 {
		response.OK(c, gin.H{"do": []gin.H{}, "watch": []gin.H{}, "skip": []gin.H{}})
		return
	}

	var projects []models.ResearchProject
	h.db.Where("tenant_id = ? AND id IN ?", tenantID, []uuid.UUID(report.ProjectIDs)).Find(&projects)

	do, watch, skip := []gin.H{}, []gin.H{}, []gin.H{}
	for _, p := range projects {
		verdict := ""
		if p.Verdict != nil {
			verdict = *p.Verdict
		}
		item := gin.H{"id": p.ID, "name": projectName(p), "verdict": p.Verdict}
		switch verdict {
		case "do":
			do = append(do, item)
		case "watch":
			watch = append(watch, item)
		default:
			skip = append(skip, item)
		}
	}
	response.OK(c, gin.H{"do": do, "watch": watch, "skip": skip})
}

func (h *ReportsHandler) generate(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	today := time.Now().UTC().Truncate(24 * time.Hour)

	var existing models.ResearchDailyReport
	if err := h.db.Where("tenant_id = ? AND report_date = ?", tenantID, today).First(&existing).Error; err == nil {
		response.OK(c, existing)
		return
	}

	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Stage:        "report",
		Status:       "done",
	}
	_ = h.db.Create(&job)

	report := h.buildReport(tenantID, today)
	response.OK(c, report)
}

// buildReport aggregates the tenant's real project data into a daily report.
func (h *ReportsHandler) buildReport(tenantID int64, date time.Time) models.ResearchDailyReport {
	var projects []models.ResearchProject
	h.db.Where("tenant_id = ?", tenantID).Find(&projects)

	total := len(projects)
	do, watch, skip := 0, 0, 0
	projectIDs := make(models.UUIDArray, 0, total)
	for _, p := range projects {
		projectIDs = append(projectIDs, p.ID)
		switch strOrNil(p.Verdict) {
		case "do":
			do++
		case "watch":
			watch++
		case "skip":
			skip++
		default:
			skip++
		}
	}

	summary := map[string]interface{}{
		"total":         total,
		"do":            do,
		"watch":         watch,
		"skip":          skip,
		"newDirections": total, // every analyzed project is a fresh direction for the day
		"date":          date.Format("2006-01-02"),
	}
	raw, _ := json.Marshal(summary)

	body := renderReportMarkdown(date, total, do, watch, skip, projects)

	report := models.ResearchDailyReport{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ReportDate:   date,
		SummaryJSON:  datatypes.JSON(raw),
		BodyMD:       &body,
		ProjectIDs:   projectIDs,
	}
	_ = h.db.Where("tenant_id = ? AND report_date = ?", tenantID, date).FirstOrCreate(&report).Error
	return report
}

// renderReportMarkdown builds a human-readable daily digest from real data.
func renderReportMarkdown(date time.Time, total, do, watch, skip int, projects []models.ResearchProject) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# 每日研究简报 · %s\n\n", date.Format("2006-01-02"))
	fmt.Fprintf(&b, "共分析 **%d** 个项目：建议做 **%d**，观察 **%d**，放弃/待定 **%d**。\n\n", total, do, watch, skip)

	if do > 0 {
		b.WriteString("## 建议做\n\n")
		for _, p := range projects {
			if strOrNil(p.Verdict) != "do" {
				continue
			}
			fmt.Fprintf(&b, "- %s — 落地指数 %s\n", projectName(p), intOrEmpty(p.FeasibilityIndex))
		}
		b.WriteString("\n")
	}
	if watch > 0 {
		b.WriteString("## 值得观察\n\n")
		for _, p := range projects {
			if strOrNil(p.Verdict) != "watch" {
				continue
			}
			fmt.Fprintf(&b, "- %s — 落地指数 %s\n", projectName(p), intOrEmpty(p.FeasibilityIndex))
		}
		b.WriteString("\n")
	}
	if skip > 0 {
		b.WriteString("## 暂缓/放弃\n\n")
		for _, p := range projects {
			v := strOrNil(p.Verdict)
			if v == "do" || v == "watch" {
				continue
			}
			fmt.Fprintf(&b, "- %s\n", projectName(p))
		}
		b.WriteString("\n")
	}
	return b.String()
}
