package models_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/research"
	"github.com/siblingsl/xy-tool/research-server/internal/skill"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func testDSN() string {
	if v := os.Getenv("TEST_DSN"); v != "" {
		return v
	}
	return "host=127.0.0.1 port=5434 user=research password=research dbname=research sslmode=disable"
}

func TestHandlersAgainstPostgres(t *testing.T) {
	db, err := gorm.Open(postgres.Open(testDSN()), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	_ = db.Exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)
	if err := db.AutoMigrate(
		&models.User{},
		&models.ResearchCluster{},
		&models.ResearchProject{},
		&models.ResearchDailyReport{},
		&models.ResearchEmail{},
		&models.ResearchHeatPoint{},
		&models.ResearchProjectTag{},
		&models.ResearchProjectNote{},
		&models.ResearchSkill{},
		&models.ResearchSettings{},
		&models.ResearchNotification{},
		&models.ResearchPipelineJob{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	tenant := time.Now().UnixNano()%100000 + 1
	pid := uuid.New()
	emailID := uuid.New()

	email := models.ResearchEmail{
		ResearchBase:   models.ResearchBase{ID: emailID, TenantID: tenant},
		GmailMessageID: fmt.Sprintf("m-%d", tenant),
		Subject:        "hello",
		FromAddr:       "a@b.com",
		ReceivedAt:     time.Now(),
		Status:         "done",
	}
	if err := db.Create(&email).Error; err != nil {
		t.Fatalf("email: %v", err)
	}
	proj := models.ResearchProject{
		ResearchBase: models.ResearchBase{ID: pid, TenantID: tenant},
		EmailID:      emailID,
		CardJSON:     []byte(`{"name":"Demo"}`),
	}
	if err := db.Create(&proj).Error; err != nil {
		t.Fatalf("project: %v", err)
	}

	cl := models.ResearchCluster{
		ResearchBase: models.ResearchBase{TenantID: tenant},
		Key:          fmt.Sprintf("k-%d", tenant),
		Label:        "L",
		ProjectIDs:   models.UUIDArray{pid},
	}
	if err := db.Create(&cl).Error; err != nil {
		t.Fatalf("cluster create: %v", err)
	}
	var loaded models.ResearchCluster
	if err := db.Where("tenant_id = ? AND key = ?", tenant, cl.Key).First(&loaded).Error; err != nil {
		t.Fatalf("cluster load: %v", err)
	}
	if len(loaded.ProjectIDs) != 1 || loaded.ProjectIDs[0] != pid {
		t.Fatalf("cluster ProjectIDs=%v", loaded.ProjectIDs)
	}

	rep := models.ResearchDailyReport{
		ResearchBase: models.ResearchBase{TenantID: tenant},
		ReportDate:   time.Now().UTC().Truncate(24 * time.Hour),
		SummaryJSON:  []byte(`{"total":1}`),
		ProjectIDs:   models.UUIDArray{pid},
	}
	if err := db.Create(&rep).Error; err != nil {
		t.Fatalf("report create: %v", err)
	}

	// Empty config_json must not break /skills JSON encoding
	if err := db.Create(&models.ResearchSkill{
		ResearchBase: models.ResearchBase{TenantID: tenant},
		SkillKey:     "classify",
		Enabled:      true,
		Priority:     1,
		ConfigJSON:   []byte{},
	}).Error; err != nil {
		t.Fatalf("skill: %v", err)
	}

	gin.SetMode(gin.TestMode)
	tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.Claims{
		Sub: tenant, Username: "t", TenantID: tenant, Role: "user", Type: "access",
	}).SignedString([]byte("test-secret"))

	r := gin.New()
	api := r.Group("/api/research")
	auth := middleware.AuthRequired("test-secret")
	research.NewClustersHandler(db).RegisterRoutes(api, auth)
	research.NewReportsHandler(db, nil).RegisterRoutes(api, auth)
	research.NewProjectsHandler(db, nil).RegisterRoutes(api, auth)
	research.NewEmailsHandler(db).RegisterRoutes(api, auth)
	research.NewAggregateHandler(db).RegisterRoutes(api, auth)
	research.NewNotificationHandler(db).RegisterRoutes(api, auth)
	research.NewSettingsHandler(db).RegisterRoutes(api, auth)
	research.NewSkillsHandler(db, skill.DefaultRegistry()).RegisterRoutes(api, auth)
	research.NewJobsHandler(db, nil).RegisterRoutes(api, auth)

	paths := []string{
		"/api/research/clusters",
		"/api/research/clusters/" + cl.Key,
		"/api/research/reports",
		"/api/research/projects?pageSize=1",
		"/api/research/emails?pageSize=1",
		"/api/research/trends?scope=all",
		"/api/research/workbench",
		"/api/research/notifications/unread-count",
		"/api/research/settings",
		"/api/research/analytics/maturity",
		"/api/research/skills",
		"/api/research/jobs",
	}
	for _, p := range paths {
		req := httptest.NewRequest(http.MethodGet, p, nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code >= 500 {
			t.Errorf("%s -> %d %s", p, w.Code, w.Body.String())
			continue
		}
		var env struct {
			Code int             `json:"code"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Errorf("%s invalid json: %v body=%s", p, err, w.Body.String())
		}
	}
}
