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

	authSvc := auth.NewService(gormDB, cfg)
	authHandler := auth.NewHandler(authSvc)

	healthHandler := research.NewHealthHandler()
	emailsHandler := research.NewEmailsHandler(gormDB)
	projectsHandler := research.NewProjectsHandler(gormDB, worker)
	reportsHandler := research.NewReportsHandler(gormDB, worker)
	jobsHandler := research.NewJobsHandler(gormDB, worker)
	settingsHandler := research.NewSettingsHandler(gormDB)

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
	jobsHandler.RegisterRoutes(researchGroup, jwtAuth)
	settingsHandler.RegisterRoutes(researchGroup, jwtAuth)

	addr := ":" + cfg.Port
	log.Printf("research-server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server: %v", err)
	}
}
