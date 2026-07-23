package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/siblingsl/xy-tool/research-server/internal/auth"
	"github.com/siblingsl/xy-tool/research-server/internal/config"
	"github.com/siblingsl/xy-tool/research-server/internal/db"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/queue"
	"github.com/siblingsl/xy-tool/research-server/internal/research"
	"github.com/siblingsl/xy-tool/research-server/internal/skill"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	gormDB, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	if err := db.AutoMigrate(gormDB); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	gmailHandler := research.NewGmailHandler(gormDB, cfg, nil)
	worker := queue.NewWorker(gormDB, gmailHandler)
	gmailHandler.SetWorker(worker)

	// Skill 引擎
	skillRegistry := skill.DefaultRegistry()
	skillExecutor := skill.NewExecutor(gormDB, skillRegistry)
	worker.SetSkillRunner(skillExecutor)

	authSvc := auth.NewService(gormDB, cfg)
	authHandler := auth.NewHandler(authSvc)

	healthHandler := research.NewHealthHandler()
	emailsHandler := research.NewEmailsHandler(gormDB)
	projectsHandler := research.NewProjectsHandler(gormDB, worker)
	reportsHandler := research.NewReportsHandler(gormDB, worker)
	clustersHandler := research.NewClustersHandler(gormDB)
	tagsHandler := research.NewTagsHandler(gormDB)
	notesHandler := research.NewNotesHandler(gormDB)
	aggregateHandler := research.NewAggregateHandler(gormDB)
	compareHandler := research.NewCompareHandler(gormDB)
	notificationHandler := research.NewNotificationHandler(gormDB)
	competitorHandler := research.NewCompetitorHandler(gormDB)
	automationHandler := research.NewAutomationHandler(gormDB)
	knowledgeHandler := research.NewKnowledgeHandler(gormDB)
	similarHandler := research.NewSimilarHandler(gormDB)
	scrapeHandler := research.NewScrapeHandler(gormDB)
	jobsHandler := research.NewJobsHandler(gormDB, worker)
	settingsHandler := research.NewSettingsHandler(gormDB)
	skillsHandler := research.NewSkillsHandler(gormDB, skillRegistry)

	if cfg.JWTSecret == "" {
		log.Println("warning: JWT_SECRET is not set")
	}

	r := gin.Default()
	r.Use(middleware.CORS(cfg.CORSOrigins))

	api := r.Group("/api")
	authGroup := api.Group("/auth")
	authHandler.RegisterRoutes(authGroup)

	researchGroup := api.Group("/research")
	jwtAuth := middleware.AuthRequired(cfg.JWTSecret)

	healthHandler.RegisterRoutes(researchGroup)
	gmailHandler.RegisterRoutes(researchGroup, jwtAuth)
	emailsHandler.RegisterRoutes(researchGroup, jwtAuth)
	projectsHandler.RegisterRoutes(researchGroup, jwtAuth)
	reportsHandler.RegisterRoutes(researchGroup, jwtAuth)
	clustersHandler.RegisterRoutes(researchGroup, jwtAuth)
	tagsHandler.RegisterRoutes(researchGroup, jwtAuth)
	notesHandler.RegisterRoutes(researchGroup, jwtAuth)
	aggregateHandler.RegisterRoutes(researchGroup, jwtAuth)
	notificationHandler.RegisterRoutes(researchGroup, jwtAuth)
	competitorHandler.RegisterRoutes(researchGroup, jwtAuth)
	automationHandler.RegisterRoutes(researchGroup, jwtAuth)
	knowledgeHandler.RegisterRoutes(researchGroup, jwtAuth)
	similarHandler.RegisterRoutes(researchGroup, jwtAuth)
	scrapeHandler.RegisterRoutes(researchGroup, jwtAuth)
	compareHandler.RegisterRoutes(researchGroup, jwtAuth)
	jobsHandler.RegisterRoutes(researchGroup, jwtAuth)
	settingsHandler.RegisterRoutes(researchGroup, jwtAuth)
	skillsHandler.RegisterRoutes(researchGroup, jwtAuth)

	// 定时网页抓取调度器（周期扫描 enabled 任务，落库到知识库）
	research.StartScheduler(gormDB)

	addr := ":" + cfg.Port
	log.Printf("research-server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server: %v", err)
	}
}
