package research

import (
	"errors"

	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"gorm.io/gorm"
)

// Package-level reusable project mutations shared by the project handlers and
// the automation rule engine, to avoid duplicated GORM code paths.

// SetVerdict validates (loose: non-empty) and updates a project's verdict.
func SetVerdict(db *gorm.DB, tenantID int64, projectID uuid.UUID, verdict string) error {
	if verdict == "" {
		return errors.New("verdict 不能为空")
	}
	return db.Model(&models.ResearchProject{}).
		Where("id = ? AND tenant_id = ?", projectID, tenantID).
		Update("verdict", verdict).Error
}

// PatchLifecycle validates against the known lifecycle values and updates it.
func PatchLifecycle(db *gorm.DB, tenantID int64, projectID uuid.UUID, lifecycle string) error {
	if !validLifecycles[lifecycle] {
		return errors.New("无效的 lifecycle 取值")
	}
	return db.Model(&models.ResearchProject{}).
		Where("id = ? AND tenant_id = ?", projectID, tenantID).
		Update("lifecycle", lifecycle).Error
}

// ToggleFavorite sets the favorited flag to the given value.
func ToggleFavorite(db *gorm.DB, tenantID int64, projectID uuid.UUID, val bool) error {
	return db.Model(&models.ResearchProject{}).
		Where("id = ? AND tenant_id = ?", projectID, tenantID).
		Update("favorited", val).Error
}

// AddTag attaches a tag to a project, de-duplicating against the unique index.
func AddTag(db *gorm.DB, tenantID int64, projectID uuid.UUID, tag string, userID *int64) error {
	var existing models.ResearchProjectTag
	err := db.Where("tenant_id = ? AND project_id = ? AND tag = ?", tenantID, projectID, tag).First(&existing).Error
	if err == nil {
		return nil // already exists
	} else if err != gorm.ErrRecordNotFound {
		return err
	}

	row := models.ResearchProjectTag{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		ProjectID:    projectID,
		Tag:          tag,
	}
	if userID != nil {
		u := *userID
		row.UserID = &u
	}
	return db.Create(&row).Error
}
