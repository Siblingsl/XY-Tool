package db

import (
	"fmt"

	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("connect database: %w", err)
	}

	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).Error; err != nil {
		return nil, fmt.Errorf("ensure pgcrypto extension: %w", err)
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.ResearchGmailAccount{},
		&models.ResearchEmail{},
		&models.ResearchCluster{},
		&models.ResearchProject{},
		&models.ResearchEvidence{},
		&models.ResearchCompetitor{},
		&models.ResearchProjectTag{},
		&models.ResearchProjectNote{},
		&models.ResearchHeatPoint{},
		&models.ResearchDailyReport{},
		&models.ResearchPipelineJob{},
		&models.ResearchSettings{},
		&models.ResearchSkill{},
		&models.ResearchSkillResult{},
		&models.ResearchNotification{},
		&models.ResearchCompetitorWatch{},
		&models.ResearchCompetitorHit{},
		&models.ResearchAutomationRule{},
		&models.ResearchRuleExecution{},
		&models.ResearchKnowledgeItem{},
		&models.ResearchScrapeJob{},
	)
}
